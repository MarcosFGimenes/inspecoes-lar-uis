import { adminDb } from "@/lib/firebase-admin";
import type { Severity } from "@/lib/adapters/correctiveAdapter";
import type { StoredImage } from "@/types";

const openNonConformitiesView = adminDb.collection("views_nc_open");
const correctiveWorkOrdersView = adminDb.collection("views_os_corrective");

export interface CorrectiveSeverity {
  signer?: Severity | null;
  maintainer?: Severity | null;
}

export interface CorrectiveNonConformityRecord {
  description?: string | null;
  area?: string | null;
  severity?: CorrectiveSeverity | null;
  status?: string | null;
  updatedAt?: string | null;
  inspectionId?: string | null;
  source?: string | null;
  scheduledDate?: string | null;
  linkedCorrectiveOsId?: string | null;
  machineId?: string | null;
  machineTag?: string | null;
  machineName?: string | null;
  photos?: StoredImage[] | null;
  osNumero?: string | null;
  questionId?: string | null;
  questionLabel?: string | null;
  inspectionResponseId?: string | null;
  templateId?: string | null;
}

export interface CorrectiveWorkOrderRecord {
  type?: string | null;
  status?: string | null;
  scheduledDate?: string | null;
  dueDate?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  completedByMatricula?: string | null;
  completionNotes?: string | null;
  ncId?: string | null;
  ncDescription?: string | null;
  description?: string | null;
  area?: string | null;
  severity?: CorrectiveSeverity | null;
  assignees?: {
    owner?: string | null;
    maintainer1?: string | null;
    maintainer2?: string | null;
  } | null;
  machineId?: string | null;
  machineTag?: string | null;
  machineName?: string | null;
  ncPhotos?: StoredImage[] | null;
  inspectionId?: string | null;
  inspectionResponseId?: string | null;
  templateId?: string | null;
  questionId?: string | null;
  questionLabel?: string | null;
  osNumero?: string | null;
}

function normalizeIsoTimestamp(value: string | null | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function normalizeSeverityValue(value: unknown): Severity | null {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6) {
    return value;
  }
  return null;
}

function resolveSeverity(severity: CorrectiveSeverity | null | undefined): Severity | null {
  if (!severity) {
    return null;
  }
  return normalizeSeverityValue(severity.signer ?? severity.maintainer ?? null);
}

export function normalizeArea(area: string | null | undefined): string | null {
  if (!area) return null;
  const trimmed = area.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (["mechanical", "mec", "mecanica", "mecânica", "mecanico", "mecânico"].some(term => lowered.includes(term))) {
    return "mechanical";
  }
  if (["electrical", "eletr", "elétrica", "eletrica", "elétrico", "eletrico"].some(term => lowered.includes(term))) {
    return "electrical";
  }
  return trimmed;
}

function normalizeStatus(status: string | null | undefined): string {
  if (!status) {
    return "";
  }
  const normalized = status.trim().toLowerCase();
  if (["open", "aberta", "pendente", "pending"].includes(normalized)) {
    return "open";
  }
  if (["programada", "programado", "scheduled"].includes(normalized)) {
    return "scheduled";
  }
  if (["em_andamento", "andamento", "in_progress"].includes(normalized)) {
    return "in_progress";
  }
  if ([
    "concluida",
    "concluída",
    "concluido",
    "concluído",
    "done",
    "finalizada",
    "finalizado",
    "concluida_mantenedor",
    "concluida_manutencao",
  ].includes(normalized)) {
    return "done";
  }
  if (["resolved", "resolvida", "resolvido", "closed"].includes(normalized)) {
    return "resolved";
  }
  return normalized;
}

export async function syncOpenNonConformityView(ncId: string, record: CorrectiveNonConformityRecord) {
  const status = normalizeStatus(record.status);
  const docRef = openNonConformitiesView.doc(ncId);

  if (status === "open") {
    const source = typeof record.source === "string" ? record.source.trim().toLowerCase() : null;
    const inspectionId = typeof record.inspectionId === "string" ? record.inspectionId : null;
    const machineId = typeof record.machineId === "string" ? record.machineId : null;
    const machineTag = typeof record.machineTag === "string" ? record.machineTag : null;
    const machineName = typeof record.machineName === "string" ? record.machineName : null;
    const osNumero = typeof record.osNumero === "string" ? record.osNumero : null;
    const questionId = typeof record.questionId === "string" ? record.questionId : null;
    const questionLabel = typeof record.questionLabel === "string" ? record.questionLabel : null;
    const inspectionResponseId = typeof record.inspectionResponseId === "string" ? record.inspectionResponseId : null;
    const templateId = typeof record.templateId === "string" ? record.templateId : null;
    const photos = Array.isArray(record.photos) ? (record.photos as StoredImage[]) : null;
    const payload = {
      ncId,
      description: record.description ?? null,
      area: normalizeArea(record.area),
      effectiveSeverity: resolveSeverity(record.severity),
      updatedAt: normalizeIsoTimestamp(record.updatedAt ?? null),
      status: "open",
      source: source ?? (inspectionId ? "inspection" : null),
      inspectionId,
      machineId,
      machineTag,
      machineName,
      osNumero,
      photos,
      questionId,
      questionLabel,
      inspectionResponseId,
      templateId,
    } satisfies Record<string, unknown>;
    await docRef.set(payload, { merge: true });
    return;
  }

  await docRef.delete().catch(() => undefined);
}

export async function syncCorrectiveWorkOrderView(osId: string, record: CorrectiveWorkOrderRecord) {
  const type = normalizeStatus(record.type);
  const docRef = correctiveWorkOrdersView.doc(osId);

  if (type !== "corrective") {
    await docRef.delete().catch(() => undefined);
    return;
  }

  const assignees = record.assignees ?? null;
  const owner = typeof assignees?.owner === "string" ? assignees.owner : null;
  const maintainer1 = typeof assignees?.maintainer1 === "string" ? assignees.maintainer1 : null;
  const maintainer2 = typeof assignees?.maintainer2 === "string" ? assignees.maintainer2 : null;

  const payload = {
    osId,
    ncId: record.ncId ?? null,
    ncDescription: record.ncDescription ?? null,
    description: record.description ?? record.ncDescription ?? null,
    area: normalizeArea(record.area),
    effectiveSeverity: resolveSeverity(record.severity),
    scheduledDate: record.scheduledDate ?? null,
    dueDate: record.dueDate ?? null,
    status: record.status ?? null,
    updatedAt: normalizeIsoTimestamp(record.updatedAt ?? null),
    owner,
    maintainer1,
    maintainer2,
    assignees: assignees
      ? {
          owner,
          maintainer1,
          maintainer2,
        }
      : null,
    completedAt: record.completedAt ?? null,
    completedBy: record.completedBy ?? null,
    completedByName: record.completedByName ?? null,
    completedByMatricula: record.completedByMatricula ?? null,
    completionNotes: record.completionNotes ?? null,
    machineId: record.machineId ?? null,
    machineTag: record.machineTag ?? null,
    machineName: record.machineName ?? null,
    ncPhotos: Array.isArray(record.ncPhotos) ? (record.ncPhotos as StoredImage[]) : null,
    inspectionId: record.inspectionId ?? null,
    inspectionResponseId: record.inspectionResponseId ?? null,
    templateId: record.templateId ?? null,
    questionId: record.questionId ?? null,
    questionLabel: record.questionLabel ?? null,
    osNumero: record.osNumero ?? null,
  } satisfies Record<string, unknown>;

  await docRef.set(payload, { merge: true });
}
