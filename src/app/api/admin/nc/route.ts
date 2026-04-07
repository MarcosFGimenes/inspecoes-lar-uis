import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/guards";
import { adminDb } from "@/lib/firebase-admin";
import { resolveIssueLastActivityAt, sortByLastActivityDesc } from "@/lib/non-conformity-priority";
import { normalizeStoredImages } from "@/lib/storage/images";
import type { ChecklistAnswer, ChecklistNonConformityTreatment, NonConformityStatus, StoredImage } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TemplateItemData {
  id?: string;
  componente?: string;
  criterio?: string;
  oQueChecar?: string;
}

interface TemplateMeta {
  nome?: string | null;
  versao?: string | null;
  itensMap: Map<string, TemplateItemData>;
}

interface SourceInspectionData {
  machineId: string | null;
  machineLabel: string;
  machineTag: string | null;
  templateId: string | null;
  templateLabel: string;
  templateVersion: string | null;
  checklistDate: string | null;
  operatorNome: string | null;
  operatorMatricula: string | null;
  treatments: ChecklistNonConformityTreatment[];
  treatmentMap: Map<string, ChecklistNonConformityTreatment>;
  answersMap: Map<string, ChecklistAnswer>;
}

interface MachineOption {
  id: string;
  nome: string;
  tag?: string | null;
  templateId?: string | null;
}

interface MaintainerResolutionInfo {
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolvedByMatricula: string | null;
  description: string;
  osNumero: string | null;
  inspecaoId: string | null;
}

interface NonConformityRecurrenceHistoryItem {
  inspectionId: string;
  checklistDate: string | null;
  observation: string | null;
  osNumero: string | null;
  osStatus: string | null;
  operatorNome: string | null;
}

interface NonConformityItemResponse {
  id: string;
  responseId: string | null;
  questionId: string;
  machineId: string | null;
  machineLabel: string;
  machineTag: string | null;
  templateId: string | null;
  templateLabel: string;
  templateVersion?: string | null;
  questionText: string;
  checklistDate: string | null;
  operatorNome: string | null;
  operatorMatricula: string | null;
  observation: string | null;
  photos: StoredImage[];
  itemOsNumero: string | null;
  issueStatus: "aberta" | "concluida" | "resolvida";
  status: NonConformityStatus;
  summary: string;
  responsible: string;
  dueDate: string;
  dueDateIso: string | null;
  recurrence: boolean;
  reincidenciaCount: number;
  recurrenceHistory: NonConformityRecurrenceHistoryItem[];
  maintainerResolution: MaintainerResolutionInfo | null;
  updatedAt: string | null;
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeStatus(value: unknown): NonConformityStatus | null {
  if (value === "open" || value === "in_progress" || value === "resolved") {
    return value;
  }
  return null;
}

function dedupeAnswers(answers: ChecklistAnswer[]) {
  const seen = new Set<string>();
  const unique: ChecklistAnswer[] = [];
  answers.forEach(answer => {
    if (!answer.questionId || seen.has(answer.questionId)) return;
    seen.add(answer.questionId);
    unique.push(answer);
  });
  return unique;
}

function mergeStoredImageCollections(...collections: unknown[]): StoredImage[] {
  const seen = new Set<string>();
  const merged: StoredImage[] = [];
  collections.forEach(collection => {
    normalizeStoredImages(collection).forEach(image => {
      const key = `${image.provider}:${image.url}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(image);
    });
  });
  return merged;
}

function normalizeAnswers(
  data: Record<string, unknown>,
  templateItems: Map<string, TemplateItemData>
): ChecklistAnswer[] {
  const itens = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
  const answersFromItens = dedupeAnswers(
    itens
      .filter(item => item?.templateItemId)
      .map(item => {
        const questionId = String(item.templateItemId);
        const templateItem = templateItems.get(questionId) ?? {};
        const resultado = String(item.resultado || "C").toLowerCase();
        const response: "c" | "nc" | "na" = resultado === "nc" ? "nc" : resultado === "na" ? "na" : "c";
        return {
          questionId,
          questionText:
            templateItem.oQueChecar ||
            templateItem.criterio ||
            templateItem.componente ||
            (typeof item.componente === "string" ? item.componente : `Item ${questionId}`),
          response,
          observation: typeof item.observacaoItem === "string" ? item.observacaoItem : null,
          photoUrls: normalizeStoredImages(item.fotos ?? []),
          recurrence: false,
          itemOsNumero:
            typeof item.osNumeroItem === "string" && item.osNumeroItem.trim()
              ? item.osNumeroItem.trim().toUpperCase()
              : null,
        } satisfies ChecklistAnswer;
      })
  );

  const answers = Array.isArray(data.answers) ? (data.answers as ChecklistAnswer[]) : [];
  if (answers.length === 0) {
    return answersFromItens;
  }

  const answersFromItensByQuestionId = new Map(answersFromItens.map(answer => [answer.questionId, answer] as const));
  const answersFromPayload = dedupeAnswers(
    answers
      .filter(item => item?.questionId)
      .map(item => {
        const fallbackFromItens = answersFromItensByQuestionId.get(item.questionId);
        return {
          questionId: item.questionId,
          questionText:
            item.questionText ||
            templateItems.get(item.questionId)?.oQueChecar ||
            templateItems.get(item.questionId)?.criterio ||
            templateItems.get(item.questionId)?.componente ||
            fallbackFromItens?.questionText ||
            `Item ${item.questionId}`,
          response: item.response === "nc" || item.response === "na" ? item.response : "c",
          observation: item.observation ?? fallbackFromItens?.observation ?? null,
          photoUrls: mergeStoredImageCollections(item.photoUrls, fallbackFromItens?.photoUrls),
          recurrence: item.recurrence === true || fallbackFromItens?.recurrence === true,
          itemOsNumero: item.itemOsNumero ?? fallbackFromItens?.itemOsNumero ?? null,
        } satisfies ChecklistAnswer;
      })
  );

  const questionIdsFromPayload = new Set(answersFromPayload.map(item => item.questionId));
  const missingFromPayload = answersFromItens.filter(item => !questionIdsFromPayload.has(item.questionId));
  return dedupeAnswers([...answersFromPayload, ...missingFromPayload]);
}

function buildMachineLabel(machine: Record<string, unknown>) {
  const nome = machine?.nome ? String(machine.nome) : "Máquina";
  const tag = machine?.tag ? String(machine.tag) : null;
  return tag ? `${nome} (${tag})` : nome;
}

function buildMachineLabelFromOption(machine: MachineOption | undefined, fallbackTag?: string | null) {
  if (!machine) {
    return fallbackTag ? `Máquina (${fallbackTag})` : "Máquina";
  }
  const tag = machine.tag ?? fallbackTag ?? null;
  return tag ? `${machine.nome} (${tag})` : machine.nome;
}

function resolveInspectionDate(data: Record<string, unknown>): string | null {
  if (typeof data.createdAt === "string") return data.createdAt;
  if (typeof data.finalizadaEm === "string") return data.finalizadaEm;
  return null;
}

function resolveMachineIdFromInspection(data: Record<string, unknown>): string | null {
  const machine = (data.machine ?? {}) as Record<string, unknown>;
  if (typeof machine.machineId === "string") return machine.machineId;
  if (typeof machine.id === "string") return machine.id;
  return null;
}

export async function GET(req: NextRequest) {
  const isAdmin = await requireAdminFromRequest(req);
  if (!isAdmin) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const [machinesSnap, templatesSnap, issuesSnap, inspectionsSnap] = await Promise.all([
    adminDb.collection("machines").get(),
    adminDb.collection("templates").get(),
    adminDb.collection("issues").where("status", "in", ["aberta", "concluida", "resolvida"]).get(),
    adminDb.collection("inspecoes").get(),
  ]);

  const machineOptions: MachineOption[] = machinesSnap.docs.map(docSnap => {
    const data = docSnap.data() ?? {};
    return {
      id: docSnap.id,
      nome: typeof data.nome === "string" ? data.nome : docSnap.id,
      tag: data.tag ? String(data.tag) : null,
      templateId: typeof data.templateId === "string" ? data.templateId : null,
    } satisfies MachineOption;
  });
  const machinesById = new Map(machineOptions.map(machine => [machine.id, machine]));

  const templateMap = new Map<string, TemplateMeta>();
  templatesSnap.docs.forEach(docSnap => {
    const data = docSnap.data() ?? {};
    const itens = Array.isArray(data.itens) ? (data.itens as TemplateItemData[]) : [];
    const itensMap = new Map<string, TemplateItemData>();
    itens.forEach(item => {
      if (item?.id) itensMap.set(String(item.id), item);
    });
    templateMap.set(docSnap.id, {
      nome: data.nome ? String(data.nome) : docSnap.id,
      versao: data.versao ? String(data.versao) : null,
      itensMap,
    });
  });

  const sourceInspectionMap = new Map<string, SourceInspectionData>();
  const treatmentsByResponse: Record<string, ChecklistNonConformityTreatment[]> = {};
  const ncHistoryByLogicalId = new Map<string, NonConformityRecurrenceHistoryItem[]>();

  inspectionsSnap.docs.forEach(inspectionDoc => {
    const inspectionData = inspectionDoc.data() ?? {};
    const machine = (inspectionData.machine ?? {}) as Record<string, unknown>;
    const maintainer = (inspectionData.maintainer ?? {}) as Record<string, unknown>;
    const templateInfo = (inspectionData.template ?? {}) as Record<string, unknown>;
    const machineId = resolveMachineIdFromInspection(inspectionData);
    const machineOption = machineId ? machinesById.get(machineId) : undefined;
    const templateId =
      typeof templateInfo.id === "string"
        ? templateInfo.id
        : typeof machine.templateId === "string"
          ? machine.templateId
          : machineOption?.templateId ?? null;
    const templateMeta = templateId ? templateMap.get(templateId) : undefined;

    const answers = normalizeAnswers(inspectionData, templateMeta?.itensMap ?? new Map());
    const answersMap = new Map(answers.map(answer => [answer.questionId, answer]));
    const treatments = Array.isArray(inspectionData.nonConformityTreatments)
      ? (inspectionData.nonConformityTreatments as ChecklistNonConformityTreatment[])
      : [];
    const treatmentMap = new Map<string, ChecklistNonConformityTreatment>();
    treatments.forEach(treatment => {
      if (treatment?.questionId) treatmentMap.set(treatment.questionId, treatment);
    });

    sourceInspectionMap.set(inspectionDoc.id, {
      machineId,
      machineLabel: buildMachineLabel(machine),
      machineTag: typeof machine.tag === "string" ? machine.tag : null,
      templateId,
      templateLabel:
        templateMeta?.nome ?? (typeof templateInfo.nome === "string" ? String(templateInfo.nome) : "Template"),
      templateVersion:
        templateMeta?.versao ?? (typeof templateInfo.versao === "string" ? String(templateInfo.versao) : null),
      checklistDate: resolveInspectionDate(inspectionData),
      operatorNome: typeof maintainer.nome === "string" ? maintainer.nome : null,
      operatorMatricula: typeof maintainer.matricula === "string" ? maintainer.matricula : null,
      treatments,
      treatmentMap,
      answersMap,
    });

    treatmentsByResponse[inspectionDoc.id] = treatments;

    answers.forEach(answer => {
      if (!answer?.questionId || answer.response !== "nc") return;
      const questionId = String(answer.questionId);
      const logicalId = `${machineId ?? "sem-maquina"}::${questionId}`;
      const inspectionDate = resolveInspectionDate(inspectionData);
      const itemOsNumero =
        typeof answer.itemOsNumero === "string" && answer.itemOsNumero.trim()
          ? answer.itemOsNumero.trim().toUpperCase()
          : null;
      const observation = answer.observation ?? null;
      const currentHistory = ncHistoryByLogicalId.get(logicalId) ?? [];
      currentHistory.push({
        inspectionId: inspectionDoc.id,
        checklistDate: inspectionDate,
        observation,
        osNumero: itemOsNumero,
        osStatus: null,
        operatorNome: typeof maintainer.nome === "string" ? maintainer.nome : null,
      });
      ncHistoryByLogicalId.set(logicalId, currentHistory);
    });
  });

  const builtItems: NonConformityItemResponse[] = [];
  issuesSnap.docs.forEach(issueDoc => {
    const issueData = issueDoc.data() ?? {};
    const machineId = typeof issueData.machineId === "string" ? issueData.machineId : null;
    const questionId = typeof issueData.templateItemId === "string" ? issueData.templateItemId : null;
    if (!questionId) return;

    const responseId = typeof issueData.abertaEmInspecaoId === "string" ? issueData.abertaEmInspecaoId : null;
    const sourceInspection = responseId ? sourceInspectionMap.get(responseId) : undefined;
    const machineOption = machineId ? machinesById.get(machineId) : undefined;
    const issueTag = typeof issueData.tag === "string" ? issueData.tag : null;
    const templateId = sourceInspection?.templateId ?? machineOption?.templateId ?? null;
    const templateMeta = templateId ? templateMap.get(templateId) : undefined;
    const templateItem = templateMeta?.itensMap.get(questionId);
    const answerData = sourceInspection?.answersMap.get(questionId);

    const rawIssueTreatment =
      issueData.pcmTreatment && typeof issueData.pcmTreatment === "object"
        ? (issueData.pcmTreatment as Record<string, unknown>)
        : null;
    const sourceTreatment = sourceInspection?.treatmentMap.get(questionId);
    const issueStatus = issueData.status === "resolvida" ? "resolvida" : issueData.status === "concluida" ? "concluida" : "aberta";
    const statusFromTreatment = normalizeStatus(rawIssueTreatment?.status ?? sourceTreatment?.status);
    const status: NonConformityStatus = issueStatus === "aberta" ? statusFromTreatment ?? "open" : "resolved";

    const summaryValue = typeof rawIssueTreatment?.summary === "string" ? rawIssueTreatment.summary : sourceTreatment?.summary ?? null;
    const responsibleValue =
      typeof rawIssueTreatment?.responsible === "string" ? rawIssueTreatment.responsible : sourceTreatment?.responsible ?? null;
    const dueDateIsoValue = typeof rawIssueTreatment?.dueDate === "string" ? rawIssueTreatment.dueDate : sourceTreatment?.dueDate ?? null;
    const updatedAtValue = resolveIssueLastActivityAt({ issueData, rawIssueTreatment, sourceTreatment });

    const rawResolution = issueData.maintainerResolution ?? null;
    const maintainerResolution = rawResolution && typeof rawResolution === "object"
      ? {
          resolvedAt: rawResolution.resolvedAt ?? null,
          resolvedByName: rawResolution.resolvedByName ?? null,
          resolvedByMatricula: rawResolution.resolvedByMatricula ?? null,
          description: typeof rawResolution.description === "string" ? rawResolution.description : "",
          osNumero: rawResolution.osNumero ?? null,
          inspecaoId: rawResolution.inspecaoId ?? null,
        }
      : null;

    const reincidenciaCount = typeof issueData.reincidenciaCount === "number" ? issueData.reincidenciaCount : 0;
    const logicalId = `${machineId ?? sourceInspection?.machineId ?? "sem-maquina"}::${questionId}`;
    const historyList = (ncHistoryByLogicalId.get(logicalId) ?? [])
      .filter(entry => entry.inspectionId !== responseId)
      .sort((a, b) => {
        const aTs = Date.parse(a.checklistDate ?? "");
        const bTs = Date.parse(b.checklistDate ?? "");
        const normalizedA = Number.isNaN(aTs) ? 0 : aTs;
        const normalizedB = Number.isNaN(bTs) ? 0 : bTs;
        return normalizedB - normalizedA;
      });

    builtItems.push({
      id: issueDoc.id,
      responseId,
      questionId,
      machineId: machineId ?? sourceInspection?.machineId ?? null,
      machineLabel: sourceInspection?.machineLabel ?? buildMachineLabelFromOption(machineOption, issueTag),
      machineTag: sourceInspection?.machineTag ?? machineOption?.tag ?? issueTag,
      templateId,
      templateLabel: sourceInspection?.templateLabel ?? templateMeta?.nome ?? "Template",
      templateVersion: sourceInspection?.templateVersion ?? templateMeta?.versao ?? null,
      questionText:
        answerData?.questionText ??
        templateItem?.oQueChecar ??
        templateItem?.criterio ??
        templateItem?.componente ??
        `Item ${questionId}`,
      checklistDate: sourceInspection?.checklistDate ?? (typeof issueData.createdAt === "string" ? issueData.createdAt : null),
      operatorNome: sourceInspection?.operatorNome ?? null,
      operatorMatricula: sourceInspection?.operatorMatricula ?? null,
      observation: typeof issueData.descricao === "string" ? issueData.descricao : answerData?.observation ?? null,
      photos: mergeStoredImageCollections(issueData.fotos, answerData?.photoUrls),
      itemOsNumero: typeof issueData.osNumero === "string" ? issueData.osNumero : answerData?.itemOsNumero ?? null,
      issueStatus,
      status,
      summary: summaryValue ? String(summaryValue) : "",
      responsible: responsibleValue ? String(responsibleValue) : "",
      dueDate: formatDateInput(dueDateIsoValue),
      dueDateIso: dueDateIsoValue ? String(dueDateIsoValue) : null,
      recurrence: answerData?.recurrence ?? reincidenciaCount > 0,
      reincidenciaCount,
      recurrenceHistory: historyList,
      maintainerResolution,
      updatedAt: updatedAtValue,
    });
  });

  return NextResponse.json({
    items: sortByLastActivityDesc(builtItems),
    treatmentsByResponse,
  });
}
