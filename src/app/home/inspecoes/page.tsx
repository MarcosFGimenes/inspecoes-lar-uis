"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { fetchCorrectiveAssignees } from "@/lib/correctives/assignees";
import type { StoredImage } from "@/types";

type MaintInspectionListItem = {
  id: string;
  machineTag: string | null;
  machineNome: string | null;
  machineSetor: string | null;
  machineUnidade: string | null;
  finalizadaEm: string | null;
  osNumero: string | null;
  qtdNc: number;
};

const PAGE_LIMIT = 20;
const CORRECTIVE_LIMIT = 20;

type CorrectiveHistoryItem = {
  osId: string;
  osNumero: string | null;
  ncId: string | null;
  description: string | null;
  ncDescription: string | null;
  area: string | null;
  effectiveSeverity: number | null;
  scheduledDate: string | null;
  completedAt: string | null;
  dueDate: string | null;
  machineName: string | null;
  machineTag: string | null;
  assignees: {
    owner: string | null;
    maintainer1: string | null;
    maintainer2: string | null;
  } | null;
  completionNotes: string | null;
  ncPhotos: StoredImage[] | null;
  updatedAt: string | null;
  status: string | null;
};

type AssigneeInfo = {
  id: string;
  nome: string | null;
  matricula: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function toIsoBoundary(value: string | null, boundary: "start" | "end"): string | null {
  if (!value) {
    return null;
  }
  const iso = boundary === "end" ? `${value}T23:59:59.999` : `${value}T00:00:00.000`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export default function MaintCompletedInspectionsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"inspections" | "correctives">("inspections");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedStart, setAppliedStart] = useState("");
  const [appliedEnd, setAppliedEnd] = useState("");
  const [items, setItems] = useState<MaintInspectionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [correctiveItems, setCorrectiveItems] = useState<CorrectiveHistoryItem[]>([]);
  const [correctiveCursor, setCorrectiveCursor] = useState<string | null>(null);
  const [correctiveLoading, setCorrectiveLoading] = useState(false);
  const [correctiveLoadingMore, setCorrectiveLoadingMore] = useState(false);
  const [correctiveInitialized, setCorrectiveInitialized] = useState(false);
  const [correctiveError, setCorrectiveError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<AssigneeInfo[]>([]);
  const [assigneesLoaded, setAssigneesLoaded] = useState(false);
  const [assigneesError, setAssigneesError] = useState<string | null>(null);
  const [historyExpandedId, setHistoryExpandedId] = useState<string | null>(null);
  const [historySelected, setHistorySelected] = useState<CorrectiveHistoryItem | null>(null);
  const assigneesAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      setSessionLoading(true);
      setSessionError(null);
      try {
        const response = await fetch("/api/auth/maint/me", { cache: "no-store" });
        if (response.status === 401) {
          if (!cancelled) {
            setSessionId(null);
            setSessionError("Sessão expirada. Faça login novamente.");
          }
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(typeof payload?.error === "string" ? payload.error : "Falha ao carregar sessão");
        }
        const data = await response.json();
        if (!cancelled) {
          setSessionId(data?.store?.id ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error && error.message ? error.message : "Falha ao carregar sessão";
          setSessionError(message);
          setSessionId(null);
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const date = params.get("date") ?? "";
    setStartDate(date);
    setEndDate(date);
    setAppliedStart(date);
    setAppliedEnd(date);
  }, []);

  const dateError = useMemo(() => {
    if (!appliedStart || !appliedEnd) return null;
    if (appliedStart > appliedEnd) {
      return "A data inicial deve ser anterior ou igual à data final.";
    }
    return null;
  }, [appliedEnd, appliedStart]);

  const assigneeMap = useMemo(() => {
    const map = new Map<string, AssigneeInfo>();
    assignees.forEach(info => {
      map.set(info.id, info);
    });
    return map;
  }, [assignees]);

  const formatArea = useCallback((area: string | null) => {
    if (area === "mechanical") return "Mecânica";
    if (area === "electrical") return "Elétrica";
    if (typeof area === "string" && area.trim().length > 0) {
      return area;
    }
    return "-";
  }, []);

  const formatSeverity = useCallback((value: number | null) => {
    if (!value) {
      return "-";
    }
    return `Nível ${value}`;
  }, []);

  const formatStatus = useCallback((status: string | null) => {
    if (!status) return "-";
    const normalized = status.replace(/_/g, " ");
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }, []);

  const resolveStatusVariant = useCallback((status: string | null) => {
    if (!status) return "muted" as const;
    const normalized = status.toLowerCase();
    if (normalized === "scheduled") return "warning" as const;
    if (normalized === "in_progress") return "default" as const;
    if (normalized === "done") return "success" as const;
    return "muted" as const;
  }, []);

  const formatOsNumber = useCallback((item: CorrectiveHistoryItem) => {
    const formatted = item.osNumero?.trim();
    if (formatted && formatted.length > 0) {
      return formatted;
    }
    return item.osId;
  }, []);

  const formatAssignees = useCallback(
    (assigneesValue: CorrectiveHistoryItem["assignees"]) => {
      if (!assigneesValue) {
        return "-";
      }
      const ids = [
        assigneesValue.owner,
        assigneesValue.maintainer1,
        assigneesValue.maintainer2,
      ].filter((id): id is string => Boolean(id && id.trim().length > 0));
      if (ids.length === 0) {
        return "-";
      }
      const uniqueIds = ids.filter((id, index) => ids.indexOf(id) === index);
      const labels = uniqueIds.map(id => {
        const info = assigneeMap.get(id);
        if (!info) {
          return id;
        }
        const parts = [info.matricula, info.nome].filter(part => Boolean(part && part.trim()));
        return parts.join(" — ") || id;
      });
      return labels.join("\n");
    },
    [assigneeMap]
  );

  const fetchInspections = useCallback(
    async ({ reset, cursor }: { reset: boolean; cursor?: string }) => {
      if (reset) {
        setLoading(true);
        setError(null);
        setNextCursor(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const params = new URLSearchParams();
        if (appliedStart.trim()) {
          params.set("startDate", appliedStart.trim());
        }
        if (appliedEnd.trim()) {
          params.set("endDate", appliedEnd.trim());
        }
        params.set("limit", String(PAGE_LIMIT));
        if (cursor) {
          params.set("cursor", cursor);
        }
        const response = await fetch(`/api/me/inspecoes?${params.toString()}`, { cache: "no-store" });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(typeof payload?.error === "string" ? payload.error : "Falha ao carregar inspeções");
        }
        const data = await response.json();
        const rawItems = Array.isArray(data?.items) ? (data.items as MaintInspectionListItem[]) : [];
        const normalized = rawItems
          .map(item => ({
            id: item?.id ? String(item.id) : "",
            machineTag: item?.machineTag ?? null,
            machineNome: item?.machineNome ?? null,
            machineSetor: item?.machineSetor ?? null,
            machineUnidade: item?.machineUnidade ?? null,
            finalizadaEm: item?.finalizadaEm ?? null,
            osNumero: item?.osNumero ?? null,
            qtdNc: Number.isFinite(item?.qtdNc) ? Number(item?.qtdNc) : 0,
          }))
          .filter(item => item.id);
        setItems(prev => (reset ? normalized : [...prev, ...normalized]));
        setNextCursor(data?.nextCursor ? String(data.nextCursor) : null);
      } catch (err: unknown) {
        const message = err instanceof Error && err.message ? err.message : "Falha ao carregar inspeções";
        if (reset) {
          setItems([]);
          setError(message);
        } else {
          setError(message);
        }
      } finally {
        if (reset) {
          setLoading(false);
          setInitializing(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [appliedEnd, appliedStart]
  );

  const fetchCorrectivesHistory = useCallback(
    async ({ reset, cursor }: { reset: boolean; cursor?: string | null }) => {
      if (!sessionId) {
        return;
      }

      if (reset) {
        setCorrectiveLoading(true);
        setCorrectiveError(null);
        setCorrectiveCursor(null);
        setHistoryExpandedId(null);
        setCorrectiveItems([]);
      } else {
        setCorrectiveLoadingMore(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("limit", String(CORRECTIVE_LIMIT));
        params.set("status", "done");
        params.set("responsible", sessionId);

        const fromIso = toIsoBoundary(appliedStart, "start");
        const toIso = toIsoBoundary(appliedEnd, "end");
        if (fromIso) {
          params.set("from", fromIso);
        }
        if (toIso) {
          params.set("to", toIso);
        }
        if (cursor) {
          params.set("cursor", cursor);
        }

        const response = await fetch(`/api/correctives/os?${params.toString()}`, { cache: "no-store" });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            typeof payload?.error === "string" ? payload.error : "Falha ao carregar corretivas concluídas"
          );
        }

        const data = await response.json();
        const rawItems = Array.isArray(data?.items) ? data.items : [];
        const normalized = rawItems
          .map(item => {
            const osId = typeof item?.osId === "string" ? item.osId : "";
            if (!osId) return null;
            const assigneePayload =
              item?.assignees && typeof item.assignees === "object"
                ? {
                    owner: typeof (item.assignees as Record<string, unknown>).owner === "string"
                      ? (item.assignees as Record<string, unknown>).owner
                      : null,
                    maintainer1: typeof (item.assignees as Record<string, unknown>).maintainer1 === "string"
                      ? (item.assignees as Record<string, unknown>).maintainer1
                      : null,
                    maintainer2: typeof (item.assignees as Record<string, unknown>).maintainer2 === "string"
                      ? (item.assignees as Record<string, unknown>).maintainer2
                      : null,
                  }
                : null;
            return {
              osId,
              osNumero: typeof item?.osNumero === "string" ? item.osNumero : null,
              ncId: typeof item?.ncId === "string" ? item.ncId : null,
              description: typeof item?.description === "string" ? item.description : null,
              ncDescription: typeof item?.ncDescription === "string" ? item.ncDescription : null,
              area: typeof item?.area === "string" ? item.area : null,
              effectiveSeverity: Number.isFinite(item?.effectiveSeverity)
                ? Number(item.effectiveSeverity)
                : null,
              scheduledDate: typeof item?.scheduledDate === "string" ? item.scheduledDate : null,
              completedAt: typeof item?.completedAt === "string" ? item.completedAt : null,
              dueDate: typeof item?.dueDate === "string" ? item.dueDate : null,
              machineName: typeof item?.machineName === "string" ? item.machineName : null,
              machineTag: typeof item?.machineTag === "string" ? item.machineTag : null,
              assignees: assigneePayload,
              completionNotes: typeof item?.completionNotes === "string" ? item.completionNotes : null,
              ncPhotos: Array.isArray(item?.ncPhotos) ? (item.ncPhotos as StoredImage[]) : null,
              updatedAt: typeof item?.updatedAt === "string" ? item.updatedAt : null,
              status: typeof item?.status === "string" ? item.status : null,
            } satisfies CorrectiveHistoryItem;
          })
          .filter((entry): entry is CorrectiveHistoryItem => Boolean(entry && entry.osId));

        setCorrectiveItems(prev => (reset ? normalized : [...prev, ...normalized]));
        setCorrectiveCursor(data?.nextCursor ?? null);
        setCorrectiveInitialized(true);
        setCorrectiveError(null);
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Falha ao carregar corretivas concluídas";
        if (reset) {
          setCorrectiveItems([]);
        }
        setCorrectiveError(message);
      } finally {
        setCorrectiveLoading(false);
        setCorrectiveLoadingMore(false);
      }
    },
    [appliedEnd, appliedStart, sessionId]
  );

  useEffect(() => {
    if (appliedStart && appliedEnd && appliedStart > appliedEnd) {
      setItems([]);
      setError("A data inicial deve ser anterior ou igual à data final.");
      setLoading(false);
      setLoadingMore(false);
      setInitializing(false);
      return;
    }
    fetchInspections({ reset: true }).catch(() => undefined);
  }, [appliedEnd, appliedStart, fetchInspections]);

  useEffect(() => {
    if (activeTab !== "correctives") {
      return;
    }
    if (!sessionId) {
      return;
    }
    fetchCorrectivesHistory({ reset: true, cursor: null }).catch(() => undefined);
  }, [activeTab, sessionId, fetchCorrectivesHistory]);

  useEffect(() => {
    if (activeTab !== "correctives") {
      return;
    }
    if (assigneesLoaded) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    assigneesAbortRef.current?.abort();
    assigneesAbortRef.current = controller;

    fetchCorrectiveAssignees({ signal: controller.signal, limit: 500 })
      .then(result => {
        if (cancelled) {
          return;
        }
        const mapped = result.map(option => ({
          id: option.id,
          nome: option.nome ?? null,
          matricula: option.matricula ?? null,
        }));
        setAssignees(mapped);
        setAssigneesLoaded(true);
        setAssigneesError(null);
      })
      .catch(error => {
        if (cancelled) {
          return;
        }
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        const message = error instanceof Error && error.message ? error.message : "Falha ao carregar responsáveis.";
        setAssigneesError(message);
      })
      .finally(() => {
        if (!cancelled) {
          assigneesAbortRef.current = null;
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeTab, assigneesLoaded]);

  useEffect(() => {
    return () => {
      assigneesAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!historyExpandedId) {
      setHistorySelected(null);
      return;
    }
    const match = correctiveItems.find(item => item.osId === historyExpandedId) ?? null;
    setHistorySelected(match ?? null);
  }, [correctiveItems, historyExpandedId]);

  const applyFilters = useCallback(() => {
    setAppliedStart(startDate.trim());
    setAppliedEnd(endDate.trim());
  }, [endDate, startDate]);

  const clearFilters = useCallback(() => {
    setStartDate("");
    setEndDate("");
    setAppliedStart("");
    setAppliedEnd("");
  }, []);

  const handleViewInspection = useCallback(
    (id: string) => {
      router.push(`/home/inspecoes/${encodeURIComponent(id)}`);
    },
    [router]
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 px-6 py-8 text-white shadow-lg">
        <h1 className="text-3xl font-semibold">Inspeções concluídas</h1>
        <p className="mt-2 text-sm text-emerald-100">
          Consulte o histórico completo, gere PDFs e relembre as respostas registradas sem alterar o resultado oficial.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("inspections")}
            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
              activeTab === "inspections"
                ? "bg-emerald-600 text-white shadow"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Inspeções de rota (0441)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("correctives")}
            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
              activeTab === "correctives"
                ? "bg-emerald-600 text-white shadow"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Corretivas concluídas
          </button>
        </div>
        {sessionLoading ? <span className="text-xs text-slate-400">Carregando sessão...</span> : null}
      </div>

      {sessionError && activeTab === "correctives" ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{sessionError}</div>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-xs font-medium text-slate-600 sm:text-sm">
              <span>Data inicial</span>
              <input
                type="date"
                value={startDate}
                onChange={event => setStartDate(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600 sm:text-sm">
              <span>Data final</span>
              <input
                type="date"
                value={endDate}
                onChange={event => setEndDate(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Aplicar filtros
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Limpar
            </button>
          </div>
        </div>
      </section>

      {activeTab === "inspections" ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Histórico de inspeções</h2>
              <p className="text-sm text-slate-500">
                Toque para revisar as respostas ou gerar o PDF da inspeção finalizada.
              </p>
            </div>
            {initializing ? null : <span className="text-xs text-slate-400">{items.length} inspeções listadas</span>}
          </header>

          {dateError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{dateError}</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          {loading && initializing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Nenhuma inspeção encontrada para o período selecionado.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map(item => {
                const finishedLabel = formatDateTime(item.finalizadaEm);
                return (
                  <article
                    key={item.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-slate-900">{item.machineNome ?? item.machineTag ?? "Máquina"}</h3>
                        <p className="text-xs text-slate-500">TAG {item.machineTag ?? "-"}</p>
                        <p className="text-xs text-slate-500">
                          {item.machineSetor ?? "Setor não informado"} • {item.machineUnidade ?? "Unidade não informada"}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Concluída</span>
                    </div>
                    <div className="space-y-1 text-xs text-slate-600">
                      <p>Nº O.S.: {item.osNumero ?? "-"}</p>
                      <p>Concluída em: {finishedLabel}</p>
                      <p>NC registradas: {item.qtdNc > 0 ? item.qtdNc : "Nenhuma"}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                      <a
                        href={`/api/inspecoes/${item.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-xl border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        Gerar PDF
                      </a>
                      <button
                        type="button"
                        onClick={() => handleViewInspection(item.id)}
                        className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Visualizar respostas
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {nextCursor && !loading && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => fetchInspections({ reset: false, cursor: nextCursor }).catch(() => undefined)}
                disabled={loadingMore}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? "Carregando..." : "Carregar mais"}
              </button>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "correctives" ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {dateError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{dateError}</div>
          ) : correctiveError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{correctiveError}</div>
          ) : correctiveLoading && !correctiveInitialized ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : correctiveItems.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Nenhuma corretiva concluída encontrada para o período selecionado.
            </div>
          ) : (
            <div className="space-y-3">
              {assigneesError ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {assigneesError}
                </div>
              ) : null}
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">OS</th>
                      <th className="px-4 py-3 text-left font-semibold">NC relacionada</th>
                      <th className="px-4 py-3 text-left font-semibold">Área</th>
                      <th className="px-4 py-3 text-left font-semibold">Programada para</th>
                      <th className="px-4 py-3 text-left font-semibold">Prazo</th>
                      <th className="px-4 py-3 text-left font-semibold">Severidade</th>
                      <th className="px-4 py-3 text-left font-semibold">Responsáveis</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {correctiveItems.map(item => {
                      const isExpanded = historyExpandedId === item.osId;
                      return (
                        <Fragment key={item.osId}>
                          <tr className="transition hover:bg-slate-50/60">
                            <td className="px-4 py-3 font-medium text-slate-900">
                              <div className="space-y-1">
                                <p>{formatOsNumber(item)}</p>
                                {item.machineTag ? (
                                  <p className="text-xs text-slate-500">TAG {item.machineTag}</p>
                                ) : null}
                                {item.machineName ? (
                                  <p className="text-xs text-slate-500">{item.machineName}</p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col text-xs text-slate-600">
                                <span className="text-sm font-medium text-slate-900">
                                  {item.description?.trim() || item.ncDescription?.trim() || "-"}
                                </span>
                                {item.ncId ? <span className="text-[11px] text-slate-400">NC: {item.ncId}</span> : null}
                              </div>
                            </td>
                            <td className="px-4 py-3">{formatArea(item.area)}</td>
                            <td className="px-4 py-3">{formatDateTime(item.scheduledDate)}</td>
                            <td className="px-4 py-3">{formatDateTime(item.dueDate)}</td>
                            <td className="px-4 py-3">{formatSeverity(item.effectiveSeverity)}</td>
                            <td className="px-4 py-3 whitespace-pre-line">{formatAssignees(item.assignees)}</td>
                            <td className="px-4 py-3">
                              {item.status ? (
                                <Badge variant={resolveStatusVariant(item.status)}>{formatStatus(item.status)}</Badge>
                              ) : (
                                <span className="text-sm text-slate-500">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setHistoryExpandedId(prev => (prev === item.osId ? null : item.osId))}
                                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                              >
                                {isExpanded ? "Ocultar" : "Detalhes"}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && historySelected ? (
                            <tr>
                              <td colSpan={9} className="bg-slate-50/60 px-5 py-5">
                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-1">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Ordem de serviço
                                      </p>
                                      <p className="text-lg font-semibold text-slate-900">
                                        {formatOsNumber(historySelected)}
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        Atualizada em {formatDateTime(historySelected.updatedAt)}
                                      </p>
                                    </div>
                                    <Badge variant={resolveStatusVariant(historySelected.status)}>
                                      {formatStatus(historySelected.status)}
                                    </Badge>
                                  </div>

                                  <div className="space-y-2">
                                    <p className="text-sm font-semibold text-slate-900">
                                      {historySelected.description?.trim() ||
                                        historySelected.ncDescription?.trim() ||
                                        "Sem descrição"}
                                    </p>
                                  </div>

                                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                      <span className="font-semibold uppercase text-slate-500">Programada</span>
                                      <p className="text-sm font-medium text-slate-900">
                                        {formatDateTime(historySelected.scheduledDate)}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                      <span className="font-semibold uppercase text-slate-500">Prazo</span>
                                      <p className="text-sm font-medium text-slate-900">
                                        {formatDateTime(historySelected.dueDate)}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                      <span className="font-semibold uppercase text-slate-500">Concluída</span>
                                      <p className="text-sm font-medium text-slate-900">
                                        {formatDateTime(historySelected.completedAt)}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                      <span className="font-semibold uppercase text-slate-500">Área</span>
                                      <p className="text-sm font-medium text-slate-900">{formatArea(historySelected.area)}</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                      <span className="font-semibold uppercase text-slate-500">Severidade</span>
                                      <p className="text-sm font-medium text-slate-900">
                                        {formatSeverity(historySelected.effectiveSeverity)}
                                      </p>
                                    </div>
                                    {historySelected.machineName || historySelected.machineTag ? (
                                      <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                        <span className="font-semibold uppercase text-slate-500">Máquina</span>
                                        <p className="text-sm font-medium text-slate-900">
                                          {historySelected.machineName || "Máquina"}
                                          {historySelected.machineTag ? ` · TAG ${historySelected.machineTag}` : ""}
                                        </p>
                                      </div>
                                    ) : null}
                                    <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                      <span className="font-semibold uppercase text-slate-500">Responsáveis</span>
                                      <p className="whitespace-pre-line text-sm font-medium text-slate-900">
                                        {formatAssignees(historySelected.assignees)}
                                      </p>
                                    </div>
                                  </div>

                                  {historySelected.ncPhotos?.length ? (
                                    <div className="space-y-2">
                                      <p className="text-xs font-semibold uppercase text-slate-500">Fotos anexadas</p>
                                      <ul className="flex flex-wrap gap-2 text-xs">
                                        {historySelected.ncPhotos.map((photo, index) => (
                                          <li key={photo.key ?? photo.url ?? `history-photo-${index}`}>
                                            <a
                                              href={photo.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                                            >
                                              <i className="fas fa-paperclip" aria-hidden />
                                              Ver anexo {index + 1}
                                            </a>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : null}

                                  {historySelected.completionNotes ? (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                                      <span className="font-semibold uppercase text-slate-500">Observações do mantenedor</span>
                                      <p className="mt-1 text-sm text-slate-800">{historySelected.completionNotes}</p>
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Exibindo {correctiveItems.length} {correctiveItems.length === 1 ? "corretiva" : "corretivas"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fetchCorrectivesHistory({ reset: false, cursor: correctiveCursor }).catch(() => undefined)}
                disabled={!correctiveCursor || correctiveLoadingMore}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {correctiveLoadingMore ? "Carregando..." : "Carregar mais"}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
