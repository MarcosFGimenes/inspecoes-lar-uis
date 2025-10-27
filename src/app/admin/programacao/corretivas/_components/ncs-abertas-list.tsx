"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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

import type { CorrectiveScheduleContext } from "./schedule-corrective-placeholder";
import { ScheduleCorrectivePlaceholder } from "./schedule-corrective-placeholder";

interface CorrectiveOpenNcItem {
  id: string;
  ncId: string;
  description: string | null;
  area: string | null;
  effectiveSeverity: number | null;
  updatedAt: string | null;
  status: string | null;
}

interface PaginatedResponse {
  items: CorrectiveOpenNcItem[];
  nextCursor: string | null;
}

const PAGE_SIZE = 20;

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

function toScheduleContext(item: CorrectiveOpenNcItem | null): CorrectiveScheduleContext | null {
  if (!item) return null;
  return {
    ncId: item.ncId,
    description: item.description,
    area: item.area,
    effectiveSeverity: item.effectiveSeverity,
  };
}

export default function NCsAbertasList() {
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [items, setItems] = useState<CorrectiveOpenNcItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"existing" | "new">("existing");
  const [selectedNc, setSelectedNc] = useState<CorrectiveOpenNcItem | null>(null);

  const severityOptions = useMemo(
    () => [
      { value: "", label: "Todas as severidades" },
      { value: "1", label: "Severidade 1" },
      { value: "2", label: "Severidade 2" },
      { value: "3", label: "Severidade 3" },
      { value: "4", label: "Severidade 4" },
      { value: "5", label: "Severidade 5" },
    ],
    []
  );

  const areaOptions = useMemo(
    () => [
      { value: "", label: "Todas as áreas" },
      { value: "mechanical", label: "Mecânica" },
      { value: "electrical", label: "Elétrica" },
    ],
    []
  );

  const closeSchedule = useCallback(() => {
    setScheduleOpen(false);
    setSelectedNc(null);
  }, []);

  useEffect(() => {
    if (!successMessage) {
      return;
    }
    const timer = setTimeout(() => {
      setSuccessMessage(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [successMessage]);

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
      if (severityFilter) {
        params.set("severity", severityFilter);
      }
      if (cursor) {
        params.set("cursor", cursor);
      }

      let aborted = false;

      try {
        const response = await fetch(`/api/correctives/nc-open?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const message = typeof errorBody.error === "string" ? errorBody.error : "Erro ao carregar NCs";
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
          console.error("Erro ao carregar corretivas abertas", error);
          setError(error.message || "Erro ao carregar NCs");
        }
      } finally {
        if (!aborted) {
          setLoadingInitial(false);
          setLoadingMore(false);
        }
      }
    },
    [areaFilter, severityFilter]
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

  const handleProgram = useCallback(
    (item: CorrectiveOpenNcItem | null) => {
      if (item) {
        setSelectedNc(item);
        setScheduleMode("existing");
      } else {
        setSelectedNc(null);
        setScheduleMode("new");
      }
      setScheduleOpen(true);
    },
    []
  );

  const handleScheduledSuccess = useCallback(
    (result: { osId: string; ncId: string | null }) => {
      if (result.ncId) {
        setItems(prev => prev.filter(item => item.ncId !== result.ncId && item.id !== result.ncId));
      }
      setSuccessMessage("Corretiva programada com sucesso.");
    },
    []
  );

  const isEmpty = hasLoaded && items.length === 0 && !loadingInitial && !loadingMore && !error;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[32px] border border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(255,255,255,0.85)_4%)] p-6 shadow-[0_24px_60px_-30px_rgb(var(--shadow-color)/35%)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--muted)]">Área</label>
              <Select
                value={areaFilter}
                onChange={event => {
                  setAreaFilter(event.target.value);
                }}
                aria-label="Filtrar por área"
              >
                {areaOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--muted)]">Severidade</label>
              <Select
                value={severityFilter}
                onChange={event => {
                  setSeverityFilter(event.target.value);
                }}
                aria-label="Filtrar por severidade"
              >
                {severityOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => handleProgram(null)}>
              <i className="fas fa-plus" aria-hidden />
              Novo serviço corretivo
            </Button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)]">
          {successMessage ? (
            <div className="border-b border-[color-mix(in_srgb,var(--border)_60%,transparent_40%)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent_92%)] px-6 py-3 text-sm text-[color-mix(in_srgb,var(--primary)_80%,var(--primary-700)_20%)]">
              {successMessage}
            </div>
          ) : null}
          {loadingInitial ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="grid grid-cols-5 gap-4">
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
                title="Nenhuma NC aberta encontrada"
                description="Ajuste os filtros ou programe novas corretivas para começar a acompanhar suas não conformidades."
                icon={<i className="fas fa-clipboard-list-check" aria-hidden />}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Descrição</TableHead>
                  <TableHead className="w-[15%]">Área</TableHead>
                  <TableHead className="w-[15%]">Severidade</TableHead>
                  <TableHead className="w-[20%]">Atualizada em</TableHead>
                  <TableHead className="w-[20%] text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-[var(--text)]">
                          {item.description?.trim() || "NC sem descrição"}
                        </p>
                        <p className="text-xs text-[var(--muted)]">ID: {item.ncId}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatArea(item.area)}</TableCell>
                    <TableCell>{item.effectiveSeverity ?? "-"}</TableCell>
                    <TableCell>{formatDateTime(item.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="secondary" size="sm" onClick={() => handleProgram(item)}>
                        <i className="fas fa-calendar-plus" aria-hidden />
                        Programar corretiva
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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

      <ScheduleCorrectivePlaceholder
        open={scheduleOpen}
        onClose={closeSchedule}
        context={toScheduleContext(selectedNc)}
        mode={scheduleMode}
        onScheduled={handleScheduledSuccess}
      />
    </div>
  );
}
