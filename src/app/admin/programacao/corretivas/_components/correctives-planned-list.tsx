"use client";

import { useCallback, useMemo, useState } from "react";

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

import { useCorrectiveAssignees } from "../_hooks/useCorrectiveAssignees";
import { useCorrectiveOsQuery } from "../_hooks/useCorrectiveOsQuery";
import type { CorrectiveOsItem } from "../_types";

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

export default function CorrectivesPlannedList() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");

  const dateConstraints = useMemo(() => {
    if (!fromDate && !toDate) {
      return { from: undefined, to: undefined, error: null as string | null };
    }

    const fromIso = fromDate ? toIsoBoundary(fromDate, "start") : null;
    if (fromDate && !fromIso) {
      return { from: undefined, to: undefined, error: "Data inicial inválida." };
    }

    const toIso = toDate ? toIsoBoundary(toDate, "end") : null;
    if (toDate && !toIso) {
      return { from: undefined, to: undefined, error: "Data final inválida." };
    }

    if (fromIso && toIso && fromIso > toIso) {
      return { from: undefined, to: undefined, error: "O intervalo de datas é inválido." };
    }

    return {
      from: fromIso ?? undefined,
      to: toIso ?? undefined,
      error: null as string | null,
    };
  }, [fromDate, toDate]);

  const filters = useMemo(
    () => ({
      from: dateConstraints.error ? undefined : dateConstraints.from,
      to: dateConstraints.error ? undefined : dateConstraints.to,
      area: areaFilter || undefined,
      status: statusFilter || undefined,
      responsible: responsibleFilter || undefined,
    }),
    [areaFilter, statusFilter, responsibleFilter, dateConstraints]
  );

  const query = useCorrectiveOsQuery(filters, { enabled: !dateConstraints.error });

  const items = useMemo(() => query.data?.pages.flatMap(page => page.items) ?? [], [query.data]);
  const loadingInitial = query.isLoading && !query.data;
  const loadingMore = query.isFetchingNextPage;
  const hasMore = Boolean(query.hasNextPage);
  const queryError = query.error?.message ?? null;
  const combinedError = dateConstraints.error ?? queryError;
  const hasLoaded = query.status === "success";

  const handleLoadMore = useCallback(() => {
    if (!query.hasNextPage || query.isFetchingNextPage) {
      return;
    }
    void query.fetchNextPage();
  }, [query]);

  const { data: assignees = [], isLoading: assigneesLoading, error: assigneesError } = useCorrectiveAssignees(true);

  const assigneeOptions = useMemo(() => {
    const mapped = assignees.map(option => {
      const pieces = [option.matricula, option.nome].filter(Boolean);
      const baseLabel = pieces.join(" — ") || option.id;
      let suffix = "";
      if (option.area === "mechanical") {
        suffix = " (Mecânica)";
      } else if (option.area === "electrical") {
        suffix = " (Elétrica)";
      } else if (option.rawArea) {
        suffix = ` (${option.rawArea})`;
      }
      return { value: option.id, label: `${baseLabel}${suffix}` };
    });
    return [{ value: "", label: "Todos os responsáveis" }, ...mapped];
  }, [assignees]);

  const assigneeLabelMap = useMemo(() => new Map(assigneeOptions.map(option => [option.value, option.label])), [assigneeOptions]);

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

  const isEmpty = hasLoaded && items.length === 0 && !loadingInitial && !loadingMore && !combinedError;

  const resolveResponsible = useCallback(
    (item: CorrectiveOsItem): string => {
      if (!item.assignees?.owner) return "-";
      return assigneeLabelMap.get(item.assignees.owner) ?? item.assignees.owner;
    },
    [assigneeLabelMap]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[32px] border border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(255,255,255,0.85)_4%)] p-6 shadow-[0_24px_60px_-30px_rgb(var(--shadow-color)/35%)]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--muted)]">Data inicial</label>
            <Input
              type="date"
              value={fromDate}
              onChange={event => setFromDate(event.target.value)}
              aria-label="Filtrar data inicial"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--muted)]">Data final</label>
            <Input
              type="date"
              value={toDate}
              onChange={event => setToDate(event.target.value)}
              aria-label="Filtrar data final"
            />
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
          <div className="space-y-2 sm:col-span-2 lg:col-span-4">
            <label className="text-sm font-semibold text-[var(--muted)]">Responsável</label>
            <Select
              value={responsibleFilter}
              onChange={event => setResponsibleFilter(event.target.value)}
              aria-label="Filtrar por responsável"
              disabled={assigneesLoading && assigneeOptions.length === 0}
            >
              {assigneeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {combinedError ? (
          <div className="rounded-2xl border border-[var(--danger)]/30 bg-[color-mix(in_srgb,var(--danger)_8%,transparent_92%)] px-4 py-3 text-sm text-[color-mix(in_srgb,var(--danger)_85%,#991b1b_15%)]">
            {combinedError}
          </div>
        ) : null}
        {assigneesError ? (
          <div className="rounded-2xl border border-[var(--warning)]/40 bg-[color-mix(in_srgb,var(--warning)_8%,transparent_92%)] px-4 py-3 text-sm text-[color-mix(in_srgb,var(--warning)_80%,#92400e_20%)]">
            {assigneesError instanceof Error ? assigneesError.message : String(assigneesError)}
          </div>
        ) : null}

        <div className="relative overflow-hidden rounded-[28px] border border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)]">
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
                title="Nenhuma corretiva programada"
                description="Ajuste os filtros ou programe novas corretivas para acompanhar sua agenda."
                icon={<i className="fas fa-calendar-check" aria-hidden />}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%]">Descrição</TableHead>
                  <TableHead className="w-[18%]">NC vinculada</TableHead>
                  <TableHead className="w-[14%]">Área</TableHead>
                  <TableHead className="w-[14%]">Programada para</TableHead>
                  <TableHead className="w-[10%]">Severidade</TableHead>
                  <TableHead className="w-[16%]">Responsável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-[var(--text)]">
                          {item.description?.trim() || item.ncDescription?.trim() || "OS sem descrição"}
                        </p>
                        <p className="text-xs text-[var(--muted)]">OS: {item.osId}</p>
                        <p className="text-xs text-[var(--muted)]">Status: {formatStatus(item.status)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.ncId ? (
                        <div>
                          <p className="text-sm text-[var(--text)]">{item.ncDescription ?? "NC sem descrição"}</p>
                          <p className="text-xs text-[var(--muted)]">NC: {item.ncId}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--muted)]">Sem NC vinculada</span>
                      )}
                    </TableCell>
                    <TableCell>{formatArea(item.area)}</TableCell>
                    <TableCell>{formatDateTime(item.scheduledDate)}</TableCell>
                    <TableCell>{item.effectiveSeverity ?? "-"}</TableCell>
                    <TableCell>{resolveResponsible(item)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

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
              disabled={!hasMore || loadingMore}
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
