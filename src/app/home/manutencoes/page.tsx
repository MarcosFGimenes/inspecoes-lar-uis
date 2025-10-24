"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type MaintenanceRecord = {
  id: string;
  pendencia: string;
  detalhes: string | null;
  origem: "NC" | "MANUAL" | string;
  status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | string;
  prazo: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  nc: {
    summary: string | null;
    questionText: string | null;
    machineTag: string | null;
    machineName: string | null;
    checklistDate: string | null;
  } | null;
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "warning" | "success" }> = {
  PENDENTE: { label: "Pendente", variant: "default" },
  EM_ANDAMENTO: { label: "Em andamento", variant: "warning" },
  CONCLUIDA: { label: "Concluída", variant: "success" },
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export default function MaintMaintenanceSchedulePage() {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/me/manutencoes", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Falha ao carregar programação");
      }
      const data = (await response.json()) as MaintenanceRecord[];
      setRecords(data);
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : "Erro ao carregar programação";
      setError(message);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData().catch(() => undefined);
  }, [loadData]);

  const grouped = useMemo(() => {
    const pending = records.filter(item => item.status !== "CONCLUIDA");
    const completed = records.filter(item => item.status === "CONCLUIDA");
    return { pending, completed };
  }, [records]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Programação de manutenção</h1>
          <p className="text-sm text-slate-500">
            Pendências atribuídas a você pelo PCM. Atualize o PCM após concluir cada correção.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/home" className={buttonStyles({ variant: "secondary" })}>
            <i className="fas fa-arrow-left" aria-hidden />
            Voltar
          </Link>
          <Button type="button" variant="outline" onClick={() => loadData().catch(() => undefined)} disabled={loading}>
            <i className="fas fa-rotate" aria-hidden />
            Atualizar
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <section className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Em andamento</CardTitle>
            <CardDescription>Priorize as pendências abertas ou em andamento antes de iniciar novas correções.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : grouped.pending.length === 0 ? (
              <EmptyState
                title="Sem pendências no momento"
                description="Assim que o PCM atribuir uma nova correção ela aparecerá aqui."
                icon={<i className="fas fa-screwdriver-wrench" aria-hidden />}
              />
            ) : (
              <ul className="space-y-4">
                {grouped.pending.map(item => {
                  const badge = STATUS_LABELS[item.status] ?? STATUS_LABELS.PENDENTE;
                  return (
                    <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <p className="text-base font-semibold text-slate-900">{item.pendencia}</p>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </div>
                          {item.detalhes && <p className="text-sm text-slate-600">{item.detalhes}</p>}
                          {item.nc?.machineTag || item.nc?.machineName ? (
                            <p className="text-xs text-slate-500">
                              {item.nc?.machineTag ? `${item.nc.machineTag} • ` : ""}
                              {item.nc?.machineName ?? "Máquina"}
                            </p>
                          ) : null}
                          {item.nc?.summary && (
                            <p className="text-xs text-slate-500">Origem: {item.nc.summary}</p>
                          )}
                        </div>
                        <div className="space-y-2 text-right text-sm text-slate-500">
                          <p>Prazo: {formatDate(item.prazo)}</p>
                          <p>Atribuída em {formatDateTime(item.createdAt)}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Concluídas</CardTitle>
            <CardDescription>Histórico das pendências concluídas. Informe ao PCM se precisar reabrir algo.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : grouped.completed.length === 0 ? (
              <EmptyState
                title="Nenhuma correção concluída"
                description="Finalize uma pendência para visualizá-la neste histórico."
                icon={<i className="fas fa-clipboard-check" aria-hidden />}
              />
            ) : (
              <ul className="space-y-3">
                {grouped.completed.map(item => (
                  <li key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-800">{item.pendencia}</p>
                        {item.nc?.machineTag || item.nc?.machineName ? (
                          <p className="text-xs text-slate-500">
                            {item.nc?.machineTag ? `${item.nc.machineTag} • ` : ""}
                            {item.nc?.machineName ?? "Máquina"}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-500">
                        Concluída em {formatDateTime(item.updatedAt ?? item.createdAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
