import { adminDb } from "@/lib/firebase-admin";
import type { Severity } from "@/lib/adapters/correctiveAdapter";

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
}

export interface CorrectiveWorkOrderRecord {
  type?: string | null;
  status?: string | null;
  scheduledDate?: string | null;
  updatedAt?: string | null;
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
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
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

function normalizeArea(area: string | null | undefined): string | null {
  if (!area) return null;
  const trimmed = area.trim();
  return trimmed ? trimmed : null;
}

function normalizeStatus(status: string | null | undefined): string {
  if (!status) {
    return "";
  }
  return status.trim().toLowerCase();
}

export async function syncOpenNonConformityView(ncId: string, record: CorrectiveNonConformityRecord) {
  const status = normalizeStatus(record.status);
  const docRef = openNonConformitiesView.doc(ncId);

  if (status === "open") {
    const payload = {
      ncId,
      description: record.description ?? null,
      area: normalizeArea(record.area),
      effectiveSeverity: resolveSeverity(record.severity),
      updatedAt: normalizeIsoTimestamp(record.updatedAt ?? null),
      status: "open",
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
    status: record.status ?? null,
    updatedAt: normalizeIsoTimestamp(record.updatedAt ?? null),
    owner,
    maintainer1,
    maintainer2,
  } satisfies Record<string, unknown>;

  await docRef.set(payload, { merge: true });
}
