import { adminDb } from "@/lib/firebase-admin";
import type { Severity6 } from "@/types/severity";
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
  inspectionId: string | null;
  source: string | null;
}

export interface CorrectiveWorkOrderView {
  id: string;
  osId: string;
  ncId: string | null;
  ncDescription: string | null;
  description: string | null;
  area: string | null;
  effectiveSeverity: Severity | null;
  scheduledDate: string | null;
  status: string | null;
  updatedAt: string | null;
  owner: string | null;
  maintainer1: string | null;
  maintainer2: string | null;
  assignees: {
    owner: string | null;
    maintainer1: string | null;
    maintainer2: string | null;
  } | null;
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
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6) {
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

export type Severity = Severity6;

export interface CorrectiveAssignees {
  owner: string;
  maintainer1?: string;
  maintainer2?: string;
}

export interface ScheduleNcContext {
  description?: string | null;
  area?: string | null;
  effectiveSeverity?: Severity | null;
  severity?: {
    signer?: Severity | null;
    maintainer?: Severity | null;
  } | null;
  inspectionId?: string | null;
  source?: string | null;
}

export async function listOpenNCsView(params: {
  area?: string;
  severity?: Severity;
  source?: string;
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

  if (params.source) {
    query = query.where("source", "==", params.source);
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
    const inspectionId = typeof data.inspectionId === "string" ? data.inspectionId : null;
    const source = typeof data.source === "string" ? data.source : null;
    return {
      id: doc.id,
      ncId: typeof data.ncId === "string" ? data.ncId : doc.id,
      description,
      area,
      effectiveSeverity: severity,
      updatedAt,
      status,
      inspectionId,
      source,
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
  ncContext?: ScheduleNcContext | null;
}): Promise<{ osId: string }> {
  const now = nowIso();
  const scheduledDate = normalizeIsoInput(input.scheduledDate);
  const dueDate = normalizeIsoInput(input.dueDate);

  const result = await adminDb.runTransaction(async tx => {
    const ncId = input.ncId?.trim() || null;
    const ncContext = input.ncContext ?? null;

    let fetchedNc: CorrectiveNonConformityRecord | undefined;
    const ncRef = ncId ? correctiveNonConformitiesCollection.doc(ncId) : null;

    if (ncId && !ncContext && ncRef) {
      const snapshot = await tx.get(ncRef);
      if (snapshot.exists) {
        fetchedNc = snapshot.data() as CorrectiveNonConformityRecord;
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

    const baseStatus = (osSnapshot?.get("status") as string | undefined) ?? "scheduled";
    const baseCreatedAt = (osSnapshot?.get("createdAt") as string | undefined) ?? now;

    const contextSeverityValue = extractSeverity(ncContext?.effectiveSeverity ?? null);
    const contextSeverity =
      ncContext?.severity ??
      (contextSeverityValue ? { maintainer: contextSeverityValue } : null);
    const fetchedSeverity = fetchedNc?.severity ?? null;
    const normalizedSeverity = contextSeverity ?? fetchedSeverity ?? null;
    const descriptionFromNc =
      typeof (ncContext?.description ?? fetchedNc?.description) === "string"
        ? (ncContext?.description ?? fetchedNc?.description)
        : null;

    const osPayload: CorrectiveWorkOrderRecord & {
      assignees: CorrectiveAssignees;
      createdAt: string;
      dueDate: string | null;
      description: string | null;
    } = {
      type: "corrective",
      status: baseStatus,
      scheduledDate,
      updatedAt: now,
      ncId,
      ncDescription: descriptionFromNc ?? input.description ?? null,
      area: input.area,
      severity: normalizedSeverity,
      assignees: input.assignees,
      dueDate,
      description: input.description ?? descriptionFromNc ?? null,
      createdAt: baseCreatedAt,
    };

    tx.set(osRef, osPayload, { merge: true });

    let ncUpdate:
      | (CorrectiveNonConformityRecord & { linkedCorrectiveOsId: string; updatedAt: string })
      | null = null;

    if (ncId && ncRef) {
      const baseArea = ncContext?.area ?? fetchedNc?.area ?? input.area;
      const baseDescription = descriptionFromNc ?? input.description ?? fetchedNc?.description ?? null;
      const baseInspectionId = ncContext?.inspectionId ?? fetchedNc?.inspectionId ?? null;
      const baseSource = ncContext?.source ?? fetchedNc?.source ?? (baseInspectionId ? "inspection" : null);

      ncUpdate = {
        status: "PROGRAMADA",
        severity: normalizedSeverity,
        description: baseDescription,
        area: baseArea,
        updatedAt: now,
        linkedCorrectiveOsId: osRef.id,
        scheduledDate,
        inspectionId: baseInspectionId,
        source: baseSource,
      };

      tx.set(ncRef, ncUpdate, { merge: true });
    }

    return { osId: osRef.id, ncId, osPayload, ncUpdate };
  });

  await syncCorrectiveWorkOrderView(result.osId, result.osPayload);

  if (result.ncId && result.ncUpdate) {
    await syncOpenNonConformityView(result.ncId, result.ncUpdate);
  }

  if (result.ncId) {
    await linkNcToOs(result.ncId, result.osId);
  }

  return { osId: result.osId };
}

export async function listCorrectiveWOView(params: {
  from?: string;
  to?: string;
  area?: string;
  status?: string;
  responsible?: string;
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

  if (params.responsible) {
    query = query.where("owner", "==", params.responsible);
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
    const description = typeof data.description === "string" ? data.description : ncDescription;
    const owner = typeof data.owner === "string" ? data.owner : null;
    const maintainer1 = typeof data.maintainer1 === "string" ? data.maintainer1 : null;
    const maintainer2 = typeof data.maintainer2 === "string" ? data.maintainer2 : null;
    const hasAssignee = Boolean(owner || maintainer1 || maintainer2);
    return {
      id: doc.id,
      osId: typeof data.osId === "string" ? data.osId : doc.id,
      ncId: typeof data.ncId === "string" ? data.ncId : null,
      ncDescription,
      description,
      area,
      effectiveSeverity: severity,
      scheduledDate,
      status,
      updatedAt,
      owner,
      maintainer1,
      maintainer2,
      assignees: hasAssignee
        ? {
            owner,
            maintainer1,
            maintainer2,
          }
        : null,
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
      severity?:
        | {
            signer?: Severity | null;
            maintainer?: Severity | null;
          }
        | null;
    };

export function getEffectiveSeverity(nc: NcWithSeverity): Severity | null {
  return extractSeverity(nc?.severity?.signer ?? nc?.severity?.maintainer ?? null);
}

export async function linkNcToOs(ncId: string, osId: string) {
  await correctiveNonConformitiesCollection.doc(ncId).set(
    {
      linkedCorrectiveOsId: osId,
    },
    { merge: true }
  );
}
