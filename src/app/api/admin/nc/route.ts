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

async function loadTemplateMapForInspections(
  inspectionDocs: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>[],
  machinesById: Map<string, MachineOption>
) {
  const templateIds = new Set<string>();
  inspectionDocs.forEach(inspectionDoc => {
    if (!inspectionDoc.exists) return;
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

  return templateMap;
}

async function calculateIssueHistory(issueId: string) {
  const issueRef = adminDb.collection("issues").doc(issueId);
  const issueSnap = await issueRef.get();
  if (!issueSnap.exists) {
    return { found: false as const, historico: [] as NonConformityRecurrenceHistoryItem[] };
  }

  const issueData = issueSnap.data() ?? {};
  const questionId = typeof issueData.templateItemId === "string" ? issueData.templateItemId : null;
  const responseId = typeof issueData.abertaEmInspecaoId === "string" ? issueData.abertaEmInspecaoId : null;
  if (!questionId) {
    return { found: true as const, historico: [] as NonConformityRecurrenceHistoryItem[] };
  }

  const sourceInspectionSnap = responseId ? await adminDb.collection("inspecoes").doc(responseId).get() : null;
  const sourceInspectionData = sourceInspectionSnap?.exists ? sourceInspectionSnap.data() ?? {} : {};
  const machineId = typeof issueData.machineId === "string"
    ? issueData.machineId
    : resolveMachineIdFromInspection(sourceInspectionData);

  if (!machineId) {
    return { found: true as const, historico: [] as NonConformityRecurrenceHistoryItem[] };
  }

  const sourceDate = resolveInspectionDate(sourceInspectionData);
  let summaryInspectionIds: string[] = [];

  try {
    let summaryQuery = adminDb
      .collection("inspecoes_resumo")
      .where("machineId", "==", machineId)
      .where("hasNc", "==", true)
      .orderBy("createdAt", "desc")
      .limit(120);

    if (sourceDate) {
      summaryQuery = summaryQuery.where("createdAt", "<", sourceDate);
    }

    const summarySnap = await summaryQuery.get();
    summaryInspectionIds = summarySnap.docs
      .map(doc => String(doc.data()?.inspectionId ?? ""))
      .filter(Boolean);
  } catch {
    // Fallback sem depender de índice composto para evitar erro 500 no carregamento sob demanda.
    const fallbackSnap = await adminDb
      .collection("inspecoes_resumo")
      .where("machineId", "==", machineId)
      .limit(300)
      .get();

summaryInspectionIds = fallbackSnap.docs
      .filter(doc => Boolean(doc.data()?.hasNc))
      .filter(doc => {
        if (!sourceDate) return true;
        const createdAt = typeof doc.data()?.createdAt === "string" ? doc.data().createdAt : null;
        return createdAt ? createdAt < sourceDate : true;
      })
      .sort((a, b) => {
        const aTs = Date.parse(String(a.data()?.createdAt ?? ""));
        const bTs = Date.parse(String(b.data()?.createdAt ?? ""));
        const normalizedA = Number.isNaN(aTs) ? 0 : aTs;
        const normalizedB = Number.isNaN(bTs) ? 0 : bTs;
        return normalizedB - normalizedA;
      })
      .slice(0, 120)
      .map(doc => String(doc.data()?.inspectionId ?? ""))
      .filter(Boolean);
  }

  if (summaryInspectionIds.length === 0) {
    const fallbackInspecoesSnap = await adminDb
      .collection("inspecoes")
      .orderBy("createdAt", "desc")
      .limit(600)
      .get();

    summaryInspectionIds = fallbackInspecoesSnap.docs
      .filter(docSnap => {
        const data = docSnap.data() ?? {};
        const inspectionMachineId = resolveMachineIdFromInspection(data);
        if (inspectionMachineId !== machineId) return false;
        if (!sourceDate) return true;
        const createdAt = resolveInspectionDate(data);
        return createdAt ? createdAt < sourceDate : true;
      })
      .map(docSnap => docSnap.id)
      .slice(0, 120);
  }

  const inspectionIds = summaryInspectionIds.filter(id => id && id !== responseId);

  const inspectionDocs = await getDocumentsByIds("inspecoes", inspectionIds);
  const machineDocs = await getDocumentsByIds("machines", [machineId]);
  const machinesById = new Map(
    machineDocs
      .filter(docSnap => docSnap.exists)
      .map(docSnap => {
        const data = docSnap.data() ?? {};
        return [
          docSnap.id,
          {
            id: docSnap.id,
            nome: typeof data.nome === "string" ? data.nome : docSnap.id,
            tag: typeof data.tag === "string" ? data.tag : null,
            templateId: typeof data.templateId === "string" ? data.templateId : null,
          } satisfies MachineOption,
        ] as const;
      })
  );

  const templateMap = await loadTemplateMapForInspections(inspectionDocs, machinesById);

  const historico: NonConformityRecurrenceHistoryItem[] = [];
  inspectionDocs.forEach(inspectionDoc => {
    if (!inspectionDoc.exists) return;
    const inspectionData = inspectionDoc.data() ?? {};
    const machine = (inspectionData.machine ?? {}) as Record<string, unknown>;
    const maintainer = (inspectionData.maintainer ?? {}) as Record<string, unknown>;
    const templateInfo = (inspectionData.template ?? {}) as Record<string, unknown>;
    const inspectionMachineId = resolveMachineIdFromInspection(inspectionData);
    const machineOption = inspectionMachineId ? machinesById.get(inspectionMachineId) : undefined;
    const templateId =
      typeof templateInfo.id === "string"
        ? templateInfo.id
        : typeof machine.templateId === "string"
          ? machine.templateId
          : machineOption?.templateId ?? null;
    const templateMeta = templateId ? templateMap.get(templateId) : undefined;
    const answers = normalizeAnswers(inspectionData, templateMeta?.itensMap ?? new Map());
    const answer = answers.find(item => item.questionId === questionId && item.response === "nc");
    if (!answer) return;

    historico.push({
      inspectionId: inspectionDoc.id,
      checklistDate: resolveInspectionDate(inspectionData),
      observation: answer.observation ?? null,
      osNumero:
        typeof answer.itemOsNumero === "string" && answer.itemOsNumero.trim()
          ? answer.itemOsNumero.trim().toUpperCase()
          : null,
      osStatus: null,
      operatorNome: typeof maintainer.nome === "string" ? maintainer.nome : null,
    });
  });

  historico.sort((a, b) => {
    const aTs = Date.parse(a.checklistDate ?? "");
    const bTs = Date.parse(b.checklistDate ?? "");
    const normalizedA = Number.isNaN(aTs) ? 0 : aTs;
    const normalizedB = Number.isNaN(bTs) ? 0 : bTs;
    return normalizedB - normalizedA;
  });

  return { found: true as const, historico };
}

type CursorPayload = {
  createdAt: string;
  id: string;
};

function decodeCursor(raw: string | null): CursorPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.createdAt !== "string" || typeof parsed?.id !== "string") return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(payload: CursorPayload | null) {
  if (!payload) return null;
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export async function GET(req: NextRequest) {
  const isAdmin = await requireAdminFromRequest(req);
  if (!isAdmin) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const queryParams = req.nextUrl.searchParams;
  const includeHistorico = queryParams.get("includeHistorico") === "true";
  const targetIssueId = (queryParams.get("id") ?? "").trim();

  if (includeHistorico && targetIssueId) {
    const historyResult = await calculateIssueHistory(targetIssueId);
    if (!historyResult.found) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ id: targetIssueId, historico: historyResult.historico });
  }

  const rawLimit = Number(queryParams.get("limit") ?? "20");
  const includeAll = queryParams.get("all") === "1";
  const issueStatusFilter = (queryParams.get("status") ?? "aberta").trim().toLowerCase();
  const maintainerIdFilter = queryParams.get("mantenedor_id")?.trim() ?? "";
  const machineQueryFilter = (queryParams.get("machine_query") ?? "").trim().toLowerCase();
  const cursor = decodeCursor(queryParams.get("cursor"));

  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 20;
  const allowedStatuses = new Set(["aberta", "concluida", "resolvida"]);
  const normalizedIssueStatus = allowedStatuses.has(issueStatusFilter) ? issueStatusFilter : "aberta";

  let issuesQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb
    .collection("issues")
    .where("status", "==", normalizedIssueStatus);

  if (maintainerIdFilter) {
    issuesQuery = issuesQuery.where("maintainerId", "==", maintainerIdFilter);
  }

  if (machineQueryFilter) {
    if (/^[a-z0-9_-]+$/i.test(machineQueryFilter)) {
      issuesQuery = issuesQuery.where("machineTagLower", "==", machineQueryFilter);
    } else {
      return NextResponse.json({ items: [], hasMore: false, nextCursor: null, treatmentsByResponse: {} });
    }
  }

  issuesQuery = issuesQuery.orderBy("createdAt", "desc").orderBy("__name__", "desc");

  if (cursor) {
    issuesQuery = issuesQuery.startAfter(cursor.createdAt, cursor.id);
  }

  const issuesSnapRaw = await issuesQuery.limit((includeAll ? 500 : limit) + 1).get();
  const hasMore = !includeAll && issuesSnapRaw.docs.length > limit;
  const pageIssues = includeAll ? issuesSnapRaw.docs : issuesSnapRaw.docs.slice(0, limit);
  const issuesSnap = { docs: pageIssues } as FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
  const nextCursor = hasMore
    ? encodeCursor({
        createdAt: String(pageIssues[pageIssues.length - 1]?.data()?.createdAt ?? ""),
        id: String(pageIssues[pageIssues.length - 1]?.id ?? ""),
      })
    : null;

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

  const templateMap = await loadTemplateMapForInspections(inspectionsDocs, machinesById);

  const sourceInspectionMap = new Map<string, SourceInspectionData>();
  const treatmentsByResponse: Record<string, ChecklistNonConformityTreatment[]> = {};

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
      recurrenceHistory: [],
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

  const sortedItems = sortByLastActivityDesc(builtItems);

  const pagedTreatmentsByResponse: Record<string, ChecklistNonConformityTreatment[]> = {};
  sortedItems.forEach(item => {
    if (!item.responseId) return;
    pagedTreatmentsByResponse[item.responseId] = treatmentsByResponse[item.responseId] ?? [];
  });

  return NextResponse.json({
    items: sortedItems,
    hasMore,
    nextCursor,
    treatmentsByResponse: pagedTreatmentsByResponse,
  });
}
