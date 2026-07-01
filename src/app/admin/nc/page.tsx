"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  ChecklistAnswer,
  ChecklistNonConformityTreatment,
  NonConformityStatus,
  StoredImage,
} from "@/types";
import {
  resolveIssueLastActivityAt,
  sortByDueDateAsc,
  sortByLastActivityDesc,
} from "@/lib/non-conformity-priority";
import { normalizeStoredImages } from "@/lib/storage/images";

interface MachineOption {
  id: string;
  nome: string;
  tag?: string | null;
  templateId?: string | null;
  ativo?: boolean;
}

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

interface NonConformityItem {
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
  maintainerResolution: MaintainerResolutionInfo | null;
  updatedAt: string | null;
}

interface MaintainerResolutionInfo {
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolvedByMatricula: string | null;
  description: string;
  osNumero: string | null;
  inspecaoId: string | null;
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

interface FeedbackState {
  type: "success" | "error";
  message: string;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeOsNumero(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().toUpperCase()
    : null;
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
  answers.forEach((answer) => {
    if (!answer.questionId || seen.has(answer.questionId)) {
      return;
    }
    seen.add(answer.questionId);
    unique.push(answer);
  });
  return unique;
}

function mergeStoredImageCollections(...collections: unknown[]): StoredImage[] {
  const seen = new Set<string>();
  const merged: StoredImage[] = [];
  collections.forEach((collection) => {
    normalizeStoredImages(collection).forEach((image) => {
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
  templateItems: Map<string, TemplateItemData>,
): ChecklistAnswer[] {
  const itens = Array.isArray(data.itens)
    ? (data.itens as Array<Record<string, unknown>>)
    : [];
  const answersFromItens = dedupeAnswers(
    itens
      .filter((item) => item?.templateItemId)
      .map((item) => {
        const questionId = String(item.templateItemId);
        const templateItem = templateItems.get(questionId) ?? {};
        const resultado = String(item.resultado || "C").toLowerCase();
        const response: "c" | "nc" | "na" =
          resultado === "nc" ? "nc" : resultado === "na" ? "na" : "c";
        return {
          questionId,
          questionText:
            templateItem.oQueChecar ||
            templateItem.criterio ||
            templateItem.componente ||
            (typeof item.componente === "string"
              ? item.componente
              : `Item ${questionId}`),
          response,
          observation:
            typeof item.observacaoItem === "string"
              ? item.observacaoItem
              : null,
          photoUrls: normalizeStoredImages(item.fotos ?? []),
          recurrence: false,
          itemOsNumero: normalizeOsNumero(item.osNumeroItem),
        } satisfies ChecklistAnswer;
      }),
  );

  const answers = Array.isArray(data.answers)
    ? (data.answers as ChecklistAnswer[])
    : [];
  if (answers.length === 0) {
    return answersFromItens;
  }

  const answersFromItensByQuestionId = new Map(
    answersFromItens.map((answer) => [answer.questionId, answer] as const),
  );
  const answersFromPayload = dedupeAnswers(
    answers
      .filter((item) => item?.questionId)
      .map((item) => {
        const fallbackFromItens = answersFromItensByQuestionId.get(
          item.questionId,
        );
        return {
          questionId: item.questionId,
          questionText:
            item.questionText ||
            templateItems.get(item.questionId)?.oQueChecar ||
            templateItems.get(item.questionId)?.criterio ||
            templateItems.get(item.questionId)?.componente ||
            fallbackFromItens?.questionText ||
            `Item ${item.questionId}`,
          response:
            item.response === "nc" || item.response === "na"
              ? item.response
              : "c",
          observation:
            item.observation ?? fallbackFromItens?.observation ?? null,
          photoUrls: mergeStoredImageCollections(
            item.photoUrls,
            fallbackFromItens?.photoUrls,
          ),
          recurrence:
            item.recurrence === true || fallbackFromItens?.recurrence === true,
          itemOsNumero:
            normalizeOsNumero(item.itemOsNumero) ??
            fallbackFromItens?.itemOsNumero ??
            null,
        } satisfies ChecklistAnswer;
      }),
  );

  const questionIdsFromPayload = new Set(
    answersFromPayload.map((item) => item.questionId),
  );
  const missingFromPayload = answersFromItens.filter(
    (item) => !questionIdsFromPayload.has(item.questionId),
  );
  return dedupeAnswers([...answersFromPayload, ...missingFromPayload]);
}

function buildMachineLabel(machine: Record<string, unknown>) {
  const nome = machine?.nome ? String(machine.nome) : "Máquina";
  const tag = machine?.tag ? String(machine.tag) : null;
  return tag ? `${nome} (${tag})` : nome;
}

function buildMachineLabelFromOption(
  machine: MachineOption | undefined,
  fallbackTag?: string | null,
) {
  if (!machine) {
    return fallbackTag ? `Máquina (${fallbackTag})` : "Máquina";
  }
  const tag = machine.tag ?? fallbackTag ?? null;
  return tag ? `${machine.nome} (${tag})` : machine.nome;
}

function renderStatusBadge(status: NonConformityStatus) {
  if (status === "resolved") return <Badge variant="success">Resolvida</Badge>;
  if (status === "in_progress")
    return <Badge variant="warning">Em andamento</Badge>;
  return <Badge variant="danger">Aberta</Badge>;
}

const PAGE_SIZE = 20;

type IssueCursor = QueryDocumentSnapshot<DocumentData> | null;

const STATUS_OPTIONS: Array<{ value: NonConformityStatus; label: string }> = [
  { value: "open", label: "Aberta" },
  { value: "in_progress", label: "Em andamento" },
  { value: "resolved", label: "Resolvida" },
];

export default function AdminNonConformitiesPage() {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [issueCursor, setIssueCursor] = useState<IssueCursor>(null);
  const [hasMoreIssues, setHasMoreIssues] = useState(true);
  const [forceVisibleIds, setForceVisibleIds] = useState<Set<string>>(
    new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NonConformityItem[]>([]);
  const [treatmentsByResponse, setTreatmentsByResponse] = useState<
    Record<string, ChecklistNonConformityTreatment[]>
  >({});
  const [machineFilter, setMachineFilter] = useState("");
  const [maintainerFilter, setMaintainerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [dueDateFilter, setDueDateFilter] = useState("default");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, FeedbackState>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [expandedResolutions, setExpandedResolutions] = useState<Set<string>>(
    new Set(),
  );
  const [deleteDialogItem, setDeleteDialogItem] =
    useState<NonConformityItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const hasActiveFilter = Boolean(
    machineFilter.trim() ||
    maintainerFilter ||
    statusFilter !== "open" ||
    dueDateFilter !== "default",
  );

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => items.some((item) => item.id === id)),
    );
  }, [items]);

  const buildItemsFromIssueDocs = useCallback(
    async (issueDocs: QueryDocumentSnapshot<DocumentData>[]) => {
      const [machinesSnap, templatesSnap] = await Promise.all([
        getDocs(collection(firebaseDb, "machines")),
        getDocs(collection(firebaseDb, "templates")),
      ]);

      const machineOptions: MachineOption[] = machinesSnap.docs.map(
        (docSnap) => {
          const data = docSnap.data() ?? {};
          return {
            id: docSnap.id,
            nome: typeof data.nome === "string" ? data.nome : docSnap.id,
            tag: data.tag ? String(data.tag) : null,
            templateId:
              typeof data.templateId === "string" ? data.templateId : null,
            ativo: data.ativo !== false,
          } satisfies MachineOption;
        },
      );
      const machinesById = new Map(
        machineOptions.map((machine) => [machine.id, machine]),
      );

      const templateMap = new Map<string, TemplateMeta>();
      templatesSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() ?? {};
        const itens = Array.isArray(data.itens)
          ? (data.itens as TemplateItemData[])
          : [];
        const itensMap = new Map<string, TemplateItemData>();
        itens.forEach((item) => {
          if (item?.id) {
            itensMap.set(String(item.id), item);
          }
        });
        templateMap.set(docSnap.id, {
          nome: data.nome ? String(data.nome) : docSnap.id,
          versao: data.versao ? String(data.versao) : null,
          itensMap,
        });
      });

      const sourceInspectionIds = Array.from(
        new Set(
          issueDocs.flatMap((issueDoc) => {
            const issueData = issueDoc.data() ?? {};
            return [
              issueData.abertaEmInspecaoId,
              issueData.ultimaReincidenciaInspecaoId,
            ].filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            );
          }),
        ),
      );

      const sourceInspectionEntries = await Promise.all(
        sourceInspectionIds.map(async (inspectionId) => {
          const inspectionRef = doc(
            collection(firebaseDb, "inspecoes"),
            inspectionId,
          );
          const inspectionSnap = await getDoc(inspectionRef);
          if (!inspectionSnap.exists()) {
            return [inspectionId, null] as const;
          }

          const inspectionData = inspectionSnap.data() ?? {};
          const machine = (inspectionData.machine ?? {}) as Record<
            string,
            unknown
          >;
          const maintainer = (inspectionData.maintainer ?? {}) as Record<
            string,
            unknown
          >;
          const templateInfo = (inspectionData.template ?? {}) as Record<
            string,
            unknown
          >;
          const templateId =
            typeof templateInfo.id === "string"
              ? templateInfo.id
              : typeof machine.templateId === "string"
                ? machine.templateId
                : null;
          const templateMeta = templateId
            ? templateMap.get(templateId)
            : undefined;
          const answers = normalizeAnswers(
            inspectionData,
            templateMeta?.itensMap ?? new Map(),
          );
          const answersMap = new Map(
            answers.map((answer) => [answer.questionId, answer]),
          );
          const treatments = Array.isArray(
            inspectionData.nonConformityTreatments,
          )
            ? (inspectionData.nonConformityTreatments as ChecklistNonConformityTreatment[])
            : [];
          const treatmentMap = new Map<
            string,
            ChecklistNonConformityTreatment
          >();
          treatments.forEach((treatment) => {
            if (treatment?.questionId) {
              treatmentMap.set(treatment.questionId, treatment);
            }
          });

          return [
            inspectionId,
            {
              machineId:
                typeof machine.machineId === "string"
                  ? machine.machineId
                  : typeof machine.id === "string"
                    ? machine.id
                    : null,
              machineLabel: buildMachineLabel(machine),
              machineTag: typeof machine.tag === "string" ? machine.tag : null,
              templateId,
              templateLabel:
                templateMeta?.nome ??
                (typeof templateInfo.nome === "string"
                  ? String(templateInfo.nome)
                  : "Template"),
              templateVersion:
                templateMeta?.versao ??
                (typeof templateInfo.versao === "string"
                  ? String(templateInfo.versao)
                  : null),
              checklistDate:
                typeof inspectionData.createdAt === "string"
                  ? inspectionData.createdAt
                  : typeof inspectionData.finalizadaEm === "string"
                    ? inspectionData.finalizadaEm
                    : null,
              operatorNome:
                typeof maintainer.nome === "string" ? maintainer.nome : null,
              operatorMatricula:
                typeof maintainer.matricula === "string"
                  ? maintainer.matricula
                  : null,
              treatments,
              treatmentMap,
              answersMap,
            } satisfies SourceInspectionData,
          ] as const;
        }),
      );

      const sourceInspectionMap = new Map<string, SourceInspectionData>();
      const treatmentsRecord: Record<
        string,
        ChecklistNonConformityTreatment[]
      > = {};
      sourceInspectionEntries.forEach(([inspectionId, inspectionData]) => {
        if (!inspectionData) return;
        sourceInspectionMap.set(inspectionId, inspectionData);
        treatmentsRecord[inspectionId] = inspectionData.treatments;
      });

      const builtItems: NonConformityItem[] = [];
      issueDocs.forEach((issueDoc) => {
        const issueData = issueDoc.data() ?? {};
        const machineId =
          typeof issueData.machineId === "string" ? issueData.machineId : null;
        const questionId =
          typeof issueData.templateItemId === "string"
            ? issueData.templateItemId
            : null;
        if (!questionId) return;

        const responseId =
          typeof issueData.abertaEmInspecaoId === "string"
            ? issueData.abertaEmInspecaoId
            : null;
        const latestOccurrenceId =
          typeof issueData.ultimaReincidenciaInspecaoId === "string"
            ? issueData.ultimaReincidenciaInspecaoId
            : responseId;
        const sourceInspection = latestOccurrenceId
          ? sourceInspectionMap.get(latestOccurrenceId)
          : undefined;
        const machineOption = machineId
          ? machinesById.get(machineId)
          : undefined;
        const issueTag =
          typeof issueData.tag === "string" ? issueData.tag : null;
        const templateId =
          sourceInspection?.templateId ?? machineOption?.templateId ?? null;
        const templateMeta = templateId
          ? templateMap.get(templateId)
          : undefined;
        const templateItem = templateMeta?.itensMap.get(questionId);
        const answerData = sourceInspection?.answersMap.get(questionId);

        const rawIssueTreatment =
          issueData.pcmTreatment && typeof issueData.pcmTreatment === "object"
            ? (issueData.pcmTreatment as Record<string, unknown>)
            : null;
        const sourceTreatment = sourceInspection?.treatmentMap.get(questionId);
        const issueStatus =
          issueData.status === "resolvida"
            ? "resolvida"
            : issueData.status === "concluida"
              ? "concluida"
              : "aberta";
        const statusFromTreatment = normalizeStatus(
          rawIssueTreatment?.status ?? sourceTreatment?.status,
        );
        const status: NonConformityStatus =
          issueStatus === "aberta"
            ? (statusFromTreatment ?? "open")
            : "resolved";

        const summaryValue =
          typeof rawIssueTreatment?.summary === "string"
            ? rawIssueTreatment.summary
            : (sourceTreatment?.summary ?? null);
        const responsibleValue =
          typeof rawIssueTreatment?.responsible === "string"
            ? rawIssueTreatment.responsible
            : (sourceTreatment?.responsible ?? null);
        const dueDateIsoValue =
          typeof rawIssueTreatment?.dueDate === "string"
            ? rawIssueTreatment.dueDate
            : (sourceTreatment?.dueDate ?? null);
        const updatedAtValue = resolveIssueLastActivityAt({
          issueData,
          rawIssueTreatment,
          sourceTreatment,
        });

        const rawResolution = issueData.maintainerResolution ?? null;
        const maintainerResolution =
          rawResolution && typeof rawResolution === "object"
            ? {
                resolvedAt: rawResolution.resolvedAt ?? null,
                resolvedByName: rawResolution.resolvedByName ?? null,
                resolvedByMatricula: rawResolution.resolvedByMatricula ?? null,
                description:
                  typeof rawResolution.description === "string"
                    ? rawResolution.description
                    : "",
                osNumero: rawResolution.osNumero ?? null,
                inspecaoId: rawResolution.inspecaoId ?? null,
              }
            : null;
        const reincidenciaCount =
          typeof issueData.reincidenciaCount === "number"
            ? issueData.reincidenciaCount
            : 0;

        builtItems.push({
          id: issueDoc.id,
          responseId,
          questionId,
          machineId: machineId ?? sourceInspection?.machineId ?? null,
          machineLabel:
            sourceInspection?.machineLabel ??
            buildMachineLabelFromOption(machineOption, issueTag),
          machineTag:
            sourceInspection?.machineTag ?? machineOption?.tag ?? issueTag,
          templateId,
          templateLabel:
            sourceInspection?.templateLabel ?? templateMeta?.nome ?? "Template",
          templateVersion:
            sourceInspection?.templateVersion ?? templateMeta?.versao ?? null,
          questionText:
            answerData?.questionText ??
            templateItem?.oQueChecar ??
            templateItem?.criterio ??
            templateItem?.componente ??
            `Item ${questionId}`,
          checklistDate:
            sourceInspection?.checklistDate ??
            (typeof issueData.createdAt === "string"
              ? issueData.createdAt
              : null),
          operatorNome: sourceInspection?.operatorNome ?? null,
          operatorMatricula: sourceInspection?.operatorMatricula ?? null,
          observation:
            typeof issueData.descricao === "string"
              ? issueData.descricao
              : (answerData?.observation ?? null),
          photos: mergeStoredImageCollections(
            issueData.fotos,
            answerData?.photoUrls,
          ),
          itemOsNumero:
            answerData?.itemOsNumero ??
            normalizeOsNumero(issueData.osNumero) ??
            null,
          issueStatus,
          status,
          summary: summaryValue ? String(summaryValue) : "",
          responsible: responsibleValue ? String(responsibleValue) : "",
          dueDate: formatDateInput(dueDateIsoValue),
          dueDateIso: dueDateIsoValue ? String(dueDateIsoValue) : null,
          recurrence: answerData?.recurrence ?? reincidenciaCount > 0,
          reincidenciaCount,
          maintainerResolution,
          updatedAt: updatedAtValue,
        });
      });

      return {
        builtItems: sortByLastActivityDesc(builtItems),
        treatmentsRecord,
      };
    },
    [],
  );

  const loadData = useCallback(
    async (mode: "reset" | "append" | "all" = "reset") => {
      const isAppend = mode === "append";
      const isAll = mode === "all";
      if (isAppend) setLoadingMore(true);
      else if (isAll) setLoadingAll(true);
      else setLoading(true);
      setError(null);
      try {
        const session = await fetch("/api/admin-session", {
          cache: "no-store",
        });
        if (session.status === 401) {
          window.location.href = "/admin/login";
          return;
        }

        const loadedDocs: QueryDocumentSnapshot<DocumentData>[] = [];
        let cursor = isAppend || isAll ? issueCursor : null;
        let lastBatchSize = 0;

        do {
          const issuesQuery = cursor
            ? query(
                collection(firebaseDb, "issues"),
                orderBy("updatedAt", "desc"),
                startAfter(cursor),
                limit(PAGE_SIZE),
              )
            : query(
                collection(firebaseDb, "issues"),
                orderBy("updatedAt", "desc"),
                limit(PAGE_SIZE),
              );
          const issuesSnap = await getDocs(issuesQuery);
          loadedDocs.push(...issuesSnap.docs);
          lastBatchSize = issuesSnap.docs.length;
          cursor = issuesSnap.docs.at(-1) ?? cursor;
        } while (isAll && lastBatchSize === PAGE_SIZE);

        const { builtItems, treatmentsRecord } =
          await buildItemsFromIssueDocs(loadedDocs);
        setTreatmentsByResponse((prev) =>
          isAppend || isAll
            ? { ...prev, ...treatmentsRecord }
            : treatmentsRecord,
        );
        setItems((prev) => {
          const nextItems =
            isAppend || isAll ? [...prev, ...builtItems] : builtItems;
          return sortByLastActivityDesc(
            Array.from(
              new Map(nextItems.map((item) => [item.id, item])).values(),
            ),
          );
        });
        setIssueCursor(cursor);
        setHasMoreIssues(lastBatchSize === PAGE_SIZE);
      } catch (err: unknown) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Erro ao carregar dados";
        setError(message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setLoadingAll(false);
      }
    },
    [buildItemsFromIssueDocs, issueCursor],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setForceVisibleIds(new Set());
  }, [
    dueDateFilter,
    hasActiveFilter,
    machineFilter,
    maintainerFilter,
    statusFilter,
  ]);

  const machineOptionsForFilter = useMemo(() => {
    return Array.from(
      new Set(items.map((item) => item.machineLabel.trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const maintainerOptionsForFilter = useMemo(() => {
    const maintainers = new Map<string, string>();
    items.forEach((item) => {
      const nome = item.operatorNome?.trim();
      if (!nome) return;
      const matricula = item.operatorMatricula?.trim();
      const label = matricula ? `${nome} (mat. ${matricula})` : nome;
      maintainers.set(nome, label);
    });
    return Array.from(maintainers.entries())
      .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
      .map(([value, label]) => ({ value, label }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const machineSearch = machineFilter.trim().toLowerCase();
    const visibleItems = items.filter((item) => {
      if (forceVisibleIds.has(item.id)) {
        return true;
      }
      if (machineSearch) {
        const machineLabel = item.machineLabel.toLowerCase();
        const machineTag = (item.machineTag ?? "").toLowerCase();
        const machineId = (item.machineId ?? "").toLowerCase();
        if (
          !machineLabel.includes(machineSearch) &&
          !machineTag.includes(machineSearch) &&
          !machineId.includes(machineSearch)
        ) {
          return false;
        }
      }
      if (maintainerFilter && item.operatorNome !== maintainerFilter) {
        return false;
      }
      if (statusFilter === "planned") {
        return Boolean(
          item.summary.trim() || item.responsible.trim() || item.dueDate,
        );
      }
      if (statusFilter === "unplanned") {
        return !Boolean(
          item.summary.trim() || item.responsible.trim() || item.dueDate,
        );
      }
      if (statusFilter === "all") {
        return true;
      }
      if (statusFilter === "maintainer_resolved") {
        return item.maintainerResolution != null;
      }
      return item.status === statusFilter;
    });

    if (dueDateFilter === "oldest_first") {
      return sortByDueDateAsc(visibleItems);
    }

    return visibleItems;
  }, [
    items,
    machineFilter,
    maintainerFilter,
    statusFilter,
    dueDateFilter,
    forceVisibleIds,
  ]);

  const keepItemVisibleInCurrentFilter = useCallback((id: string) => {
    setForceVisibleIds((prev) => new Set(prev).add(id));
  }, []);

  const handleUpdateItem = useCallback(
    (id: string, updates: Partial<NonConformityItem>) => {
      setForceVisibleIds((prev) => new Set(prev).add(id));
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      );
    },
    [],
  );

  const handleSave = useCallback(
    async (item: NonConformityItem) => {
      setSavingId(item.id);
      setFeedback((prev) => ({
        ...prev,
        [item.id]: { type: "success", message: "" },
      }));
      try {
        const existing = item.responseId
          ? (treatmentsByResponse[item.responseId] ?? [])
          : [];
        const nowIso = new Date().toISOString();
        const summary = item.summary.trim();
        const responsible = item.responsible.trim();
        const dueDateIso = item.dueDate
          ? new Date(`${item.dueDate}T00:00:00`).toISOString()
          : null;
        const existingTreatment = existing.find(
          (t) => t.questionId === item.questionId,
        );

        const updatedTreatment: ChecklistNonConformityTreatment = {
          questionId: item.questionId,
          summary: summary || null,
          responsible: responsible || null,
          dueDate: dueDateIso,
          status: item.status,
          createdAt: existingTreatment?.createdAt ?? nowIso,
          updatedAt: nowIso,
        };

        if (item.responseId) {
          const responseId = item.responseId;
          const nextTreatments = [
            ...existing.filter((t) => t.questionId !== item.questionId),
            updatedTreatment,
          ];
          await updateDoc(
            doc(collection(firebaseDb, "inspecoes"), responseId),
            {
              nonConformityTreatments: nextTreatments,
              updatedAt: nowIso,
            },
          );
          setTreatmentsByResponse((prev) => ({
            ...prev,
            [responseId]: nextTreatments,
          }));
        }

        const issueUpdatePayload: Record<string, unknown> = {
          pcmTreatment: updatedTreatment,
          updatedAt: nowIso,
        };
        if (item.status === "resolved") {
          const resolvedIssueStatus =
            item.issueStatus === "resolvida" ? "resolvida" : "concluida";
          issueUpdatePayload.status = resolvedIssueStatus;
          if (resolvedIssueStatus === "concluida") {
            issueUpdatePayload.concluidaEm = nowIso;
            issueUpdatePayload.concluidaPorTratativa = true;
          }
        } else {
          issueUpdatePayload.status = "aberta";
          issueUpdatePayload.concluidaEm = deleteField();
          issueUpdatePayload.concluidaPorTratativa = deleteField();
        }
        await updateDoc(
          doc(collection(firebaseDb, "issues"), item.id),
          issueUpdatePayload,
        );

        handleUpdateItem(item.id, {
          summary,
          responsible,
          dueDate: item.dueDate,
          dueDateIso,
          status: item.status,
          issueStatus:
            item.status === "resolved"
              ? item.issueStatus === "resolvida"
                ? "resolvida"
                : "concluida"
              : "aberta",
          updatedAt: nowIso,
        });
        setFeedback((prev) => ({
          ...prev,
          [item.id]: {
            type: "success",
            message: "Tratativa salva com sucesso",
          },
        }));
      } catch (err: unknown) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Erro ao salvar tratativa";
        setFeedback((prev) => ({
          ...prev,
          [item.id]: { type: "error", message },
        }));
      } finally {
        setSavingId(null);
      }
    },
    [handleUpdateItem, treatmentsByResponse],
  );

  const handleStatusClick = useCallback(
    async (item: NonConformityItem, status: NonConformityStatus) => {
      const updatedItem = { ...item, status };
      keepItemVisibleInCurrentFilter(item.id);
      handleUpdateItem(item.id, { status });
      await handleSave(updatedItem);
    },
    [handleSave, handleUpdateItem, keepItemVisibleInCurrentFilter],
  );

  const handleBulkStatusChange = useCallback(
    async (status: NonConformityStatus) => {
      const targetItems = items.filter((item) => selectedIds.includes(item.id));
      if (targetItems.length === 0) return;

      setBulkSaving(true);
      try {
        for (const target of targetItems) {
          const updatedItem = { ...target, status };
          keepItemVisibleInCurrentFilter(target.id);
          handleUpdateItem(target.id, { status });
          await handleSave(updatedItem);
        }
      } finally {
        setBulkSaving(false);
      }
    },
    [
      handleSave,
      handleUpdateItem,
      items,
      keepItemVisibleInCurrentFilter,
      selectedIds,
    ],
  );

  const handleToggleItemSelection = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id],
    );
  }, []);

  const handleToggleAllVisible = useCallback(() => {
    const visibleIds = filteredItems.map((item) => item.id);
    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedIds.includes(id));

    setSelectedIds((prev) => {
      if (allSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      const merged = new Set([...prev, ...visibleIds]);
      return Array.from(merged);
    });
  }, [filteredItems, selectedIds]);

  const handleToggleResolution = useCallback((itemId: string) => {
    setExpandedResolutions((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleDeleteItem = useCallback(async () => {
    if (!deleteDialogItem) return;

    setDeletingId(deleteDialogItem.id);
    try {
      const response = await fetch(`/api/admin/nc/${deleteDialogItem.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Erro ao excluir não conformidade");
      }

      setItems((prev) =>
        prev.filter((item) => item.id !== deleteDialogItem.id),
      );
      setSelectedIds((prev) => prev.filter((id) => id !== deleteDialogItem.id));
      setForceVisibleIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteDialogItem.id);
        return next;
      });
      setFeedback((prev) => {
        const next = { ...prev };
        delete next[deleteDialogItem.id];
        return next;
      });
      setDeleteDialogItem(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Erro ao excluir não conformidade";
      setFeedback((prev) => ({
        ...prev,
        [deleteDialogItem.id]: { type: "error", message },
      }));
    } finally {
      setDeletingId(null);
    }
  }, [deleteDialogItem]);

  const allVisibleSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedIds.includes(item.id));
  const selectedCount = selectedIds.length;
  const canLoadMoreInitialItems = hasMoreIssues;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              Não conformidades
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Visualize e trate as respostas marcadas como NC.
            </p>
          </div>
          <Button variant="secondary" disabled>
            Recarregar
          </Button>
        </header>
        {[0, 1, 2].map((key) => (
          <Card key={key}>
            <CardHeader>
              <Skeleton className="h-6 w-1/3" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 p-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">
              Não conformidades
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Visualize e trate as respostas marcadas como NC.
            </p>
          </div>
          <Button variant="secondary" onClick={() => loadData("reset")}>
            Recarregar
          </Button>
        </header>
        <div className="rounded-lg border border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_80%)] px-4 py-3 text-[var(--danger)]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">
            Não conformidades
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Somente respostas &quot;NC&quot; aparecem nesta lista para
            tratativa.
          </p>
        </div>
        <Button variant="secondary" onClick={() => loadData("reset")}>
          Recarregar
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-[var(--text)]">
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Máquina</span>
            <Input
              type="text"
              value={machineFilter}
              onChange={(event) => setMachineFilter(event.target.value)}
              list="machine-filter-options"
              placeholder="Digite nome, tag ou ID"
            />
            <datalist id="machine-filter-options">
              {machineOptionsForFilter.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Mantenedor</span>
            <Select
              value={maintainerFilter}
              onChange={(event) => setMaintainerFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {maintainerOptionsForFilter.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Status</span>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="planned">Com tratativa planejada</option>
              <option value="unplanned">Sem tratativa planejada</option>
              <option value="all">Todos</option>
              <option value="open">Abertas</option>
              <option value="resolved">Resolvidas</option>
              <option value="maintainer_resolved">
                Realizado pelo mantenedor
              </option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Data de vencimento</span>
            <Select
              value={dueDateFilter}
              onChange={(event) => setDueDateFilter(event.target.value)}
            >
              <option value="default">Padrão: atividade mais recente</option>
              <option value="oldest_first">Mais antigo para mais novo</option>
            </Select>
          </label>
        </CardContent>
      </Card>

      {filteredItems.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <label className="flex items-center gap-3 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary-500)]"
                checked={allVisibleSelected && filteredItems.length > 0}
                onChange={handleToggleAllVisible}
              />
              <div className="leading-tight">
                <div>
                  Selecionar todas as {filteredItems.length} NC exibidas
                </div>
                <div className="text-[var(--muted)]">
                  {selectedCount} selecionada{selectedCount === 1 ? "" : "s"}
                </div>
              </div>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={selectedCount === 0 || bulkSaving}
                onClick={() => handleBulkStatusChange("open")}
              >
                Marcar como pendente
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={selectedCount === 0 || bulkSaving}
                onClick={() => handleBulkStatusChange("in_progress")}
              >
                Marcar como em andamento
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={selectedCount === 0 || bulkSaving}
                onClick={() => handleBulkStatusChange("resolved")}
              >
                Marcar como resolvida
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filteredItems.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="Nenhuma não conformidade encontrada"
            description="Ajuste os filtros ou aguarde novas inspeções com NC registradas."
          />
          {canLoadMoreInitialItems ? (
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => loadData("append")}
                disabled={loadingMore || loadingAll}
                loading={loadingMore}
              >
                Carregar mais 20 NC
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => loadData("all")}
                disabled={loadingMore || loadingAll}
                loading={loadingAll}
              >
                Carregar todas
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          {filteredItems.map((item) => {
            const itemFeedback = feedback[item.id];
            const hasMaintainerResolution = item.maintainerResolution != null;
            const reincidenciaCount = item.reincidenciaCount;
            const isResolutionExpanded = expandedResolutions.has(item.id);
            return (
              <article key={item.id}>
                <Card>
                  <CardHeader className="space-y-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[var(--primary-500)]"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleToggleItemSelection(item.id)}
                      />
                      <div className="flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          {renderStatusBadge(item.status)}
                          {reincidenciaCount > 0 && (
                            <Badge variant="danger">
                              {"REINCID\u00caNCIA H\u00c1: " +
                                reincidenciaCount +
                                (reincidenciaCount === 1
                                  ? " INSPE\u00c7\u00c3O"
                                  : " INSPE\u00c7\u00d5ES")}
                            </Badge>
                          )}
                          {hasMaintainerResolution && (
                            <Badge variant="info">
                              REALIZADO PELO MANTENEDOR
                            </Badge>
                          )}
                          {item.recurrence && !reincidenciaCount && (
                            <Badge variant="warning">Reincid\u00eancia</Badge>
                          )}
                          {item.templateVersion && (
                            <Badge variant="muted">
                              Versão {item.templateVersion}
                            </Badge>
                          )}
                        </div>
                        {hasMaintainerResolution && (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => handleToggleResolution(item.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition"
                            >
                              {isResolutionExpanded
                                ? "Fechar detalhes"
                                : "Ver detalhes da resolução do mantenedor"}
                              <span className="text-[10px]">
                                {isResolutionExpanded ? "\u25B2" : "\u25BC"}
                              </span>
                            </button>
                            {isResolutionExpanded &&
                              item.maintainerResolution && (
                                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 space-y-1">
                                  {item.maintainerResolution.resolvedAt && (
                                    <p>
                                      <span className="font-semibold">
                                        Realizado em:
                                      </span>{" "}
                                      {formatDateTime(
                                        item.maintainerResolution.resolvedAt,
                                      )}
                                    </p>
                                  )}
                                  {item.maintainerResolution.resolvedByName && (
                                    <p>
                                      <span className="font-semibold">
                                        Mantenedor:
                                      </span>{" "}
                                      {item.maintainerResolution.resolvedByName}
                                      {item.maintainerResolution
                                        .resolvedByMatricula
                                        ? ` (mat. ${item.maintainerResolution.resolvedByMatricula})`
                                        : ""}
                                    </p>
                                  )}
                                  {item.maintainerResolution.description && (
                                    <p>
                                      <span className="font-semibold">
                                        Descrição:
                                      </span>{" "}
                                      {item.maintainerResolution.description}
                                    </p>
                                  )}
                                  {item.maintainerResolution.osNumero && (
                                    <p>
                                      <span className="font-semibold">
                                        Nº da O.S.:
                                      </span>{" "}
                                      {item.maintainerResolution.osNumero}
                                    </p>
                                  )}
                                </div>
                              )}
                          </div>
                        )}
                        <div className="space-y-1">
                          <CardTitle className="text-lg text-[var(--text)]">
                            {item.questionText}
                          </CardTitle>
                          <p className="text-sm text-[var(--muted)]">
                            Checklist em {formatDateTime(item.checklistDate)} —{" "}
                            {item.templateLabel}
                          </p>
                        </div>
                        <div className="grid gap-2 text-sm text-[var(--muted)] md:grid-cols-2">
                          <div>
                            <span className="font-medium text-[var(--text)]">
                              Máquina:
                            </span>{" "}
                            {item.machineLabel}
                          </div>
                          <div>
                            <span className="font-medium text-[var(--text)]">
                              Operador:
                            </span>{" "}
                            {item.operatorNome || "-"}
                            {item.operatorMatricula
                              ? ` (${item.operatorMatricula})`
                              : ""}
                          </div>
                          <div className="md:col-span-2">
                            <span className="font-medium text-[var(--text)]">
                              Nº da O.S. do item:
                            </span>{" "}
                            {item.itemOsNumero ?? "-"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {item.observation && (
                      <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-[var(--text)]">
                          Observações do operador
                        </h3>
                        <p className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)]">
                          {item.observation}
                        </p>
                      </section>
                    )}

                    {item.photos.length > 0 && (
                      <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-[var(--text)]">
                          Fotos
                        </h3>
                        <div className="flex flex-wrap gap-3">
                          {item.photos.map((photo, index) => (
                            <a
                              key={`${item.id}-photo-${index}`}
                              href={photo.url}
                              target="_blank"
                              rel="noreferrer"
                              className="group block overflow-hidden rounded-lg border border-[var(--border)] bg-white"
                              title="Clique para abrir em nova aba"
                            >
                              <Image
                                src={photo.url}
                                alt={`Foto da não conformidade ${index + 1}`}
                                width={160}
                                height={120}
                                className="h-24 w-40 object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                unoptimized
                              />
                            </a>
                          ))}
                        </div>
                      </section>
                    )}

                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-[var(--text)]">
                        Tratativa planejada
                      </h3>
                      <Textarea
                        value={item.summary}
                        onChange={(event) =>
                          handleUpdateItem(item.id, {
                            summary: event.target.value,
                          })
                        }
                        placeholder="Descreva a tratativa planejada"
                      />
                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="space-y-1 text-sm">
                          <span className="text-[var(--muted)]">
                            Responsável
                          </span>
                          <Input
                            value={item.responsible}
                            onChange={(event) =>
                              handleUpdateItem(item.id, {
                                responsible: event.target.value,
                              })
                            }
                            placeholder="Nome do responsável"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-[var(--muted)]">Prazo</span>
                          <Input
                            type="date"
                            value={item.dueDate}
                            onChange={(event) =>
                              handleUpdateItem(item.id, {
                                dueDate: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {STATUS_OPTIONS.map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            variant={
                              item.status === option.value
                                ? "default"
                                : "outline"
                            }
                            disabled={savingId === item.id || bulkSaving}
                            onClick={() =>
                              handleStatusClick(item, option.value)
                            }
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </section>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-[var(--muted)]">
                        {item.updatedAt
                          ? `Atualizado em ${formatDateTime(item.updatedAt)}`
                          : "Tratativa ainda não salva"}
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setDeleteDialogItem(item)}
                          disabled={
                            savingId === item.id ||
                            bulkSaving ||
                            deletingId === item.id
                          }
                        >
                          Excluir NC
                        </Button>
                        <Button
                          onClick={() => handleSave(item)}
                          loading={savingId === item.id}
                          disabled={bulkSaving || deletingId === item.id}
                        >
                          Salvar tratativa
                        </Button>
                        {itemFeedback?.message && (
                          <span
                            className={
                              itemFeedback.type === "success"
                                ? "text-sm text-[var(--primary-700)]"
                                : "text-sm text-[var(--danger)]"
                            }
                          >
                            {itemFeedback.message}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </article>
            );
          })}
          {canLoadMoreInitialItems ? (
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => loadData("append")}
                disabled={loadingMore || loadingAll}
                loading={loadingMore}
              >
                Carregar mais 20 NC
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => loadData("all")}
                disabled={loadingMore || loadingAll}
                loading={loadingAll}
              >
                Carregar todas
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteDialogItem)}
        title="Excluir não conformidade"
        description={
          deleteDialogItem
            ? `Deseja excluir o card "${deleteDialogItem.questionText}"? Esta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        busy={deletingId != null}
        onCancel={() => {
          if (deletingId) return;
          setDeleteDialogItem(null);
        }}
        onConfirm={handleDeleteItem}
      />
    </div>
  );
}
