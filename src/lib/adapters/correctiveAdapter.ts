import { adminDb } from "@/lib/firebase-admin";
import type { StoredImage } from "@/types";
import type { Severity6 } from "@/types/severity";
import {
  normalizeArea,
  syncCorrectiveWorkOrderView,
  syncOpenNonConformityView,
  type CorrectiveNonConformityRecord,
  type CorrectiveWorkOrderRecord,
} from "@/lib/db/corrective-views";

const correctiveNonConformitiesCollection = adminDb.collection("corrective_nonConformities");
const correctiveWorkOrdersCollection = adminDb.collection("corrective_workOrders");
const correctiveNcOpenViewCollection = adminDb.collection("views_nc_open");
const correctiveWorkOrderViewCollection = adminDb.collection("views_os_corrective");
const legacyIssuesCollection = adminDb.collection("issues");
const machinesCollection = adminDb.collection("machines");

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
  machineId: string | null;
  machineTag: string | null;
  machineName: string | null;
  osNumero: string | null;
  photos: StoredImage[] | null;
  questionId: string | null;
  questionLabel: string | null;
  inspectionResponseId: string | null;
  templateId: string | null;
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
  dueDate: string | null;
  status: string | null;
  updatedAt: string | null;
  owner: string | null;
  maintainer1: string | null;
  maintainer2: string | null;
  mantenedoresIds: string[] | null;
  assignees: {
    owner: string | null;
    maintainer1: string | null;
    maintainer2: string | null;
  } | null;
  completedAt: string | null;
  completedBy: string | null;
  completedByName: string | null;
  completedByMatricula: string | null;
  completionNotes: string | null;
  machineId: string | null;
  machineTag: string | null;
  machineName: string | null;
  ncPhotos: StoredImage[] | null;
  inspectionId: string | null;
  inspectionResponseId: string | null;
  templateId: string | null;
  questionId: string | null;
  questionLabel: string | null;
  osNumero: string | null;
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

function normalizeOsNumero(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase();
}

async function fetchLegacyOpenNcPage(params: {
  area?: string;
  severity?: Severity;
  limit: number;
  cursor?: string;
}): Promise<PaginatedResult<CorrectiveOpenNcView>> {
  const limit = clampLimit(params.limit, 20);
  const fetchLimit = Math.min(limit * 3, MAX_PAGE_SIZE);

  let query: FirebaseFirestore.Query = legacyIssuesCollection
    .where("status", "in", ["aberta", "open", "pendente", "pending"])
    .orderBy("createdAt", "desc");

  const cursorSnapshot = await resolveCursor(legacyIssuesCollection, params.cursor);
  if (cursorSnapshot) {
    query = query.startAfter(cursorSnapshot);
  }

  const snapshot = await query.limit(fetchLimit).get();
  const machineCache = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  const items: CorrectiveOpenNcView[] = [];

  for (const doc of snapshot.docs) {
    if (items.length >= limit) {
      break;
    }

    const data = doc.data() ?? {};
    const mirrorSnap = await correctiveNonConformitiesCollection.doc(doc.id).get();
    const mirror = mirrorSnap.exists ? (mirrorSnap.data() as CorrectiveNonConformityRecord) : null;

    const machineId =
      (typeof mirror?.machineId === "string" && mirror.machineId) ||
      (typeof data.machineId === "string" ? data.machineId : null);

    let machineTag =
      (typeof mirror?.machineTag === "string" && mirror.machineTag) ||
      (typeof data.tag === "string" ? data.tag : null);
    let machineName =
      (typeof mirror?.machineName === "string" && mirror.machineName) ||
      (typeof data.machineNome === "string" ? data.machineNome : null);

    if (machineId && (!machineTag || !machineName)) {
      let machineSnapshot = machineCache.get(machineId);
      if (!machineSnapshot) {
        machineSnapshot = await machinesCollection.doc(machineId).get();
        machineCache.set(machineId, machineSnapshot);
      }
      if (machineSnapshot.exists) {
        const machineData = machineSnapshot.data() ?? {};
        if (!machineName && typeof machineData.nome === "string") {
          machineName = machineData.nome;
        }
        if (!machineTag && typeof machineData.tag === "string") {
          machineTag = machineData.tag;
        }
      }
    }

    const areaValue = normalizeArea(mirror?.area ?? (typeof data.area === "string" ? data.area : null));
    if (params.area && areaValue !== params.area) {
      continue;
    }

    const severityValue = extractSeverity(
      mirror?.severity?.signer ?? mirror?.severity?.maintainer ?? data.severity ?? null
    );
    if (params.severity && severityValue !== params.severity) {
      continue;
    }

    const updatedAt =
      (typeof mirror?.updatedAt === "string" && mirror.updatedAt) ||
      (typeof data.updatedAt === "string" ? data.updatedAt : null) ||
      (typeof data.createdAt === "string" ? data.createdAt : null);

    const inspectionId =
      (typeof mirror?.inspectionId === "string" && mirror.inspectionId) ||
      (typeof data.abertaEmInspecaoId === "string" ? data.abertaEmInspecaoId : null);

    const description =
      (typeof mirror?.description === "string" && mirror.description) ||
      (typeof data.descricao === "string" ? data.descricao : null);

    const questionId =
      (typeof mirror?.questionId === "string" && mirror.questionId) ||
      (typeof data.templateItemId === "string" ? data.templateItemId : null);

    const questionLabel =
      (typeof mirror?.questionLabel === "string" && mirror.questionLabel) ||
      null;

    const photos: StoredImage[] | null = mirror?.photos
      ? (mirror.photos as StoredImage[])
      : Array.isArray(data.fotos)
      ? (data.fotos as StoredImage[])
      : null;

    const osNumero =
      (typeof mirror?.osNumero === "string" && mirror.osNumero) ||
      (typeof data.osNumero === "string" ? data.osNumero : null);

    const inspectionResponseId =
      (typeof mirror?.inspectionResponseId === "string" && mirror.inspectionResponseId) ||
      (typeof data.inspectionResponseId === "string" ? data.inspectionResponseId : null);

    const templateId =
      (typeof mirror?.templateId === "string" && mirror.templateId) ||
      (typeof data.templateId === "string" ? data.templateId : null);

    const source =
      (typeof mirror?.source === "string" && mirror.source) || (inspectionId ? "inspection" : null);

    const record: CorrectiveNonConformityRecord = {
      description,
      area: areaValue,
      severity: mirror?.severity ?? (severityValue ? { maintainer: severityValue } : null),
      status: "open",
      updatedAt: updatedAt ?? new Date().toISOString(),
      inspectionId,
      source,
      machineId: machineId ?? null,
      machineTag: machineTag ?? null,
      machineName: machineName ?? null,
      photos,
      osNumero,
      questionId,
      questionLabel,
      inspectionResponseId,
      templateId,
    };

    if (!mirrorSnap.exists) {
      await correctiveNonConformitiesCollection.doc(doc.id).set(record, { merge: true });
    }
    await syncOpenNonConformityView(doc.id, record);

    items.push({
      id: doc.id,
      ncId: doc.id,
      description,
      area: areaValue,
      effectiveSeverity: severityValue,
      updatedAt: record.updatedAt ?? null,
      status: "open",
      inspectionId,
      source,
      machineId: machineId ?? null,
      machineTag: machineTag ?? null,
      machineName: machineName ?? null,
      osNumero,
      photos,
      questionId,
      questionLabel,
      inspectionResponseId,
      templateId,
    });
  }

  items.sort((a, b) => {
    const severityA = a.effectiveSeverity ?? 0;
    const severityB = b.effectiveSeverity ?? 0;
    if (severityA !== severityB) {
      return severityB - severityA;
    }
    const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return timeB - timeA;
  });

  const hasMore = snapshot.size === fetchLimit;
  const nextCursor = hasMore ? snapshot.docs[snapshot.docs.length - 1]?.id ?? null : null;

  return { items: items.slice(0, limit), nextCursor };
}

function mapWorkOrderSnapshot(
  doc: FirebaseFirestore.DocumentSnapshot
): CorrectiveWorkOrderView {
  const data = doc.data() ?? {};
  const severity = extractSeverity(data.effectiveSeverity);
  const area = typeof data.area === "string" ? data.area : null;
  const status = typeof data.status === "string" ? data.status : null;
  const scheduledDate = typeof data.scheduledDate === "string" ? data.scheduledDate : null;
  const dueDate = typeof data.dueDate === "string" ? data.dueDate : null;
  const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;
  const ncDescription = typeof data.ncDescription === "string" ? data.ncDescription : null;
  const description = typeof data.description === "string" ? data.description : ncDescription;
  const owner = typeof data.owner === "string" ? data.owner : null;
  const maintainer1 = typeof data.maintainer1 === "string" ? data.maintainer1 : null;
  const maintainer2 = typeof data.maintainer2 === "string" ? data.maintainer2 : null;
  const hasAssignee = Boolean(owner || maintainer1 || maintainer2);
  const mantenedoresIds = Array.isArray(data.mantenedoresIds)
    ? (data.mantenedoresIds as unknown[])
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const uniqueMantenedores = Array.from(
    new Set(
      [owner, maintainer1, maintainer2, ...mantenedoresIds].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );

  return {
    id: doc.id,
    osId: typeof data.osId === "string" ? data.osId : doc.id,
    ncId: typeof data.ncId === "string" ? data.ncId : null,
    ncDescription,
    description,
    area,
    effectiveSeverity: severity,
    scheduledDate,
    dueDate,
    status,
    updatedAt,
    owner,
    maintainer1,
    maintainer2,
    mantenedoresIds: uniqueMantenedores.length ? uniqueMantenedores : null,
    assignees: hasAssignee
      ? {
          owner,
          maintainer1,
          maintainer2,
        }
      : null,
    completedAt: typeof data.completedAt === "string" ? data.completedAt : null,
    completedBy: typeof data.completedBy === "string" ? data.completedBy : null,
    completedByName: typeof data.completedByName === "string" ? data.completedByName : null,
    completedByMatricula:
      typeof data.completedByMatricula === "string" ? data.completedByMatricula : null,
    completionNotes: typeof data.completionNotes === "string" ? data.completionNotes : null,
    machineId: typeof data.machineId === "string" ? data.machineId : null,
    machineTag: typeof data.machineTag === "string" ? data.machineTag : null,
    machineName: typeof data.machineName === "string" ? data.machineName : null,
    ncPhotos: Array.isArray(data.ncPhotos) ? (data.ncPhotos as StoredImage[]) : null,
    inspectionId: typeof data.inspectionId === "string" ? data.inspectionId : null,
    inspectionResponseId:
      typeof data.inspectionResponseId === "string" ? data.inspectionResponseId : null,
    templateId: typeof data.templateId === "string" ? data.templateId : null,
    questionId: typeof data.questionId === "string" ? data.questionId : null,
    questionLabel: typeof data.questionLabel === "string" ? data.questionLabel : null,
    osNumero: typeof data.osNumero === "string" ? data.osNumero : null,
  };
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
  machineId?: string | null;
  machineTag?: string | null;
  machineName?: string | null;
  osNumero?: string | null;
  photos?: StoredImage[] | null;
  questionId?: string | null;
  questionLabel?: string | null;
  inspectionResponseId?: string | null;
  templateId?: string | null;
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
    const machineId = typeof data.machineId === "string" ? data.machineId : null;
    const machineTag = typeof data.machineTag === "string" ? data.machineTag : null;
    const machineName = typeof data.machineName === "string" ? data.machineName : null;
    const osNumero = typeof data.osNumero === "string" ? data.osNumero : null;
    const photos = Array.isArray(data.photos) ? (data.photos as StoredImage[]) : null;
    const questionId = typeof data.questionId === "string" ? data.questionId : null;
    const questionLabel = typeof data.questionLabel === "string" ? data.questionLabel : null;
    const inspectionResponseId = typeof data.inspectionResponseId === "string" ? data.inspectionResponseId : null;
    const templateId = typeof data.templateId === "string" ? data.templateId : null;
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
      machineId,
      machineTag,
      machineName,
      osNumero,
      photos,
      questionId,
      questionLabel,
      inspectionResponseId,
      templateId,
    };
  });

  const hasMore = snapshot.size === limit;
  const nextCursor = hasMore ? snapshot.docs[snapshot.docs.length - 1]?.id ?? null : null;

  if (items.length === 0 && !params.cursor) {
    const legacyResult = await fetchLegacyOpenNcPage({
      area: params.area,
      severity: params.severity,
      limit,
      cursor: params.cursor,
    });

    if (legacyResult.items.length > 0) {
      return legacyResult;
    }
  }

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
  osNumero?: string;
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

    const baseArea = ncContext?.area ?? fetchedNc?.area ?? input.area;
    const normalizedOsFromInput = normalizeOsNumero(input.osNumero);
    const normalizedOsFromContext = normalizeOsNumero(ncContext?.osNumero);
    const normalizedOsFromNc = normalizeOsNumero(fetchedNc?.osNumero);
    const baseOsNumero = normalizedOsFromInput ?? normalizedOsFromContext ?? normalizedOsFromNc;
    const assigneeIds = Array.from(
      new Set(
        [input.assignees.owner, input.assignees.maintainer1, input.assignees.maintainer2].filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        ),
      ),
    );
    const baseInspectionId = ncContext?.inspectionId ?? fetchedNc?.inspectionId ?? null;
    const baseSource = ncContext?.source ?? fetchedNc?.source ?? (baseInspectionId ? "inspection" : null);
    const baseMachineId = ncContext?.machineId ?? fetchedNc?.machineId ?? null;
    const baseMachineTag = ncContext?.machineTag ?? fetchedNc?.machineTag ?? null;
    const baseMachineName = ncContext?.machineName ?? fetchedNc?.machineName ?? null;
    const basePhotos = (ncContext?.photos ?? fetchedNc?.photos ?? null) as StoredImage[] | null;
    const baseQuestionId = ncContext?.questionId ?? fetchedNc?.questionId ?? null;
    const baseQuestionLabel = ncContext?.questionLabel ?? fetchedNc?.questionLabel ?? null;
    const baseInspectionResponseId = ncContext?.inspectionResponseId ?? fetchedNc?.inspectionResponseId ?? null;
    const baseTemplateId = ncContext?.templateId ?? fetchedNc?.templateId ?? null;

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
      area: baseArea,
      severity: normalizedSeverity,
      assignees: input.assignees,
      dueDate,
      description: input.description ?? descriptionFromNc ?? null,
      createdAt: baseCreatedAt,
      machineId: baseMachineId,
      machineTag: baseMachineTag,
      machineName: baseMachineName,
      ncPhotos: basePhotos,
      osNumero: baseOsNumero,
      mantenedoresIds: assigneeIds.length ? assigneeIds : null,
      inspectionId: baseInspectionId,
      inspectionResponseId: baseInspectionResponseId,
      templateId: baseTemplateId,
      questionId: baseQuestionId,
      questionLabel: baseQuestionLabel,
    };

    tx.set(osRef, osPayload, { merge: true });

    let ncUpdate:
      | (CorrectiveNonConformityRecord & { linkedCorrectiveOsId: string; updatedAt: string })
      | null = null;

    if (ncId && ncRef) {
      const baseDescription = descriptionFromNc ?? input.description ?? fetchedNc?.description ?? null;

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
        machineId: baseMachineId,
        machineTag: baseMachineTag,
        machineName: baseMachineName,
        photos: basePhotos ?? null,
        osNumero: baseOsNumero,
        questionId: baseQuestionId,
        questionLabel: baseQuestionLabel,
        inspectionResponseId: baseInspectionResponseId,
        templateId: baseTemplateId,
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
    query = query.where("mantenedoresIds", "array-contains", params.responsible);
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
  const items: CorrectiveWorkOrderView[] = snapshot.docs.map(doc => mapWorkOrderSnapshot(doc));

  const hasMore = snapshot.size === limit;
  const nextCursor = hasMore ? snapshot.docs[snapshot.docs.length - 1]?.id ?? null : null;

  return { items, nextCursor };
}

export async function completeCorrectiveWorkOrder(input: {
  osId: string;
  completedAt?: string;
  completedBy: string;
  completedByName?: string | null;
  completedByMatricula?: string | null;
  notes?: string | null;
}): Promise<{ osId: string; ncId: string | null; workOrder: CorrectiveWorkOrderView | null }> {
  const now = nowIso();
  const completedAt = normalizeIsoInput(input.completedAt) ?? now;
  const trimmedNotes = input.notes?.trim() ? input.notes.trim() : null;

  const result = await adminDb.runTransaction(async tx => {
    const osRef = correctiveWorkOrdersCollection.doc(input.osId);
    const osSnapshot = await tx.get(osRef);
    if (!osSnapshot.exists) {
      throw new Error("CORRECTIVE_OS_NOT_FOUND");
    }

    const osData = osSnapshot.data() as CorrectiveWorkOrderRecord;
    const update: CorrectiveWorkOrderRecord = {
      status: "done",
      updatedAt: now,
      completedAt,
      completedBy: input.completedBy,
      completedByName: input.completedByName ?? null,
      completedByMatricula: input.completedByMatricula ?? null,
      completionNotes: trimmedNotes,
    };

    tx.set(osRef, update, { merge: true });

    const ncId = typeof osData.ncId === "string" ? osData.ncId : null;
    if (ncId) {
      const ncRef = correctiveNonConformitiesCollection.doc(ncId);
      tx.set(
        ncRef,
        {
          status: "CONCLUIDA_MANTENEDOR",
          updatedAt: now,
          linkedCorrectiveOsId: input.osId,
          scheduledDate: osData.scheduledDate ?? null,
        },
        { merge: true }
      );

      const issueRef = legacyIssuesCollection.doc(ncId);
      tx.set(
        issueRef,
        {
          status: "em_andamento",
          updatedAt: now,
          corretivaConcluidaEm: completedAt,
          corretivaConcluidaPor: input.completedBy,
          corretivaConcluidaNome: input.completedByName ?? null,
          corretivaConcluidaMatricula: input.completedByMatricula ?? null,
          corretivaObservacao: trimmedNotes,
        },
        { merge: true }
      );
    }

    return { osId: input.osId, ncId };
  });

  const osSnapshot = await correctiveWorkOrdersCollection.doc(input.osId).get();
  let workOrder: CorrectiveWorkOrderView | null = null;
  if (osSnapshot.exists) {
    const record = osSnapshot.data() as CorrectiveWorkOrderRecord;
    await syncCorrectiveWorkOrderView(input.osId, record);
    workOrder = mapWorkOrderSnapshot(osSnapshot);
  }

  if (result.ncId) {
    const ncSnapshot = await correctiveNonConformitiesCollection.doc(result.ncId).get();
    if (ncSnapshot.exists) {
      await syncOpenNonConformityView(result.ncId, ncSnapshot.data() as CorrectiveNonConformityRecord);
    } else {
      await syncOpenNonConformityView(result.ncId, { status: "CONCLUIDA_MANTENEDOR", updatedAt: now });
    }
  }

  return { ...result, workOrder };
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
