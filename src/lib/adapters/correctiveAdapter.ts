import { adminDb } from "@/lib/firebase-admin";
import {
  syncCorrectiveWorkOrderView,
  syncOpenNonConformityView,
  type CorrectiveNonConformityRecord,
  type CorrectiveWorkOrderRecord,
} from "@/lib/db/corrective-views";

const correctiveNonConformitiesCollection = adminDb.collection("corrective_nonConformities");
const correctiveWorkOrdersCollection = adminDb.collection("corrective_workOrders");
const correctiveNcOpenViewCollection = adminDb.collection("views_nc_open");
const correctiveWorkOrderViewCollection = adminDb.collection("views_os_corrective");

const MAX_PAGE_SIZE = 50;

interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CorrectiveOpenNcView {
  id: string;
  ncId: string;
  description: string | null;
  area: string | null;
  effectiveSeverity: Severity | null;
  updatedAt: string | null;
  status: string | null;
}

export interface CorrectiveWorkOrderView {
  id: string;
  osId: string;
  ncId: string | null;
  ncDescription: string | null;
  area: string | null;
  effectiveSeverity: Severity | null;
  scheduledDate: string | null;
  status: string | null;
  updatedAt: string | null;
}

function clampLimit(value: number | null | undefined, fallback: number) {
  if (!value || Number.isNaN(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), MAX_PAGE_SIZE);
}

async function resolveCursor(
  collection: FirebaseFirestore.CollectionReference,
  cursor?: string | null
) {
  if (!cursor) {
    return null;
  }

  const snapshot = await collection.doc(cursor).get();
  return snapshot.exists ? snapshot : null;
}

function extractSeverity(value: unknown): Severity | null {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }
  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeIsoInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface CorrectiveAssignees {
  owner: string;
  maintainer1?: string;
  maintainer2?: string;
}

export async function listOpenNCsView(params: {
  area?: string;
  severity?: Severity;
  limit: number;
  cursor?: string;
}): Promise<PaginatedResult<CorrectiveOpenNcView>> {
  const limit = clampLimit(params.limit, 20);

  let query: FirebaseFirestore.Query = correctiveNcOpenViewCollection
    .orderBy("effectiveSeverity", "desc")
    .orderBy("updatedAt", "desc");

  if (params.area) {
    query = query.where("area", "==", params.area);
  }

  if (params.severity) {
    query = query.where("effectiveSeverity", "==", params.severity);
  }

  const cursorSnapshot = await resolveCursor(correctiveNcOpenViewCollection, params.cursor);
  if (cursorSnapshot) {
    query = query.startAfter(cursorSnapshot);
  }

  const snapshot = await query.limit(limit).get();
  const items: CorrectiveOpenNcView[] = snapshot.docs.map(doc => {
    const data = doc.data();
    const severity = extractSeverity(data.effectiveSeverity);
    const description = typeof data.description === "string" ? data.description : null;
    const area = typeof data.area === "string" ? data.area : null;
    const status = typeof data.status === "string" ? data.status : null;
    const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;
    return {
      id: doc.id,
      ncId: typeof data.ncId === "string" ? data.ncId : doc.id,
      description,
      area,
      effectiveSeverity: severity,
      updatedAt,
      status,
    };
  });

  const hasMore = snapshot.size === limit;
  const nextCursor = hasMore ? snapshot.docs[snapshot.docs.length - 1]?.id ?? null : null;

  return { items, nextCursor };
}

export async function createOrUpdateCorrectiveWO(input: {
  ncId?: string;
  description?: string;
  area: "mechanical" | "electrical";
  assignees: CorrectiveAssignees;
  scheduledDate: string;
  dueDate?: string;
}): Promise<{ osId: string }> {
  const now = nowIso();

  const result = await adminDb.runTransaction(async tx => {
    const ncId = input.ncId?.trim() || null;
    let ncSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;

    if (ncId) {
      const ncRef = correctiveNonConformitiesCollection.doc(ncId);
      const snapshot = await tx.get(ncRef);
      if (snapshot.exists) {
        ncSnapshot = snapshot;
      }
    }

    let osRef: FirebaseFirestore.DocumentReference | null = null;
    let osSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;

    if (ncId) {
      const existingQuery = correctiveWorkOrdersCollection.where("ncId", "==", ncId).limit(1);
      const existing = await tx.get(existingQuery);
      if (!existing.empty) {
        osSnapshot = existing.docs[0];
        osRef = osSnapshot.ref;
      }
    }

    if (!osRef) {
      osRef = correctiveWorkOrdersCollection.doc();
    }

    const ncData = ncSnapshot?.data() as CorrectiveNonConformityRecord | undefined;
    const severityValue = ncData ? extractSeverity(getEffectiveSeverity(ncData) as Severity) : null;
    const normalizedSeverity = ncData?.severity ?? (severityValue ? { maintainer: severityValue } : null);
    const descriptionFromNc =
      typeof ncData?.description === "string" && ncData.description.trim().length > 0
        ? ncData.description
        : null;

    const baseStatus = (osSnapshot?.get("status") as string | undefined) ?? "scheduled";
    const baseCreatedAt =
      (osSnapshot?.get("createdAt") as string | undefined) ?? now;

    const payload: CorrectiveWorkOrderRecord & {
      assignees: CorrectiveAssignees;
      createdAt: string;
      dueDate: string | null;
      description: string | null;
    } = {
      type: "corrective",
      status: baseStatus,
      scheduledDate: normalizeIsoInput(input.scheduledDate),
      updatedAt: now,
      ncId,
      ncDescription: descriptionFromNc ?? input.description ?? null,
      area: input.area,
      severity: normalizedSeverity,
      assignees: input.assignees,
      dueDate: normalizeIsoInput(input.dueDate),
      description: input.description ?? descriptionFromNc ?? null,
      createdAt: baseCreatedAt,
    };

    tx.set(osRef, payload, { merge: true });

    if (ncId) {
      const ncRef = correctiveNonConformitiesCollection.doc(ncId);
      const ncUpdate: CorrectiveNonConformityRecord & {
        linkedCorrectiveOsId: string;
        updatedAt: string;
      } = {
        status: "scheduled",
        severity: ncData?.severity ?? normalizedSeverity,
        description: ncData?.description ?? descriptionFromNc ?? input.description ?? null,
        area: ncData?.area ?? input.area,
        updatedAt: now,
        linkedCorrectiveOsId: osRef.id,
      };

      tx.set(ncRef, ncUpdate, { merge: true });
    }

    return { osId: osRef.id, ncId };
  });

  const osSnapshot = await correctiveWorkOrdersCollection.doc(result.osId).get();
  if (osSnapshot.exists) {
    await syncCorrectiveWorkOrderView(
      result.osId,
      osSnapshot.data() as CorrectiveWorkOrderRecord
    );
  }

  if (result.ncId) {
    const ncSnapshot = await correctiveNonConformitiesCollection.doc(result.ncId).get();
    if (ncSnapshot.exists) {
      await syncOpenNonConformityView(
        result.ncId,
        ncSnapshot.data() as CorrectiveNonConformityRecord
      );
    }
    await linkNcToOs(result.ncId, result.osId);
  }

  return { osId: result.osId };
}

export async function listCorrectiveWOView(params: {
  from?: string;
  to?: string;
  area?: string;
  status?: string;
  limit: number;
  cursor?: string;
}): Promise<PaginatedResult<CorrectiveWorkOrderView>> {
  const limit = clampLimit(params.limit, 20);

  let query: FirebaseFirestore.Query = correctiveWorkOrderViewCollection
    .orderBy("scheduledDate", "desc")
    .orderBy("updatedAt", "desc");

  if (params.area) {
    query = query.where("area", "==", params.area);
  }

  if (params.status) {
    query = query.where("status", "==", params.status);
  }

  if (params.from) {
    query = query.where("scheduledDate", ">=", params.from);
  }

  if (params.to) {
    query = query.where("scheduledDate", "<=", params.to);
  }

  const cursorSnapshot = await resolveCursor(correctiveWorkOrderViewCollection, params.cursor);
  if (cursorSnapshot) {
    query = query.startAfter(cursorSnapshot);
  }

  const snapshot = await query.limit(limit).get();
  const items: CorrectiveWorkOrderView[] = snapshot.docs.map(doc => {
    const data = doc.data();
    const severity = extractSeverity(data.effectiveSeverity);
    const area = typeof data.area === "string" ? data.area : null;
    const status = typeof data.status === "string" ? data.status : null;
    const scheduledDate = typeof data.scheduledDate === "string" ? data.scheduledDate : null;
    const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;
    const ncDescription = typeof data.ncDescription === "string" ? data.ncDescription : null;
    return {
      id: doc.id,
      osId: typeof data.osId === "string" ? data.osId : doc.id,
      ncId: typeof data.ncId === "string" ? data.ncId : null,
      ncDescription,
      area,
      effectiveSeverity: severity,
      scheduledDate,
      status,
      updatedAt,
    };
  });

  const hasMore = snapshot.size === limit;
  const nextCursor = hasMore ? snapshot.docs[snapshot.docs.length - 1]?.id ?? null : null;

  return { items, nextCursor };
}

type NcWithSeverity =
  | undefined
  | null
  | {
      severity?: {
        signer?: Severity;
        maintainer?: Severity;
      };
    };

export function getEffectiveSeverity(nc: NcWithSeverity): Severity {
  return (nc?.severity?.signer ?? nc?.severity?.maintainer) as Severity;
}

export async function linkNcToOs(ncId: string, osId: string) {
  await correctiveNonConformitiesCollection.doc(ncId).set(
    {
      linkedCorrectiveOsId: osId,
    },
    { merge: true }
  );
}
