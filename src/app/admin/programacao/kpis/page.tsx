"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type KpiResponse = {
  periodo: { inicio: string; fim: string; dias: number };
  indicadores: {
    cumprimentoPrazo: number;
    totalProgramadas: number;
    totalRealizadas: number;
    noPrazo: number;
    inspecoesAtrasadasAbertas: number;
    tempoMedioAtrasoDias: number;
    programadasVsRealizadas: { programadas: number; realizadas: number };
    desempenhoPorMantenedor: Array<{
      maintId: string | null;
      nome: string;
      programadas: number;
      realizadas: number;
      pendentes: number;
      atrasadas: number;
      percentualNoPrazo: number;
    }>;
    backlogPreventivo: number;
    criticidadeAltaAtrasada: number;
  };
};

const numberFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const integerFormatter = new Intl.NumberFormat("pt-BR");
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return dateTimeFormatter.format(date);
  } catch {
    return "-";
  }
}

export default function ProgramacaoKpisPage() {
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KpiResponse | null>(null);

  const loadKpis = useCallback(async () => {
    setKpisLoading(true);
    setKpisError(null);
    try {
      const response = await fetch("/api/programacao/kpis", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Falha ao calcular KPIs.");
      }
      const data = (await response.json()) as KpiResponse;
      setKpis(data);
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Falha ao calcular KPIs.";
      setKpisError(message);
      setKpis(null);
    } finally {
      setKpisLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKpis().catch(() => undefined);
  }, [loadKpis]);

  const barras = useMemo(() => {
    const programadas = kpis?.indicadores.programadasVsRealizadas.programadas ?? 0;
    const realizadas = kpis?.indicadores.programadasVsRealizadas.realizadas ?? 0;
    const max = Math.max(programadas, realizadas, 1);
    return {
      programadas,
      realizadas,
      programadasPercent: Math.round((programadas / max) * 100),
      realizadasPercent: Math.round((realizadas / max) * 100),
    };
  }, [kpis]);

  const cumprimentoPrazo = kpis?.indicadores.cumprimentoPrazo ?? 0;
  const atrasoMedioDias = kpis?.indicadores.tempoMedioAtrasoDias ?? 0;
  const totalProgramadas = kpis?.indicadores.totalProgramadas ?? 0;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">KPIs da programação</h1>
            <p className="text-sm text-[var(--muted)]">
              Acompanhe a eficiência das inspeções programadas e a evolução do cumprimento das ordens do relatório 0441.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => loadKpis().catch(() => undefined)} disabled={kpisLoading}>
              <i className="fas fa-rotate" aria-hidden />
              Atualizar KPIs
            </Button>
            <a
              href="/admin/programacao"
              className={buttonStyles({ variant: "ghost", className: "gap-2" })}
            >
              <i className="fas fa-arrow-left" aria-hidden />
              Voltar para resumo
            </a>
          </div>
        </div>
        {kpis ? (
          <p className="text-xs text-[var(--muted)]">
            Última atualização: {formatDateTime(kpis.periodo.inicio)} → {formatDateTime(kpis.periodo.fim)} ({kpis.periodo.dias} dias).
          </p>
        ) : null}
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Cumprimento no prazo</CardTitle>
            <CardDescription>Percentual de inspeções finalizadas dentro do prazo previsto.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {kpisLoading ? (
              <div className="h-20 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : kpisError ? (
              <p className="text-sm text-red-600">{kpisError}</p>
            ) : (
              <>
                <p className="text-3xl font-semibold text-[var(--text)]">{numberFormatter.format(cumprimentoPrazo)}%</p>
                <p className="text-xs text-[var(--muted)]">
                  {integerFormatter.format(kpis?.indicadores.noPrazo ?? 0)} de {integerFormatter.format(totalProgramadas)} programações concluídas dentro do prazo.
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Backlog preventivo</CardTitle>
            <CardDescription>Programações pendentes e atrasadas no momento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {kpisLoading ? (
              <div className="h-20 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : kpis ? (
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-blue-50 px-4 py-3 text-center">
                  <p className="text-xs text-blue-600">Pendentes</p>
                  <p className="text-xl font-semibold text-blue-700">
                    {integerFormatter.format(kpis.indicadores.backlogPreventivo)}
                  </p>
                </div>
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-center">
                  <p className="text-xs text-red-600">Criticidade A</p>
                  <p className="text-xl font-semibold text-red-700">
                    {integerFormatter.format(kpis.indicadores.criticidadeAltaAtrasada)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Sem dados disponíveis.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Atraso médio</CardTitle>
            <CardDescription>Média de dias de atraso para inspeções concluídas fora do prazo.</CardDescription>
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <div className="h-20 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : kpis ? (
              <p className="text-3xl font-semibold text-[var(--text)]">
                {numberFormatter.format(atrasoMedioDias)} <span className="text-base font-normal text-[var(--muted)]">dias</span>
              </p>
            ) : (
              <p className="text-sm text-[var(--muted)]">Sem dados disponíveis.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Programadas x Realizadas</CardTitle>
            <CardDescription>Comparativo no período analisado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kpisLoading ? (
              <div className="h-32 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : kpis ? (
              <>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                      <span>Programadas ({integerFormatter.format(barras.programadas)})</span>
                      <span>{barras.programadasPercent}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-blue-100">
                      <div
                        className="h-3 rounded-full bg-blue-600"
                        style={{ width: `${barras.programadasPercent}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                      <span>Realizadas ({integerFormatter.format(barras.realizadas)})</span>
                      <span>{barras.realizadasPercent}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-emerald-100">
                      <div
                        className="h-3 rounded-full bg-emerald-600"
                        style={{ width: `${barras.realizadasPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  Período considerado: {kpis.periodo.dias} dias ({formatDateTime(kpis.periodo.inicio)} — {formatDateTime(kpis.periodo.fim)}).
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--muted)]">Sem dados disponíveis.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Desempenho por mantenedor</CardTitle>
            <CardDescription>Realizações, pendências e atrasos por responsável.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {kpisLoading ? (
              <div className="h-32 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : kpis && kpis.indicadores.desempenhoPorMantenedor.length > 0 ? (
              <div className="max-h-72 overflow-auto rounded-2xl border border-[var(--border)]">
                <table className="min-w-full divide-y divide-[var(--border)] text-xs">
                  <thead className="bg-[var(--surface)]/70">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-[var(--muted)]">Mantenedor</th>
                      <th className="px-3 py-2 text-right font-semibold text-[var(--muted)]">Programadas</th>
                      <th className="px-3 py-2 text-right font-semibold text-[var(--muted)]">Realizadas</th>
                      <th className="px-3 py-2 text-right font-semibold text-[var(--muted)]">Pendentes</th>
                      <th className="px-3 py-2 text-right font-semibold text-[var(--muted)]">Atrasadas</th>
                      <th className="px-3 py-2 text-right font-semibold text-[var(--muted)]">% no prazo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {kpis.indicadores.desempenhoPorMantenedor.map(item => (
                      <tr key={`${item.maintId ?? item.nome}`} className="hover:bg-[var(--surface)]/60">
                        <td className="px-3 py-2 font-medium text-[var(--text)]">{item.nome}</td>
                        <td className="px-3 py-2 text-right text-[var(--text)]">{integerFormatter.format(item.programadas)}</td>
                        <td className="px-3 py-2 text-right text-[var(--text)]">{integerFormatter.format(item.realizadas)}</td>
                        <td className="px-3 py-2 text-right text-[var(--text)]">{integerFormatter.format(item.pendentes)}</td>
                        <td className="px-3 py-2 text-right text-[var(--text)]">{integerFormatter.format(item.atrasadas)}</td>
                        <td className="px-3 py-2 text-right text-[var(--text)]">{numberFormatter.format(item.percentualNoPrazo)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : kpisError ? (
              <p className="text-sm text-red-600">{kpisError}</p>
            ) : (
              <p className="text-sm text-[var(--muted)]">Nenhum mantenedor com programações no período.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Alertas de atraso</CardTitle>
          <CardDescription>KPIs complementares para tomada de decisão rápida.</CardDescription>
        </CardHeader>
        <CardContent>
          {kpisLoading ? (
            <div className="h-28 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
          ) : kpis ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-600">Atrasadas abertas</p>
                <p className="text-2xl font-semibold text-red-700">
                  {integerFormatter.format(kpis.indicadores.inspecoesAtrasadasAbertas)}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-600">Tempo médio atraso</p>
                <p className="text-2xl font-semibold text-amber-700">
                  {numberFormatter.format(atrasoMedioDias)} dias
                </p>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                <p className="text-xs text-blue-600">Programadas</p>
                <p className="text-2xl font-semibold text-blue-700">
                  {integerFormatter.format(totalProgramadas)}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-xs text-emerald-600">Realizadas</p>
                <p className="text-2xl font-semibold text-emerald-700">
                  {integerFormatter.format(kpis?.indicadores.totalRealizadas ?? 0)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Sem dados disponíveis.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
