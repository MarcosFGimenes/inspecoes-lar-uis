import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/guards";
import { adminDb } from "@/lib/firebase-admin";
import {
  resolveIssueLastActivityAt,
  resolveIssueLastReincidenciaAt,
  sortByLastActivityDesc,
} from "@/lib/non-conformity-priority";
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
  maintainerId: string | null;
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
  maintainerId: string | null;
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
  lastReincidenciaAt: string | null;
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

async function getDocumentsByIds(
  collectionName: string,
  ids: string[]
): Promise<FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
  if (ids.length === 0) return [];
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const chunkSize = 300;
  const snapshots: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const refs = uniqueIds.slice(i, i + chunkSize).map(id => adminDb.collection(collectionName).doc(id));
    const chunkSnapshots = await adminDb.getAll(...refs);
    snapshots.push(...chunkSnapshots);
  }
  return snapshots;
}

function matchesMachineQuery(item: NonConformityItemResponse, machineQuery: string) {
  if (!machineQuery) return true;
  const query = machineQuery.toLowerCase();
  const haystack = [item.machineLabel, item.machineTag ?? "", item.machineId ?? ""].join(" ").toLowerCase();
  return haystack.includes(query);
}

export async function GET(req: NextRequest) {
  const isAdmin = await requireAdminFromRequest(req);
  if (!isAdmin) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const queryParams = req.nextUrl.searchParams;
  const rawLimit = Number(queryParams.get("limit") ?? "20");
  const rawOffset = Number(queryParams.get("offset") ?? "0");
  const includeAll = queryParams.get("all") === "1";
  const issueStatusFilter = (queryParams.get("status") ?? "aberta").trim().toLowerCase();
  const maintainerIdFilter = queryParams.get("mantenedor_id")?.trim() ?? "";
  const machineQueryFilter = (queryParams.get("machine_query") ?? "").trim();

  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 20;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  const allowedStatuses = new Set(["aberta", "concluida", "resolvida"]);
  const normalizedIssueStatus = allowedStatuses.has(issueStatusFilter) ? issueStatusFilter : "aberta";

  let issuesSnap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;

  if (machineQueryFilter) {
    const machinesSnap = await adminDb.collection("machines").get();
    const normalizedMachineQuery = machineQueryFilter.toLowerCase();
    const candidateMachineIds = machinesSnap.docs
      .filter(docSnap => {
        const data = docSnap.data() ?? {};
        const haystack = [docSnap.id, data.tag ?? "", data.nome ?? ""].join(" ").toLowerCase();
        return haystack.includes(normalizedMachineQuery);
      })
      .map(docSnap => docSnap.id);

    if (candidateMachineIds.length > 0) {
      const chunks: string[][] = [];
      for (let index = 0; index < candidateMachineIds.length; index += 10) {
        chunks.push(candidateMachineIds.slice(index, index + 10));
      }
      const chunkSnapshots = await Promise.all(
        chunks.map(chunk =>
          adminDb.collection("issues").where("status", "==", normalizedIssueStatus).where("machineId", "in", chunk).get()
        )
      );
      const issuesMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>>();
      chunkSnapshots.forEach(snap => {
        snap.forEach(docSnap => issuesMap.set(docSnap.id, docSnap));
      });
      issuesSnap = {
        docs: Array.from(issuesMap.values()),
      } as unknown as FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
    } else {
      issuesSnap = await adminDb.collection("issues").where("status", "==", normalizedIssueStatus).get();
    }
  } else {
    issuesSnap = await adminDb.collection("issues").where("status", "==", normalizedIssueStatus).get();
  }

  const responseIds = issuesSnap.docs
    .map(issueDoc => {
      const data = issueDoc.data() ?? {};
      return typeof data.abertaEmInspecaoId === "string" ? data.abertaEmInspecaoId : null;
    })
    .filter((value): value is string => Boolean(value));

  const inspectionsDocs = await getDocumentsByIds("inspecoes", responseIds);

  const machineIdsFromIssues = issuesSnap.docs
    .map(issueDoc => {
      const data = issueDoc.data() ?? {};
      return typeof data.machineId === "string" ? data.machineId : null;
    })
    .filter((value): value is string => Boolean(value));

  const machineIdsFromInspections = inspectionsDocs
    .map(inspectionDoc => resolveMachineIdFromInspection(inspectionDoc.data() ?? {}))
    .filter((value): value is string => Boolean(value));

  const machineDocs = await getDocumentsByIds("machines", [...machineIdsFromIssues, ...machineIdsFromInspections]);

  const machineOptions: MachineOption[] = machineDocs
    .filter(docSnap => docSnap.exists)
    .map(docSnap => {
      const data = docSnap.data() ?? {};
      return {
        id: docSnap.id,
        nome: typeof data.nome === "string" ? data.nome : docSnap.id,
        tag: data.tag ? String(data.tag) : null,
        templateId: typeof data.templateId === "string" ? data.templateId : null,
      } satisfies MachineOption;
    });

  const machinesById = new Map(machineOptions.map(machine => [machine.id, machine]));

  const templateIds = new Set<string>();
  inspectionsDocs.forEach(inspectionDoc => {
    const inspectionData = inspectionDoc.data() ?? {};
    const templateInfo = (inspectionData.template ?? {}) as Record<string, unknown>;
    const machine = (inspectionData.machine ?? {}) as Record<string, unknown>;
    const machineId = resolveMachineIdFromInspection(inspectionData);
    const machineOption = machineId ? machinesById.get(machineId) : undefined;
    const templateId =
      typeof templateInfo.id === "string"
        ? templateInfo.id
        : typeof machine.templateId === "string"
          ? machine.templateId
          : machineOption?.templateId ?? null;
    if (templateId) templateIds.add(templateId);
  });

  const templateDocs = await getDocumentsByIds("templates", Array.from(templateIds));
  const templateMap = new Map<string, TemplateMeta>();
  templateDocs.forEach(docSnap => {
    if (!docSnap.exists) return;
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

  inspectionsDocs.forEach(inspectionDoc => {
    if (!inspectionDoc.exists) return;
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
      maintainerId:
        typeof maintainer.maintId === "string"
          ? maintainer.maintId
          : typeof maintainer.id === "string"
            ? maintainer.id
            : null,
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
  const issuesToMigrate: Array<{ id: string; lastReincidenciaAt: string }> = [];

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
    const lastReincidenciaAtValue = resolveIssueLastReincidenciaAt(issueData);
    if (!issueData.last_reincidencia_at && !issueData.lastReincidenciaAt && lastReincidenciaAtValue) {
      issuesToMigrate.push({ id: issueDoc.id, lastReincidenciaAt: lastReincidenciaAtValue });
    }

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
      maintainerId: sourceInspection?.maintainerId ?? null,
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
      lastReincidenciaAt: lastReincidenciaAtValue,
    });
  });

  if (issuesToMigrate.length > 0) {
    const chunkSize = 400;
    for (let index = 0; index < issuesToMigrate.length; index += chunkSize) {
      const batch = adminDb.batch();
      const chunk = issuesToMigrate.slice(index, index + chunkSize);
      chunk.forEach(item => {
        const ref = adminDb.collection("issues").doc(item.id);
        batch.update(ref, {
          lastReincidenciaAt: item.lastReincidenciaAt,
          last_reincidencia_at: item.lastReincidenciaAt,
        });
      });
      await batch.commit();
    }
  }

  const filtered = sortByLastActivityDesc(
    builtItems
      .filter(item => (maintainerIdFilter ? item.maintainerId === maintainerIdFilter : true))
      .filter(item => matchesMachineQuery(item, machineQueryFilter))
  );

  const total = filtered.length;
  const paginatedItems = includeAll ? filtered : filtered.slice(offset, offset + limit);
  const returnedCount = includeAll ? total : Math.min(limit, Math.max(total - offset, 0));
  const nextOffset = includeAll ? total : offset + returnedCount;

  const pagedTreatmentsByResponse: Record<string, ChecklistNonConformityTreatment[]> = {};
  paginatedItems.forEach(item => {
    if (!item.responseId) return;
    pagedTreatmentsByResponse[item.responseId] = treatmentsByResponse[item.responseId] ?? [];
  });

  return NextResponse.json({
    items: paginatedItems,
    total,
    hasMore: nextOffset < total,
    nextOffset,
    treatmentsByResponse: pagedTreatmentsByResponse,
  });
}
