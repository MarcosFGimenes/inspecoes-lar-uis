"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { ScheduleResultPayload } from "./schedule-corrective-placeholder";

interface CorrectiveOsItem {
  id: string;
  osId: string;
  ncId: string | null;
  description: string | null;
  ncDescription: string | null;
  area: string | null;
  effectiveSeverity: number | null;
  scheduledDate: string | null;
  status: string | null;
  updatedAt: string | null;
  owner: string | null;
  maintainer1: string | null;
  maintainer2: string | null;
  assignees: {
    owner: string | null;
    maintainer1: string | null;
    maintainer2: string | null;
  } | null;
}

interface PaginatedResponse {
  items: CorrectiveOsItem[];
  nextCursor: string | null;
}

interface AssigneeOption {
  id: string;
  nome: string | null;
  matricula: string | null;
  area: "mechanical" | "electrical" | null;
  rawArea: string | null;
}

const PAGE_SIZE = 20;

function toIsoBoundary(value: string, boundary: "start" | "end"): string | null {
  if (!value) {
    return null;
  }

  const isoString = boundary === "end" ? `${value}T23:59:59.999` : `${value}T00:00:00.000`;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatArea(area: string | null): string {
  if (area === "mechanical") return "Mecânica";
  if (area === "electrical") return "Elétrica";
  if (typeof area === "string" && area.trim().length > 0) {
    return area;
  }
  return "-";
}

function formatStatus(status: string | null): string {
  if (!status) return "-";
  const normalized = status.replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatAssigneeLabel(option: AssigneeOption): string {
  const pieces: string[] = [];
  if (option.matricula) {
    pieces.push(option.matricula);
  }
  if (option.nome) {
    pieces.push(option.nome);
  }
  const base = pieces.join(" — ") || option.id;
  if (option.area === "mechanical") {
    return `${base} (Mecânica)`;
  }
  if (option.area === "electrical") {
    return `${base} (Elétrica)`;
  }
  if (option.rawArea) {
    return `${base} (${option.rawArea})`;
  }
  return base;
}

export default function CorrectivesPlannedList() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [items, setItems] = useState<CorrectiveOsItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assigneesError, setAssigneesError] = useState<string | null>(null);
  const loadedAssigneesRef = useRef(false);

  const assigneeOptions = useMemo(() => {
    const base = assignees.map(option => ({
      value: option.id,
      label: formatAssigneeLabel(option),
    }));
    return [{ value: "", label: "Todos os responsáveis" }, ...base];
  }, [assignees]);

  const assigneeLabelMap = useMemo(() => {
    return new Map(assignees.map(option => [option.id, formatAssigneeLabel(option)]));
  }, [assignees]);

  const areaOptions = useMemo(
    () => [
      { value: "", label: "Todas as áreas" },
      { value: "mechanical", label: "Mecânica" },
      { value: "electrical", label: "Elétrica" },
    ],
    []
  );

  const statusOptions = useMemo(
    () => [
      { value: "", label: "Todos os status" },
      { value: "scheduled", label: "Programada" },
      { value: "in_progress", label: "Em andamento" },
      { value: "done", label: "Concluída" },
    ],
    []
  );

  const fetchAssignees = useCallback(async () => {
    if (loadedAssigneesRef.current) {
      return;
    }
    setAssigneesLoading(true);
    setAssigneesError(null);
    try {
      const response = await fetch("/api/correctives/assignees", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = typeof payload?.error === "string" ? payload.error : "Falha ao carregar responsáveis";
        throw new Error(message);
      }
      const payload = (await response.json()) as { items?: Array<Record<string, unknown>> };
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const mapped: AssigneeOption[] = items
        .map(item => {
          const id = typeof item.id === "string" ? item.id : null;
          if (!id) return null;
          const nome = typeof item.nome === "string" ? item.nome : null;
          const matricula = typeof item.matricula === "string" ? item.matricula : null;
          const areaValue =
            typeof item.area === "string" && (item.area === "mechanical" || item.area === "electrical")
              ? item.area
              : null;
          const rawArea = typeof item.rawArea === "string" ? item.rawArea : null;
          return {
            id,
            nome,
            matricula,
            area: areaValue,
            rawArea,
          } satisfies AssigneeOption;
        })
        .filter((item): item is AssigneeOption => Boolean(item));
      setAssignees(mapped);
      loadedAssigneesRef.current = true;
    } catch (err) {
      console.error("[correctives] failed to load assignees", err);
      const message = err instanceof Error && err.message ? err.message : "Falha ao carregar responsáveis";
      setAssigneesError(message);
    } finally {
      setAssigneesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignees().catch(() => undefined);
  }, [fetchAssignees]);

  const fetchPage = useCallback(
    async ({ cursor, replace }: { cursor?: string | null; replace?: boolean } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const isReplace = replace ?? false;
      setError(null);
      if (isReplace) {
        setLoadingInitial(true);
        setHasLoaded(false);
        setItems([]);
        setNextCursor(null);
      } else {
        setLoadingMore(true);
      }

      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      if (areaFilter) {
        params.set("area", areaFilter);
      }
      if (statusFilter) {
        params.set("status", statusFilter);
      }
      if (responsibleFilter) {
        params.set("responsible", responsibleFilter);
      }
      const fromIso = fromDate ? toIsoBoundary(fromDate, "start") : null;
      if (fromDate && !fromIso) {
        setError("Data inicial inválida.");
        setLoadingInitial(false);
        setLoadingMore(false);
        return;
      }
      if (fromIso) {
        params.set("from", fromIso);
      }
      const toIso = toDate ? toIsoBoundary(toDate, "end") : null;
      if (toDate && !toIso) {
        setError("Data final inválida.");
        setLoadingInitial(false);
        setLoadingMore(false);
        return;
      }
      if (toIso) {
        params.set("to", toIso);
      }
      if (cursor) {
        params.set("cursor", cursor);
      }

      let aborted = false;

      try {
        const response = await fetch(`/api/correctives/os?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const message = typeof errorBody.error === "string" ? errorBody.error : "Erro ao carregar corretivas";
          throw new Error(message);
        }

        const data = (await response.json()) as PaginatedResponse;
        setItems(prev => (isReplace ? data.items : [...prev, ...data.items]));
        setNextCursor(data.nextCursor ?? null);
        setHasLoaded(true);
      } catch (err) {
        const error = err as Error;
        if (error.name === "AbortError") {
          aborted = true;
        } else {
          console.error("Erro ao carregar corretivas programadas", error);
          setError(error.message || "Erro ao carregar corretivas");
        }
      } finally {
        if (!aborted) {
          setLoadingInitial(false);
          setLoadingMore(false);
        }
      }
    },
    [areaFilter, statusFilter, responsibleFilter, fromDate, toDate]
  );

  useEffect(() => {
    fetchPage({ replace: true });
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchPage]);

  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMore) {
      return;
    }
    fetchPage({ cursor: nextCursor });
  }, [fetchPage, nextCursor, loadingMore]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleScheduled(event: Event) {
      const detail = (event as CustomEvent<ScheduleResultPayload>).detail;
      if (!detail) {
        return;
      }

      if (detail.assignees.owner && !assigneeLabelMap.has(detail.assignees.owner)) {
        setAssignees(prev => {
          if (prev.some(option => option.id === detail.assignees.owner)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: detail.assignees.owner,
              nome: null,
              matricula: null,
              area: null,
              rawArea: null,
            },
          ];
        });
      }

      setItems(prev => {
        const scheduledDate = detail.scheduledDate;
        const fromIso = fromDate ? toIsoBoundary(fromDate, "start") : null;
        if (fromIso && scheduledDate && scheduledDate < fromIso) {
          return prev;
        }
        const toIso = toDate ? toIsoBoundary(toDate, "end") : null;
        if (toIso && scheduledDate && scheduledDate > toIso) {
          return prev;
        }
        if (areaFilter && detail.area !== areaFilter) {
          return prev;
        }
        if (responsibleFilter && detail.assignees.owner !== responsibleFilter) {
          return prev;
        }
        if (statusFilter && statusFilter !== "scheduled") {
          return prev;
        }

        const nextItems = prev.filter(item => item.osId !== detail.osId);
        const now = new Date().toISOString();
        const newItem: CorrectiveOsItem = {
          id: detail.osId,
          osId: detail.osId,
          ncId: detail.ncId,
          description: detail.description,
          ncDescription: detail.description,
          area: detail.area,
          effectiveSeverity: detail.effectiveSeverity,
          scheduledDate: detail.scheduledDate,
          status: "scheduled",
          updatedAt: now,
          owner: detail.assignees.owner,
          maintainer1: detail.assignees.maintainer1,
          maintainer2: detail.assignees.maintainer2,
          assignees: {
            owner: detail.assignees.owner,
            maintainer1: detail.assignees.maintainer1,
            maintainer2: detail.assignees.maintainer2,
          },
        };

        return [newItem, ...nextItems];
      });
    }

    window.addEventListener("correctives:schedule-success", handleScheduled as EventListener);
    return () => {
      window.removeEventListener("correctives:schedule-success", handleScheduled as EventListener);
    };
  }, [areaFilter, responsibleFilter, statusFilter, fromDate, toDate, assigneeLabelMap]);

  const isEmpty = hasLoaded && items.length === 0 && !loadingInitial && !loadingMore && !error;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[32px] border border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(255,255,255,0.85)_4%)] p-6 shadow-[0_24px_60px_-30px_rgb(var(--shadow-color)/35%)]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--muted)]">Período inicial</label>
            <Input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--muted)]">Período final</label>
            <Input type="date" value={toDate} onChange={event => setToDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--muted)]">Área</label>
            <Select value={areaFilter} onChange={event => setAreaFilter(event.target.value)} aria-label="Filtrar por área">
              {areaOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--muted)]">Status</label>
            <Select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              aria-label="Filtrar por status"
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--muted)]">Responsável</label>
            <Select
              value={responsibleFilter}
              onChange={event => setResponsibleFilter(event.target.value)}
              aria-label="Filtrar por responsável"
              disabled={assigneesLoading}
            >
              {assigneeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {assigneesError ? (
              <p className="text-xs text-[color-mix(in_srgb,var(--danger)_85%,#991b1b_15%)]">{assigneesError}</p>
            ) : null}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)]">
          {loadingInitial ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="grid grid-cols-6 gap-4">
                  <Skeleton className="h-6 rounded-xl" />
                  <Skeleton className="h-6 rounded-xl" />
                  <Skeleton className="h-6 rounded-xl" />
                  <Skeleton className="h-6 rounded-xl" />
                  <Skeleton className="h-6 rounded-xl" />
                  <Skeleton className="h-6 rounded-xl" />
                </div>
              ))}
            </div>
          ) : isEmpty ? (
            <div className="p-10">
              <EmptyState
                title="Nenhuma corretiva programada"
                description="As ordens corretivas programadas aparecerão aqui assim que forem registradas."
                icon={<i className="fas fa-calendar-days" aria-hidden />}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[24%]">Descrição</TableHead>
                  <TableHead className="w-[12%]">Área</TableHead>
                  <TableHead className="w-[16%]">Responsável</TableHead>
                  <TableHead className="w-[12%]">Severidade</TableHead>
                  <TableHead className="w-[18%]">Programada para</TableHead>
                  <TableHead className="w-[18%]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => {
                  const responsibleLabel = item.owner ? assigneeLabelMap.get(item.owner) ?? item.owner : "-";
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-[var(--text)]">
                            {item.description?.trim() || item.ncDescription?.trim() || "Corretiva sem descrição"}
                          </p>
                          <p className="text-xs text-[var(--muted)]">OS: {item.osId}</p>
                          {item.ncId ? (
                            <p className="text-xs text-[var(--muted)]">NC vinculada: {item.ncId}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatArea(item.area)}</TableCell>
                      <TableCell>{responsibleLabel}</TableCell>
                      <TableCell>{item.effectiveSeverity ?? "-"}</TableCell>
                      <TableCell>{formatDateTime(item.scheduledDate)}</TableCell>
                      <TableCell>{formatStatus(item.status)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {error ? (
          <div className="rounded-2xl border border-[var(--danger)]/30 bg-[color-mix(in_srgb,var(--danger)_8%,transparent_92%)] px-4 py-3 text-sm text-[color-mix(in_srgb,var(--danger)_85%,#991b1b_15%)]">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--muted)]">
            Exibindo {items.length} {items.length === 1 ? "registro" : "registros"}
          </p>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={!nextCursor || loadingMore}
              loading={loadingMore}
            >
              Carregar mais
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
