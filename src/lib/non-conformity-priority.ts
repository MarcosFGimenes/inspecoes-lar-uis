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
  void rawIssueTreatment;
  void sourceTreatment;

  const maintainerResolution =
    issueData.maintainerResolution && typeof issueData.maintainerResolution === "object"
      ? (issueData.maintainerResolution as Record<string, unknown>)
      : null;

  const candidates: Array<unknown> = [
    issueData.ultimaOcorrenciaEm,
    issueData.ultimaReincidenciaEm,
    maintainerResolution?.resolvedAt,
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

export function sortByLastActivityDesc<T extends { updatedAt: string | null; checklistDate: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTs = Date.parse(a.updatedAt ?? a.checklistDate ?? "");
    const bTs = Date.parse(b.updatedAt ?? b.checklistDate ?? "");
    const normalizedA = Number.isNaN(aTs) ? 0 : aTs;
    const normalizedB = Number.isNaN(bTs) ? 0 : bTs;
    return normalizedB - normalizedA;
  });
}
