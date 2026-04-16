import { adminDb } from "@/lib/firebase-admin";

type InspectionSummaryInput = {
  id: string;
  createdAt: string;
  machine: {
    machineId: string | null;
    tag: string | null;
    nome: string | null;
    setor: string | null;
  };
  maintainer: {
    maintId: string | null;
    nome: string | null;
    matricula: string | null;
  };
  template: {
    id: string | null;
    nome: string | null;
    versao?: string | null;
  };
  osNumero: string | null;
  qtdNc: number;
};

function tokenize(value: string | null | undefined) {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(token => token.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function buildInspectionSummary(input: InspectionSummaryInput) {
  const machineTag = input.machine.tag?.trim() ?? null;
  const machineNome = input.machine.nome?.trim() ?? null;
  const machineSetor = input.machine.setor?.trim() ?? null;

  return {
    inspectionId: input.id,
    createdAt: input.createdAt,
    machineId: input.machine.machineId,
    machineTag,
    machineTagLower: machineTag?.toLowerCase() ?? null,
    machineNome,
    machineNomeLower: machineNome?.toLowerCase() ?? null,
    machineSetor,
    machineSetorLower: machineSetor?.toLowerCase() ?? null,
    machineSearchTokens: Array.from(new Set([
      ...(machineTag ? [machineTag.toLowerCase()] : []),
      ...(input.machine.machineId ? [input.machine.machineId.toLowerCase()] : []),
      ...tokenize(machineNome),
      ...tokenize(machineSetor),
    ])).slice(0, 30),
    maintainerId: input.maintainer.maintId,
    maintainerNome: input.maintainer.nome,
    maintainerMatricula: input.maintainer.matricula,
    maintainerMatriculaLower: input.maintainer.matricula?.toLowerCase() ?? null,
    templateId: input.template.id,
    templateNome: input.template.nome,
    templateVersao: input.template.versao ?? null,
    osNumero: input.osNumero,
    qtdNc: input.qtdNc,
    hasNc: input.qtdNc > 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function upsertInspectionSummary(input: InspectionSummaryInput) {
  const summary = buildInspectionSummary(input);
  await adminDb.collection("inspecoes_resumo").doc(input.id).set(summary, { merge: true });
}
