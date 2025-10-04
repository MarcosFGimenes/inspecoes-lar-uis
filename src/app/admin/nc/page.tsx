"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
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
import type {
  ChecklistAnswer,
  ChecklistNonConformityTreatment,
  NonConformityStatus,
} from "@/types";

interface MachineOption {
  id: string;
  nome: string;
  tag?: string | null;
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
  responseId: string;
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
  photos: string[];
  status: NonConformityStatus;
  summary: string;
  responsible: string;
  dueDate: string;
  dueDateIso: string | null;
  recurrence: boolean;
  updatedAt: string | null;
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

function normalizeAnswers(
  data: Record<string, unknown>,
  templateItems: Map<string, TemplateItemData>
): ChecklistAnswer[] {
  const answers = Array.isArray(data.answers) ? (data.answers as ChecklistAnswer[]) : [];
  if (answers.length > 0) {
    return answers
      .filter(item => item?.questionId)
      .map(item => ({
        questionId: item.questionId,
        questionText:
          item.questionText ||
          templateItems.get(item.questionId)?.oQueChecar ||
          templateItems.get(item.questionId)?.criterio ||
          templateItems.get(item.questionId)?.componente ||
          `Item ${item.questionId}`,
        response: item.response === "nc" || item.response === "na" ? item.response : "c",
        observation: item.observation ?? null,
        photoUrls: Array.isArray(item.photoUrls) ? item.photoUrls.filter(Boolean) : [],
        recurrence: item.recurrence === true,
      }));
  }

  const itens = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
  return itens
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
        photoUrls: Array.isArray(item.fotos) ? item.fotos.filter(Boolean).map(String) : [],
        recurrence: false,
      } satisfies ChecklistAnswer;
    });
}

function buildMachineLabel(machine: Record<string, unknown>) {
  const nome = machine?.nome ? String(machine.nome) : "Máquina";
  const tag = machine?.tag ? String(machine.tag) : null;
  return tag ? `${nome} (${tag})` : nome;
}

function renderStatusBadge(status: NonConformityStatus) {
  if (status === "resolved") return <Badge variant="success">Resolvida</Badge>;
  if (status === "in_progress") return <Badge variant="warning">Em andamento</Badge>;
  return <Badge variant="danger">Aberta</Badge>;
}

const STATUS_OPTIONS: Array<{ value: NonConformityStatus; label: string }> = [
  { value: "open", label: "Aberta" },
  { value: "in_progress", label: "Em andamento" },
  { value: "resolved", label: "Resolvida" },
];

export default function AdminNonConformitiesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NonConformityItem[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [treatmentsByResponse, setTreatmentsByResponse] = useState<Record<string, ChecklistNonConformityTreatment[]>>({});
  const [machineFilter, setMachineFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, FeedbackState>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await fetch("/api/admin-session", { cache: "no-store" });
      if (session.status === 401) {
        window.location.href = "/admin/login";
        return;
      }

      const [machinesSnap, templatesSnap, responsesSnap] = await Promise.all([
        getDocs(collection(firebaseDb, "machines")),
        getDocs(collection(firebaseDb, "templates")),
        getDocs(query(collection(firebaseDb, "inspecoes"), orderBy("createdAt", "desc"), limit(200))),
      ]);

      const machineOptions: MachineOption[] = machinesSnap.docs.map(docSnap => {
        const data = docSnap.data() ?? {};
        return {
          id: docSnap.id,
          nome: typeof data.nome === "string" ? data.nome : docSnap.id,
          tag: data.tag ? String(data.tag) : null,
          ativo: data.ativo !== false,
        } satisfies MachineOption;
      });

      const templateMap = new Map<string, TemplateMeta>();
      templatesSnap.docs.forEach(docSnap => {
        const data = docSnap.data() ?? {};
        const itens = Array.isArray(data.itens) ? (data.itens as TemplateItemData[]) : [];
        const itensMap = new Map<string, TemplateItemData>();
        itens.forEach(item => {
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

      const builtItems: NonConformityItem[] = [];
      const treatmentsRecord: Record<string, ChecklistNonConformityTreatment[]> = {};

      responsesSnap.docs.forEach(docSnap => {
        const data = docSnap.data() ?? {};
        const machine = (data.machine ?? {}) as Record<string, unknown>;
        const maintainer = (data.maintainer ?? {}) as Record<string, unknown>;
        const templateInfo = (data.template ?? {}) as Record<string, unknown>;
        const templateId = templateInfo.id
          ? String(templateInfo.id)
          : machine.templateId
          ? String(machine.templateId)
          : null;
        const templateMeta = templateId ? templateMap.get(templateId) : undefined;
        const answers = normalizeAnswers(data, templateMeta?.itensMap ?? new Map());
        const treatmentsArray = Array.isArray(data.nonConformityTreatments)
          ? (data.nonConformityTreatments as ChecklistNonConformityTreatment[])
          : [];

        treatmentsRecord[docSnap.id] = treatmentsArray;
        const treatmentMap = new Map<string, ChecklistNonConformityTreatment>();
        treatmentsArray.forEach(treatment => {
          if (treatment?.questionId) {
            treatmentMap.set(treatment.questionId, treatment);
          }
        });

        answers
          .filter(answer => answer.response === "nc")
          .forEach(answer => {
            const treatment = treatmentMap.get(answer.questionId);
            const dueDateIso = treatment?.dueDate ? String(treatment.dueDate) : null;
            builtItems.push({
              id: `${docSnap.id}:${answer.questionId}`,
              responseId: docSnap.id,
              questionId: answer.questionId,
              machineId: machine.machineId ? String(machine.machineId) : machine.id ? String(machine.id) : null,
              machineLabel: buildMachineLabel(machine),
              machineTag: machine.tag ? String(machine.tag) : null,
              templateId,
              templateLabel: templateMeta?.nome ?? (templateInfo.nome ? String(templateInfo.nome) : "Template"),
              templateVersion: templateMeta?.versao ?? (templateInfo.versao ? String(templateInfo.versao) : null),
              questionText: answer.questionText ?? `Item ${answer.questionId}`,
              checklistDate: data.createdAt ? String(data.createdAt) : data.finalizadaEm ? String(data.finalizadaEm) : null,
              operatorNome: maintainer.nome ? String(maintainer.nome) : null,
              operatorMatricula: maintainer.matricula ? String(maintainer.matricula) : null,
              observation: answer.observation ?? null,
              photos: Array.isArray(answer.photoUrls) ? answer.photoUrls.filter(Boolean) : [],
              status: treatment?.status ?? "open",
              summary: treatment?.summary ?? "",
              responsible: treatment?.responsible ?? "",
              dueDate: formatDateInput(dueDateIso),
              dueDateIso,
              recurrence: answer.recurrence ?? false,
              updatedAt: treatment?.updatedAt ? String(treatment.updatedAt) : treatment?.createdAt ? String(treatment.createdAt) : null,
            });
          });
      });

      setMachines(machineOptions);
      setItems(builtItems);
      setTreatmentsByResponse(treatmentsRecord);
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao carregar dados";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (machineFilter !== "all" && item.machineId !== machineFilter) {
        return false;
      }
      if (statusFilter === "pending") {
        return item.status !== "resolved";
      }
      if (statusFilter === "all") {
        return true;
      }
      return item.status === statusFilter;
    });
  }, [items, machineFilter, statusFilter]);

  const handleUpdateItem = useCallback((id: string, updates: Partial<NonConformityItem>) => {
    setItems(prev => prev.map(item => (item.id === id ? { ...item, ...updates } : item)));
  }, []);

  const handleSave = useCallback(
    async (item: NonConformityItem) => {
      setSavingId(item.id);
      setFeedback(prev => ({ ...prev, [item.id]: { type: "success", message: "" } }));
      try {
        const existing = treatmentsByResponse[item.responseId] ?? [];
        const nowIso = new Date().toISOString();
        const summary = item.summary.trim();
        const responsible = item.responsible.trim();
        const dueDateIso = item.dueDate ? new Date(`${item.dueDate}T00:00:00`).toISOString() : null;

        const updatedTreatment: ChecklistNonConformityTreatment = {
          questionId: item.questionId,
          summary: summary || undefined,
          responsible: responsible || undefined,
          dueDate: dueDateIso,
          status: item.status,
          createdAt: existing.find(t => t.questionId === item.questionId)?.createdAt ?? nowIso,
          updatedAt: nowIso,
        };

        const nextTreatments = [
          ...existing.filter(t => t.questionId !== item.questionId),
          updatedTreatment,
        ];

        await updateDoc(doc(collection(firebaseDb, "inspecoes"), item.responseId), {
          nonConformityTreatments: nextTreatments,
          updatedAt: nowIso,
        });

        setTreatmentsByResponse(prev => ({ ...prev, [item.responseId]: nextTreatments }));
        handleUpdateItem(item.id, {
          summary,
          responsible,
          dueDate: item.dueDate,
          dueDateIso,
          status: item.status,
          updatedAt: nowIso,
        });
        setFeedback(prev => ({ ...prev, [item.id]: { type: "success", message: "Tratativa salva com sucesso" } }));
      } catch (err: unknown) {
        const message = err instanceof Error && err.message ? err.message : "Erro ao salvar tratativa";
        setFeedback(prev => ({ ...prev, [item.id]: { type: "error", message } }));
      } finally {
        setSavingId(null);
      }
    },
    [handleUpdateItem, treatmentsByResponse]
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">Não conformidades</h1>
            <p className="text-sm text-[var(--muted)]">Visualize e trate as respostas marcadas como NC.</p>
          </div>
          <Button variant="secondary" disabled>
            Recarregar
          </Button>
        </header>
        {[0, 1, 2].map(key => (
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
            <h1 className="text-2xl font-semibold text-[var(--text)]">Não conformidades</h1>
            <p className="text-sm text-[var(--muted)]">Visualize e trate as respostas marcadas como NC.</p>
          </div>
          <Button variant="secondary" onClick={() => loadData()}>
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
          <h1 className="text-2xl font-semibold text-[var(--text)]">Não conformidades</h1>
          <p className="text-sm text-[var(--muted)]">Somente respostas &quot;NC&quot; aparecem nesta lista para tratativa.</p>
        </div>
        <Button variant="secondary" onClick={() => loadData()}>
          Recarregar
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-[var(--text)]">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Máquina</span>
            <Select value={machineFilter} onChange={event => setMachineFilter(event.target.value)}>
              <option value="all">Todas</option>
              {machines
                .filter(machine => machine.ativo !== false)
                .map(machine => (
                  <option key={machine.id} value={machine.id}>
                    {machine.tag ? `${machine.nome} (${machine.tag})` : machine.nome}
                  </option>
                ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Status</span>
            <Select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="pending">Pendentes</option>
              <option value="all">Todos</option>
              <option value="open">Abertas</option>
              <option value="in_progress">Em andamento</option>
              <option value="resolved">Resolvidas</option>
            </Select>
          </label>
        </CardContent>
      </Card>

      {filteredItems.length === 0 ? (
        <EmptyState
          title="Nenhuma não conformidade encontrada"
          description="Ajuste os filtros ou aguarde novas inspeções com NC registradas."
        />
      ) : (
        <div className="space-y-6">
          {filteredItems.map(item => {
            const itemFeedback = feedback[item.id];
            return (
              <article key={item.id}>
                <Card>
                  <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {renderStatusBadge(item.status)}
                      {item.recurrence && <Badge variant="warning">Reincidência</Badge>}
                      {item.templateVersion && <Badge variant="muted">Versão {item.templateVersion}</Badge>}
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-lg text-[var(--text)]">{item.questionText}</CardTitle>
                      <p className="text-sm text-[var(--muted)]">
                        Checklist em {formatDateTime(item.checklistDate)} — {item.templateLabel}
                      </p>
                    </div>
                    <div className="grid gap-2 text-sm text-[var(--muted)] md:grid-cols-2">
                      <div>
                        <span className="font-medium text-[var(--text)]">Máquina:</span> {item.machineLabel}
                      </div>
                      <div>
                        <span className="font-medium text-[var(--text)]">Operador:</span> {item.operatorNome || "-"}
                        {item.operatorMatricula ? ` (${item.operatorMatricula})` : ""}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {item.observation && (
                      <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-[var(--text)]">Observações do operador</h3>
                        <p className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)]">
                          {item.observation}
                        </p>
                      </section>
                    )}

                    {item.photos.length > 0 && (
                      <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-[var(--text)]">Fotos</h3>
                        <div className="flex flex-wrap gap-3">
                          {item.photos.map((photo, index) => (
                            <div
                              key={`${item.id}-photo-${index}`}
                              className="overflow-hidden rounded-lg border border-[var(--border)] bg-white"
                            >
                              <Image
                                src={photo}
                                alt={`Foto da não conformidade ${index + 1}`}
                                width={160}
                                height={120}
                                className="h-24 w-40 object-cover"
                                unoptimized
                              />
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-[var(--text)]">Tratativa planejada</h3>
                      <Textarea
                        value={item.summary}
                        onChange={event => handleUpdateItem(item.id, { summary: event.target.value })}
                        placeholder="Descreva a tratativa planejada"
                      />
                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="space-y-1 text-sm">
                          <span className="text-[var(--muted)]">Responsável</span>
                          <Input
                            value={item.responsible}
                            onChange={event => handleUpdateItem(item.id, { responsible: event.target.value })}
                            placeholder="Nome do responsável"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-[var(--muted)]">Prazo</span>
                          <Input
                            type="date"
                            value={item.dueDate}
                            onChange={event => handleUpdateItem(item.id, { dueDate: event.target.value })}
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {STATUS_OPTIONS.map(option => (
                          <Button
                            key={option.value}
                            type="button"
                            variant={item.status === option.value ? "default" : "outline"}
                            onClick={() => handleUpdateItem(item.id, { status: option.value })}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </section>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-[var(--muted)]">
                        {item.updatedAt ? `Atualizado em ${formatDateTime(item.updatedAt)}` : "Tratativa ainda não salva"}
                      </div>
                      <div className="flex items-center gap-3">
                        <Button onClick={() => handleSave(item)} loading={savingId === item.id}>
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
        </div>
      )}
    </div>
  );
}
