"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

import { useCorrectiveNcOpenQuery } from "../_hooks/useCorrectiveNcOpenQuery";
import type { CorrectiveOpenNcItem, CorrectiveScheduleContext, ScheduleResultPayload } from "../_types";
import { ScheduleCorrectivePlaceholder } from "./schedule-corrective-placeholder";

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
    inspectionId: item.inspectionId,
    source: item.source,
  };
}

export default function NCsAbertasList() {
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"existing" | "new">("existing");
  const [selectedNc, setSelectedNc] = useState<CorrectiveOpenNcItem | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const severityValue = useMemo(() => {
    const parsed = Number(severityFilter);
    return parsed >= 1 && parsed <= 6 ? parsed : undefined;
  }, [severityFilter]);

  const query = useCorrectiveNcOpenQuery({
    area: areaFilter || undefined,
    severity: severityValue,
    source: "inspection",
  });

  const items = useMemo(() => query.data?.pages.flatMap(page => page.items) ?? [], [query.data]);
  const loadingInitial = query.isLoading && !query.data;
  const loadingMore = query.isFetchingNextPage;
  const errorMessage = query.error?.message ?? null;
  const hasLoaded = query.status === "success";
  const hasMore = Boolean(query.hasNextPage);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const handleLoadMore = useCallback(() => {
    if (!query.hasNextPage || query.isFetchingNextPage) {
      return;
    }
    void query.fetchNextPage();
  }, [query]);

  const handleProgram = useCallback((item: CorrectiveOpenNcItem | null) => {
    if (item) {
      setSelectedNc(item);
      setScheduleMode("existing");
    } else {
      setSelectedNc(null);
      setScheduleMode("new");
    }
    setScheduleOpen(true);
  }, []);

  const handleCloseSchedule = useCallback(() => {
    setScheduleOpen(false);
    setSelectedNc(null);
  }, []);

  const handleScheduledSuccess = useCallback((result: ScheduleResultPayload) => {
    setSuccessMessage(
      result.ncId ? "Corretiva programada a partir da NC." : "Serviço corretivo programado com sucesso."
    );
  }, []);

  const severityOptions = useMemo(
    () => [
      { value: "", label: "Todas as severidades" },
      { value: "1", label: "Severidade 1" },
      { value: "2", label: "Severidade 2" },
      { value: "3", label: "Severidade 3" },
      { value: "4", label: "Severidade 4" },
      { value: "5", label: "Severidade 5" },
      { value: "6", label: "Severidade 6" },
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

  const isEmpty = hasLoaded && items.length === 0 && !loadingInitial && !loadingMore && !errorMessage;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[32px] border border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(255,255,255,0.85)_4%)] p-6 shadow-[0_24px_60px_-30px_rgb(var(--shadow-color)/35%)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--muted)]">Área</label>
              <Select
                value={areaFilter}
                onChange={event => setAreaFilter(event.target.value)}
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
                onChange={event => setSeverityFilter(event.target.value)}
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

        {errorMessage ? (
          <div className="rounded-2xl border border-[var(--danger)]/30 bg-[color-mix(in_srgb,var(--danger)_8%,transparent_92%)] px-4 py-3 text-sm text-[color-mix(in_srgb,var(--danger)_85%,#991b1b_15%)]">
            {errorMessage}
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
              disabled={!hasMore || loadingMore}
              loading={loadingMore}
            >
              Carregar mais
            </Button>
          </div>
        </div>
      </div>

      <ScheduleCorrectivePlaceholder
        open={scheduleOpen}
        onClose={handleCloseSchedule}
        context={toScheduleContext(selectedNc)}
        mode={scheduleMode}
        onScheduled={handleScheduledSuccess}
      />
    </div>
  );
}
