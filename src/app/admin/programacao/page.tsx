"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseCsv } from "@/lib/csv";

type StatusResponse = {
  activeBatch: {
    batchIdAtual: string | null;
    uploadedAt: string | null;
    uploadedBy: { uid?: string; name?: string | null } | null;
  };
  totals: {
    pendentes: number;
    atrasadas: number;
    semMaquina: number;
    totalBatchAtual: number;
  };
};

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

type UploadResult = {
  batchId: string;
  totalLidas: number;
  totalImportadas: number;
  errosValidacao: string[];
};

type PreviewRow = Record<string, string>;

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

export default function ProgramacaoAdminPage() {
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);

  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KpiResponse | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const requiredColumns = useMemo(
    () => ["NR_OS", "NR_MAQ", "DESCRIÇÃO", "DT_VENCIMENTO"],
    [],
  );

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const response = await fetch("/api/programacao/status", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Falha ao carregar status da programação.");
      }
      const data = (await response.json()) as StatusResponse;
      setStatus(data);
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Falha ao carregar status da programação.";
      setStatusError(message);
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

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
    loadStatus().catch(() => undefined);
    loadKpis().catch(() => undefined);
  }, [loadStatus, loadKpis]);

  const previewColumns = useMemo(() => {
    if (!previewRows.length) return [] as string[];
    return Object.keys(previewRows[0]!);
  }, [previewRows]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setPreviewRows([]);
    setPreviewError(null);
    setUploadResult(null);
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) {
        throw new Error("Arquivo CSV vazio.");
      }
      const columns = Object.keys(rows[0]!);
      const missing = requiredColumns.filter(column => !columns.includes(column));
      if (missing.length) {
        throw new Error(`CSV sem as colunas obrigatórias: ${missing.join(", ")}`);
      }
      setPreviewRows(rows.slice(0, 20));
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Falha ao pré-visualizar o CSV.";
      setPreviewError(message);
      setSelectedFile(null);
    }
  }, [requiredColumns]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      setPreviewError("Selecione um arquivo CSV para importar.");
      return;
    }
    setUploading(true);
    setPreviewError(null);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await fetch("/api/programacao/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Falha ao importar CSV.");
      }
      const data = (await response.json()) as UploadResult;
      setUploadResult(data);
      await Promise.all([loadStatus(), loadKpis()]);
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Falha ao importar CSV.";
      setPreviewError(message);
    } finally {
      setUploading(false);
    }
  }, [selectedFile, loadStatus, loadKpis]);

  const cumprimentoPrazo = kpis?.indicadores.cumprimentoPrazo ?? 0;
  const atrasoMedioDias = kpis?.indicadores.tempoMedioAtrasoDias ?? 0;
  const totalProgramadas = kpis?.indicadores.totalProgramadas ?? 0;
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

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">Programação de inspeções</h1>
            <p className="text-sm text-[var(--muted)]">
              Importe o CSV semanal do PCM e acompanhe o cumprimento das inspeções programadas.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => loadStatus().catch(() => undefined)} disabled={statusLoading}>
              <i className="fas fa-rotate" aria-hidden />
              Atualizar status
            </Button>
            <Button type="button" variant="secondary" onClick={() => loadKpis().catch(() => undefined)} disabled={kpisLoading}>
              <i className="fas fa-chart-line" aria-hidden />
              Atualizar KPIs
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Status do lote ativo</CardTitle>
            <CardDescription>Resumo da programação disponível para os mantenedores.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusLoading ? (
              <div className="h-28 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : statusError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{statusError}</div>
            ) : status ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <i className="fas fa-database" aria-hidden />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--text)]">
                      {status.activeBatch.batchIdAtual ? status.activeBatch.batchIdAtual : "Nenhum lote ativo"}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {status.activeBatch.uploadedAt
                        ? `Importado em ${formatDateTime(status.activeBatch.uploadedAt)}`
                        : "Nenhum upload registrado"}
                    </p>
                    {status.activeBatch.uploadedBy?.name && (
                      <p className="text-xs text-[var(--muted)]">Por: {status.activeBatch.uploadedBy.name}</p>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                    <p className="text-xs text-[var(--muted)]">Programações ativas</p>
                    <p className="text-xl font-semibold text-[var(--text)]">
                      {integerFormatter.format(status.totals.totalBatchAtual)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                    <p className="text-xs text-[var(--muted)]">Pendentes</p>
                    <p className="text-xl font-semibold text-[var(--text)]">
                      {integerFormatter.format(status.totals.pendentes)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-xs text-red-600">Atrasadas</p>
                    <p className="text-xl font-semibold text-red-700">
                      {integerFormatter.format(status.totals.atrasadas)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs text-amber-600">Sem máquina vinculada</p>
                    <p className="text-xl font-semibold text-amber-700">
                      {integerFormatter.format(status.totals.semMaquina)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Sem informações de programação no momento.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Importar programação (CSV)</CardTitle>
            <CardDescription>
              Pré-visualize o arquivo e substitua o lote atual com a programação mais recente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="text-sm text-[var(--text)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-600"
              />
              <p className="text-xs text-[var(--muted)]">
                O arquivo deve conter as colunas NR_OS, NR_MAQ, DESCRIÇÃO e DT_VENCIMENTO.
              </p>
            </div>

            {previewError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{previewError}</div>
            )}

            {previewRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--text)]">
                    Prévia ({previewRows.length} de {integerFormatter.format(previewRows.length)} linhas exibidas)
                  </p>
                  <Badge variant="muted">{selectedFile?.name}</Badge>
                </div>
                <div className="max-h-64 overflow-auto rounded-2xl border border-[var(--border)]">
                  <table className="min-w-full divide-y divide-[var(--border)] text-xs">
                    <thead className="bg-[var(--surface)]/70">
                      <tr>
                        {previewColumns.map(column => (
                          <th key={column} className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-[var(--muted)]">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {previewRows.map((row, index) => (
                        <tr key={`${row.NR_OS ?? index}-${index}`} className="hover:bg-[var(--surface)]/60">
                          {previewColumns.map(column => (
                            <td key={column} className="px-3 py-2 text-[var(--text)]">
                              {row[column] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button type="button" onClick={handleUpload} loading={uploading} disabled={uploading}>
                  <i className="fas fa-cloud-upload-alt" aria-hidden />
                  Importar programação
                </Button>
              </div>
            )}

            {uploadResult && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <p className="font-semibold">Importação concluída</p>
                <p>
                  {integerFormatter.format(uploadResult.totalImportadas)} de {integerFormatter.format(uploadResult.totalLidas)} linhas foram importadas (batch {uploadResult.batchId}).
                </p>
                {uploadResult.errosValidacao.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium">Ver avisos ({uploadResult.errosValidacao.length})</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {uploadResult.errosValidacao.map((msg, idx) => (
                        <li key={idx} className="text-xs text-emerald-800">
                          {msg}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

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
              <div className="max-h-64 overflow-auto rounded-2xl border border-[var(--border)]">
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
    </div>
  );
}
