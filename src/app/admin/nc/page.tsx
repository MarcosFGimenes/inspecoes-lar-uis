"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  collection,
  deleteField,
  doc,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  ChecklistNonConformityTreatment,
  NonConformityStatus,
  StoredImage,
} from "@/types";
import { sortByLastActivityDesc } from "@/lib/non-conformity-priority";

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

interface NonConformityRecurrenceHistoryItem {
  inspectionId: string;
  checklistDate: string | null;
  observation: string | null;
  osNumero: string | null;
  osStatus: string | null;
  operatorNome: string | null;
}

interface MaintainerResolutionInfo {
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolvedByMatricula: string | null;
  description: string;
  osNumero: string | null;
  inspecaoId: string | null;
}

interface FeedbackState {
  type: "success" | "error";
  message: string;
}

interface MaintainerOption {
  id: string;
  nome: string | null;
  matricula: string | null;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
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

const NC_PAGE_SIZE = 20;

export default function AdminNonConformitiesPage() {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NonConformityItem[]>([]);
  const [treatmentsByResponse, setTreatmentsByResponse] = useState<Record<string, ChecklistNonConformityTreatment[]>>({});
  const [machineFilter, setMachineFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("aberta");
  const [maintainerFilter, setMaintainerFilter] = useState("");
  const [maintainers, setMaintainers] = useState<MaintainerOption[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, FeedbackState>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [expandedResolutions, setExpandedResolutions] = useState<Set<string>>(new Set());
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [deleteDialogItemId, setDeleteDialogItemId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => items.some(item => item.id === id)));
  }, [items]);

  const loadData = useCallback(async (reset = true, fetchAll = false, requestOffset = 0) => {
    if (!reset && loadingMoreRef.current) return;
    if (reset) setLoading(true);
    else {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      if (maintainerFilter) {
        params.set("mantenedor_id", maintainerFilter);
      }
      if (fetchAll) {
        params.set("all", "1");
      } else {
        params.set("limit", String(NC_PAGE_SIZE));
        params.set("offset", String(reset ? 0 : requestOffset));
      }

      const session = await fetch(`/api/admin/nc?${params.toString()}`, { cache: "no-store" });
      if (session.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!session.ok) {
        throw new Error("Falha ao carregar não conformidades.");
      }
      const payload = (await session.json()) as {
        items?: NonConformityItem[];
        treatmentsByResponse?: Record<string, ChecklistNonConformityTreatment[]>;
        total?: number;
        hasMore?: boolean;
        nextOffset?: number;
      };
      const nextItems = sortByLastActivityDesc(payload.items ?? []);
      setItems(prev => (reset || fetchAll ? nextItems : sortByLastActivityDesc([...prev, ...nextItems])));
      setTreatmentsByResponse(payload.treatmentsByResponse ?? {});
      setHasMore(Boolean(payload.hasMore));
      setTotalItems(typeof payload.total === "number" ? payload.total : nextItems.length);
      setOffset(typeof payload.nextOffset === "number" ? payload.nextOffset : nextItems.length);
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao carregar dados";
      setError(message);
    } finally {
      if (reset) setLoading(false);
      else {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [maintainerFilter, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    async function loadMaintainers() {
      try {
        const response = await fetch("/api/mantenedores", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as Array<Record<string, unknown>>;
        if (cancelled) return;
        const options = payload
          .map(item => ({
            id: String(item.id ?? ""),
            nome: typeof item.nome === "string" ? item.nome : null,
            matricula: typeof item.matricula === "string" ? item.matricula : null,
          }))
          .filter(item => item.id)
          .sort((a, b) => `${a.matricula ?? ""} ${a.nome ?? ""}`.localeCompare(`${b.matricula ?? ""} ${b.nome ?? ""}`, "pt-BR"));
        setMaintainers(options);
      } catch {
        // Falha de carregamento dos mantenedores não bloqueia a página.
      }
    }
    loadMaintainers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadData(true);
  }, [statusFilter, maintainerFilter, loadData]);

  const machineOptionsForFilter = useMemo(() => {
    return Array.from(new Set(items.map(item => item.machineLabel.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    const machineSearch = machineFilter.trim().toLowerCase();
    return items.filter(item => {
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
      return true;
    });
  }, [items, machineFilter]);

  const handleUpdateItem = useCallback((id: string, updates: Partial<NonConformityItem>) => {
    setItems(prev =>
      sortByLastActivityDesc(prev.map(item => (item.id === id ? { ...item, ...updates } : item)))
    );
  }, []);

  const handleSave = useCallback(
    async (item: NonConformityItem) => {
      setSavingId(item.id);
      setFeedback(prev => ({ ...prev, [item.id]: { type: "success", message: "" } }));
      try {
        const existing = item.responseId ? (treatmentsByResponse[item.responseId] ?? []) : [];
        const nowIso = new Date().toISOString();
        const summary = item.summary.trim();
        const responsible = item.responsible.trim();
        const dueDateIso = item.dueDate ? new Date(`${item.dueDate}T00:00:00`).toISOString() : null;
        const existingTreatment = existing.find(t => t.questionId === item.questionId);

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
            ...existing.filter(t => t.questionId !== item.questionId),
            updatedTreatment,
          ];
          await updateDoc(doc(collection(firebaseDb, "inspecoes"), responseId), {
            nonConformityTreatments: nextTreatments,
            updatedAt: nowIso,
          });
          setTreatmentsByResponse(prev => ({ ...prev, [responseId]: nextTreatments }));
        }

        const issueUpdatePayload: Record<string, unknown> = {
          pcmTreatment: updatedTreatment,
          updatedAt: nowIso,
        };
        if (item.status === "resolved") {
          const resolvedIssueStatus = item.issueStatus === "resolvida" ? "resolvida" : "concluida";
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
        await updateDoc(doc(collection(firebaseDb, "issues"), item.id), issueUpdatePayload);

        handleUpdateItem(item.id, {
          summary,
          responsible,
          dueDate: item.dueDate,
          dueDateIso,
          status: item.status,
          issueStatus: item.status === "resolved"
            ? item.issueStatus === "resolvida"
              ? "resolvida"
              : "concluida"
            : "aberta",
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

  const handleStatusClick = useCallback(
    async (item: NonConformityItem, status: NonConformityStatus) => {
      const updatedItem = { ...item, status };
      handleUpdateItem(item.id, { status });
      await handleSave(updatedItem);
    },
    [handleSave, handleUpdateItem]
  );

  const handleBulkStatusChange = useCallback(
    async (status: NonConformityStatus) => {
      const targetItems = items.filter(item => selectedIds.includes(item.id));
      if (targetItems.length === 0) return;

      setBulkSaving(true);
      try {
        for (const target of targetItems) {
          const updatedItem = { ...target, status };
          handleUpdateItem(target.id, { status });
          await handleSave(updatedItem);
        }
      } finally {
        setBulkSaving(false);
      }
    },
    [handleSave, handleUpdateItem, items, selectedIds]
  );

  const handleToggleItemSelection = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  }, []);

  const handleToggleAllVisible = useCallback(() => {
    const visibleIds = filteredItems.map(item => item.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));

    setSelectedIds(prev => {
      if (allSelected) {
        return prev.filter(id => !visibleIds.includes(id));
      }
      const merged = new Set([...prev, ...visibleIds]);
      return Array.from(merged);
    });
  }, [filteredItems, selectedIds]);

  const handleToggleResolution = useCallback((itemId: string) => {
    setExpandedResolutions(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleToggleHistory = useCallback((itemId: string) => {
    setExpandedHistory(prev => {
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
    if (!deleteDialogItemId) return;
    setDeletingId(deleteDialogItemId);
    try {
      const response = await fetch(`/api/admin/nc/${deleteDialogItemId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Não foi possível excluir a não conformidade.");
      }
      setItems(prev => prev.filter(item => item.id !== deleteDialogItemId));
      setSelectedIds(prev => prev.filter(id => id !== deleteDialogItemId));
      setDeleteDialogItemId(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao excluir não conformidade";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  }, [deleteDialogItemId]);

  const allVisibleSelected =
    filteredItems.length > 0 && filteredItems.every(item => selectedIds.includes(item.id));
  const selectedCount = selectedIds.length;

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
          <Button variant="secondary" onClick={() => loadData(true)}>
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
        <Button variant="secondary" onClick={() => loadData(true)}>
          Recarregar
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-[var(--text)]">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Máquina</span>
            <Input
              type="text"
              value={machineFilter}
              onChange={event => setMachineFilter(event.target.value)}
              list="machine-filter-options"
              placeholder="Digite nome, tag ou ID"
            />
            <datalist id="machine-filter-options">
              {machineOptionsForFilter.map(option => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Status</span>
            <Select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="aberta">Abertas</option>
              <option value="concluida">Concluídas</option>
              <option value="resolvida">Resolvidas</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Mantenedor</span>
            <Select value={maintainerFilter} onChange={event => setMaintainerFilter(event.target.value)}>
              <option value="">Todos</option>
              {maintainers.map(maintainer => (
                <option key={maintainer.id} value={maintainer.id}>
                  {maintainer.matricula ? `${maintainer.matricula} — ` : ""}
                  {maintainer.nome ?? maintainer.id}
                </option>
              ))}
            </Select>
          </label>
        </CardContent>
      </Card>

      <div className="text-sm text-[var(--muted)]">
        Mostrando {items.length} de {totalItems} não conformidades.
      </div>

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
                <div>Selecionar todas as {filteredItems.length} NC exibidas</div>
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
        <EmptyState
          title="Nenhuma não conformidade encontrada"
          description="Ajuste os filtros ou aguarde novas inspeções com NC registradas."
        />
      ) : (
        <div className="space-y-6">
          {filteredItems.map(item => {
            const itemFeedback = feedback[item.id];
            const hasMaintainerResolution = item.maintainerResolution != null;
            const reincidenciaCount = item.reincidenciaCount;
            const isResolutionExpanded = expandedResolutions.has(item.id);
            const hasHistory = item.recurrenceHistory.length > 0;
            const isHistoryExpanded = expandedHistory.has(item.id);
            const visibleHistory = isHistoryExpanded ? item.recurrenceHistory : item.recurrenceHistory.slice(0, 3);
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
                            <Badge variant="danger">{"REINCID\u00caNCIA H\u00c1: " + reincidenciaCount + (reincidenciaCount === 1 ? " INSPE\u00c7\u00c3O" : " INSPE\u00c7\u00d5ES")}</Badge>
                          )}
                          {hasMaintainerResolution && (
                            <Badge variant="info">REALIZADO PELO MANTENEDOR</Badge>
                          )}
                          {item.recurrence && !reincidenciaCount && <Badge variant="warning">Reincid\u00eancia</Badge>}
                          {item.templateVersion && <Badge variant="muted">Versão {item.templateVersion}</Badge>}
                        </div>
                        {hasMaintainerResolution && (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => handleToggleResolution(item.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition"
                            >
                              {isResolutionExpanded ? "Fechar detalhes" : "Ver detalhes da resolução do mantenedor"}
                              <span className="text-[10px]">{isResolutionExpanded ? "\u25B2" : "\u25BC"}</span>
                            </button>
                            {isResolutionExpanded && item.maintainerResolution && (
                              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 space-y-1">
                                {item.maintainerResolution.resolvedAt && (
                                  <p>
                                    <span className="font-semibold">Realizado em:</span>{" "}
                                    {formatDateTime(item.maintainerResolution.resolvedAt)}
                                  </p>
                                )}
                                {item.maintainerResolution.resolvedByName && (
                                  <p>
                                    <span className="font-semibold">Mantenedor:</span>{" "}
                                    {item.maintainerResolution.resolvedByName}
                                    {item.maintainerResolution.resolvedByMatricula
                                      ? ` (mat. ${item.maintainerResolution.resolvedByMatricula})`
                                      : ""}
                                  </p>
                                )}
                                {item.maintainerResolution.description && (
                                  <p>
                                    <span className="font-semibold">Descrição:</span>{" "}
                                    {item.maintainerResolution.description}
                                  </p>
                                )}
                                {item.maintainerResolution.osNumero && (
                                  <p>
                                    <span className="font-semibold">Nº da O.S.:</span>{" "}
                                    {item.maintainerResolution.osNumero}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
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
                          <div className="md:col-span-2">
                            <span className="font-medium text-[var(--text)]">Nº da O.S. do item:</span> {item.itemOsNumero ?? "-"}
                          </div>
                        </div>
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
                            disabled={savingId === item.id || bulkSaving}
                            onClick={() => handleStatusClick(item, option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-[var(--text)]">Histórico de reincidências</h3>
                      {!hasHistory ? (
                        <p className="text-sm text-[var(--muted)]">Sem histórico anterior.</p>
                      ) : (
                        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-white">
                          {visibleHistory.map(historyItem => (
                            <div key={`${item.id}-${historyItem.inspectionId}`} className="space-y-1 px-3 py-2">
                              <p className="text-xs text-[var(--muted)]">
                                {formatDateTime(historyItem.checklistDate)}
                                {historyItem.operatorNome ? ` · ${historyItem.operatorNome}` : ""}
                              </p>
                              <p className="text-sm text-[var(--text)]">{historyItem.observation || "-"}</p>
                              <p className="text-xs text-[var(--muted)]">
                                O.S.: {historyItem.osNumero || "-"}
                                {historyItem.osStatus ? ` · Status: ${historyItem.osStatus}` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                      {item.recurrenceHistory.length > 3 && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto px-0 py-1 text-xs"
                          onClick={() => handleToggleHistory(item.id)}
                        >
                          {isHistoryExpanded ? "Exibir apenas 3 últimas" : "Exibir histórico completo"}
                        </Button>
                      )}
                    </section>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-[var(--muted)]">
                        {item.updatedAt ? `Atualizado em ${formatDateTime(item.updatedAt)}` : "Tratativa ainda não salva"}
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setDeleteDialogItemId(item.id)}
                          disabled={bulkSaving || deletingId === item.id}
                        >
                          Excluir NC
                        </Button>
                        <Button
                          onClick={() => handleSave(item)}
                          loading={savingId === item.id}
                          disabled={bulkSaving}
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
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="text-sm text-[var(--muted)]">
            {hasMore ? "Há mais registros disponíveis." : "Todos os registros carregados."}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!hasMore || loadingMore || loading}
              loading={loadingMore}
              onClick={() => loadData(false, false, offset)}
            >
              Mostrar mais 20
            </Button>
            <Button
              variant="secondary"
              disabled={!hasMore || loadingMore || loading}
              loading={loadingMore}
              onClick={() => loadData(false, true, offset)}
            >
              Mostrar todas
            </Button>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleteDialogItemId != null}
        title="Excluir não conformidade?"
        description="Essa ação remove o card da NC e não poderá ser desfeita."
        confirmLabel="Excluir NC"
        cancelLabel="Cancelar"
        busy={deletingId != null}
        onCancel={() => {
          if (deletingId) return;
          setDeleteDialogItemId(null);
        }}
        onConfirm={handleDeleteItem}
      />
    </div>
  );
}
