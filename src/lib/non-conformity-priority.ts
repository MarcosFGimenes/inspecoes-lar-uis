import type { ChecklistNonConformityTreatment } from "../types";

export interface IssueRecurrenceUpdateInput {
  issueData: Record<string, unknown>;
  inspectionId: string;
  nowIso: string;
  osNumeroItem?: string | null;
  fotos?: unknown[];
  descricao?: string | null;
}

export function buildIssueRecurrenceUpdates({
  issueData,
  inspectionId,
  nowIso,
  osNumeroItem,
  fotos = [],
  descricao,
}: IssueRecurrenceUpdateInput): Record<string, unknown> {
  const currentReincidencia = typeof issueData.reincidenciaCount === "number" ? issueData.reincidenciaCount : 0;
  const updates: Record<string, unknown> = {
    reincidenciaCount: currentReincidencia + 1,
    ultimaReincidenciaEm: nowIso,
    lastReincidenciaAt: nowIso,
    last_reincidencia_at: nowIso,
    ultimaReincidenciaInspecaoId: inspectionId,
    ultimaOcorrenciaEm: nowIso,
    updatedAt: nowIso,
  };

  if (osNumeroItem && issueData.osNumero !== osNumeroItem) {
    updates.osNumero = osNumeroItem;
  }
  if (fotos.length > 0) {
    updates.fotos = fotos;
  }
  if (descricao && issueData.descricao !== descricao) {
    updates.descricao = descricao;
  }
  if (issueData.maintainerResolution) {
    updates.maintainerResolution = null;
  }

  return updates;
}

interface IssueActivityAtInput {
  issueData: Record<string, unknown>;
  rawIssueTreatment: Record<string, unknown> | null;
  sourceTreatment?: ChecklistNonConformityTreatment;
}

export function resolveIssueLastActivityAt({
  issueData,
  rawIssueTreatment,
  sourceTreatment,
}: IssueActivityAtInput): string | null {
  const candidates: Array<unknown> = [
    issueData.ultimaOcorrenciaEm,
    issueData.ultimaReincidenciaEm,
    issueData.updatedAt,
    rawIssueTreatment?.updatedAt,
    sourceTreatment?.updatedAt,
    rawIssueTreatment?.createdAt,
    sourceTreatment?.createdAt,
    issueData.concluidaEm,
    issueData.createdAt,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

export function resolveIssueLastReincidenciaAt(issueData: Record<string, unknown>): string | null {
  const candidates: Array<unknown> = [
    issueData.last_reincidencia_at,
    issueData.lastReincidenciaAt,
    issueData.ultimaReincidenciaEm,
    issueData.ultimaOcorrenciaEm,
    issueData.createdAt,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

export function sortByLastActivityDesc<T extends { lastReincidenciaAt?: string | null; updatedAt: string | null; checklistDate: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTs = Date.parse(a.lastReincidenciaAt ?? a.checklistDate ?? "");
    const bTs = Date.parse(b.lastReincidenciaAt ?? b.checklistDate ?? "");
    const normalizedA = Number.isNaN(aTs) ? 0 : aTs;
    const normalizedB = Number.isNaN(bTs) ? 0 : bTs;
    return normalizedB - normalizedA;
  });
}
