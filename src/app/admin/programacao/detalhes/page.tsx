"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ResponsavelResumo = {
  maintId: string | null;
  nome: string | null;
  matricula: string | null;
  origem: string | null;
};

type ProgramacaoRegistro = {
  id: string;
  osNumero: string | null;
  status: string | null;
  atrasada: boolean;
  machine: {
    tag: string | null;
    nome: string | null;
    machineId: string | null;
    machineNotFound: boolean;
  };
  manutencao: {
    tipo: string | null;
    criticidade: string | null;
  };
  datas: {
    emissao: string | null;
    vencimento: string | null;
    fechamento: string | null;
  };
  responsavelPrincipal: ResponsavelResumo | null;
  responsaveis: ResponsavelResumo[];
  responsavelIds: string[];
  responsavelNomesNormalizados: string[];
};

type ResumoDetalhes = {
  summary: {
    total: number;
    pendentes: number;
    concluidas: number;
    atrasadas: number;
    semMantenedor: number;
    semMaquina: number;
  };
  programacoes: ProgramacaoRegistro[];
};

const integerFormatter = new Intl.NumberFormat("pt-BR");
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return dateFormatter.format(date);
}

type FiltroTabela = "todas" | "atrasadas" | "sem-mantenedor" | "sem-maquina";

type Breakdowns = {
  porMantenedor: Array<{
    id: string | null;
    nome: string;
    total: number;
    pendentes: number;
    atrasadas: number;
  }>;
  porCriticidade: Array<{ criticidade: string; total: number; atrasadas: number }>;
  porOficina: Array<{ oficina: string; total: number }>;
};

export default function ProgramacaoDetalhesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dados, setDados] = useState<ResumoDetalhes | null>(null);
  const [filtro, setFiltro] = useState<FiltroTabela>("todas");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/programacao/programacoes", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar programações.");
        }
        return (await response.json()) as ResumoDetalhes;
      })
      .then(setDados)
      .catch(err => {
        const message = err instanceof Error && err.message ? err.message : "Falha ao carregar programações.";
        setError(message);
        setDados(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const breakdowns: Breakdowns = useMemo(() => {
    const porMantenedorMap = new Map<string | null, { nome: string; total: number; pendentes: number; atrasadas: number }>();
    const porCriticidadeMap = new Map<string, { total: number; atrasadas: number }>();
    const porOficinaMap = new Map<string, number>();

    if (!dados) {
      return { porMantenedor: [], porCriticidade: [], porOficina: [] };
    }

    dados.programacoes.forEach(registro => {
      const status = registro.status ?? "PENDENTE";
      const isPendente = status === "PENDENTE";
      const atrasada = Boolean(registro.atrasada);
      const criticidade = (registro.manutencao.criticidade ?? "Sem criticidade").trim() || "Sem criticidade";
      const oficina = registro.machine.machineNotFound ? "Sem máquina" : (registro.machine.nome ?? "-");

      const criticidadeValue = porCriticidadeMap.get(criticidade) ?? { total: 0, atrasadas: 0 };
      criticidadeValue.total += 1;
      if (atrasada && isPendente) {
        criticidadeValue.atrasadas += 1;
      }
      porCriticidadeMap.set(criticidade, criticidadeValue);

      porOficinaMap.set(oficina, (porOficinaMap.get(oficina) ?? 0) + 1);

      if (registro.responsaveis.length > 0) {
        registro.responsaveis.forEach(resp => {
          const key = resp.maintId ?? resp.nome ?? "sem-id";
          const nome = resp.nome?.trim() || resp.matricula || "Sem nome";
          const current = porMantenedorMap.get(key) ?? { nome, total: 0, pendentes: 0, atrasadas: 0 };
          current.nome = nome;
          current.total += 1;
          if (isPendente) {
            current.pendentes += 1;
            if (atrasada) {
              current.atrasadas += 1;
            }
          }
          porMantenedorMap.set(key, current);
        });
      } else {
        const key = "sem-responsavel";
        const current = porMantenedorMap.get(key) ?? { nome: "Sem mantenedor", total: 0, pendentes: 0, atrasadas: 0 };
        current.total += 1;
        if (isPendente) {
          current.pendentes += 1;
          if (atrasada) {
            current.atrasadas += 1;
          }
        }
        porMantenedorMap.set(key, current);
      }
    });

    return {
      porMantenedor: Array.from(porMantenedorMap.entries())
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => b.total - a.total),
      porCriticidade: Array.from(porCriticidadeMap.entries())
        .map(([criticidade, value]) => ({ criticidade, ...value }))
        .sort((a, b) => b.total - a.total),
      porOficina: Array.from(porOficinaMap.entries())
        .map(([oficina, total]) => ({ oficina, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8),
    };
  }, [dados]);

  const registrosFiltrados = useMemo(() => {
    if (!dados) return [] as ProgramacaoRegistro[];
    return dados.programacoes.filter(registro => {
      if (filtro === "todas") return true;
      if (filtro === "atrasadas") {
        return registro.atrasada && (registro.status ?? "PENDENTE") === "PENDENTE";
      }
      if (filtro === "sem-mantenedor") {
        return registro.responsaveis.length === 0;
      }
      if (filtro === "sem-maquina") {
        return registro.machine.machineNotFound;
      }
      return true;
    });
  }, [dados, filtro]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">Detalhamento da programação</h1>
            <p className="text-sm text-[var(--muted)]">
              Visualize o lote do relatório 0441, acompanhe responsáveis e identifique pendências críticas.
            </p>
          </div>
          <a
            href="/admin/programacao"
            className={buttonStyles({ variant: "outline", className: "gap-2" })}
          >
            <i className="fas fa-arrow-left" aria-hidden />
            Voltar para resumo
          </a>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader>
            <CardTitle>Total</CardTitle>
            <CardDescription>Programações do lote ativo.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-16 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : (
              <p className="text-3xl font-semibold text-[var(--text)]">
                {integerFormatter.format(dados?.summary.total ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pendentes</CardTitle>
            <CardDescription>Incluindo atrasadas.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-16 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : (
              <p className="text-3xl font-semibold text-[var(--text)]">
                {integerFormatter.format(dados?.summary.pendentes ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Atrasadas</CardTitle>
            <CardDescription>Programações vencidas.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-16 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : (
              <p className="text-3xl font-semibold text-red-600">
                {integerFormatter.format(dados?.summary.atrasadas ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Concluídas</CardTitle>
            <CardDescription>Integradas às inspeções.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-16 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : (
              <p className="text-3xl font-semibold text-emerald-600">
                {integerFormatter.format(dados?.summary.concluidas ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sem mantenedor</CardTitle>
            <CardDescription>Programações sem vínculo automático.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-16 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : (
              <p className="text-3xl font-semibold text-orange-600">
                {integerFormatter.format(dados?.summary.semMantenedor ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sem máquina</CardTitle>
            <CardDescription>Necessitam cadastro/link com TAG.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-16 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : (
              <p className="text-3xl font-semibold text-amber-600">
                {integerFormatter.format(dados?.summary.semMaquina ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Programações do lote</CardTitle>
          <CardDescription>
            Utilize os filtros para enxergar rapidamente atrasos, lacunas de responsáveis e pendências por máquina.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { value: "todas" as FiltroTabela, label: "Todas" },
              { value: "atrasadas" as FiltroTabela, label: "Atrasadas" },
              { value: "sem-mantenedor" as FiltroTabela, label: "Sem mantenedor" },
              { value: "sem-maquina" as FiltroTabela, label: "Sem máquina" },
            ].map(item => (
              <Button
                key={item.value}
                type="button"
                variant={filtro === item.value ? "secondary" : "outline"}
                size="sm"
                onClick={() => setFiltro(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="h-48 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : registrosFiltrados.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nenhuma programação encontrada com o filtro selecionado.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
              <table className="min-w-[720px] divide-y divide-[var(--border)] text-sm">
                <thead className="bg-[var(--surface)]/70">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-[var(--muted)]">OS</th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-[var(--muted)]">Máquina</th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-[var(--muted)]">Responsáveis</th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-[var(--muted)]">Vencimento</th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-[var(--muted)]">Status</th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-[var(--muted)]">Criticidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {registrosFiltrados.map(registro => {
                    const status = registro.status ?? "PENDENTE";
                    const vencimento = formatDate(registro.datas.vencimento);
                    const semMantenedor = registro.responsaveis.length === 0;
                    return (
                      <tr key={registro.id} className="bg-[var(--surface)]/40 hover:bg-[var(--surface)]/70">
                        <td className="px-4 py-3 font-medium text-[var(--text)]">
                          {registro.osNumero ?? "-"}
                          {registro.atrasada && status === "PENDENTE" ? (
                            <Badge variant="danger" className="ml-2">Atrasada</Badge>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-[var(--text)]">
                          <div className="flex flex-col">
                            <span className="font-medium">{registro.machine.nome ?? "Sem descrição"}</span>
                            <span className="text-xs text-[var(--muted)]">
                              {registro.machine.tag ?? "Sem TAG"}
                              {registro.machine.machineNotFound ? " • Não vinculada" : ""}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--text)]">
                          {semMantenedor ? (
                            <Badge
                              className="border border-orange-200 bg-orange-50 text-orange-700"
                            >
                              Sem mantenedor
                            </Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {registro.responsaveis.map(resp => (
                                <Badge
                                  key={`${registro.id}-${resp.maintId ?? resp.nome ?? "?"}`}
                                  variant="muted"
                                  className="gap-1 text-[var(--text)]"
                                >
                                  <i className="fas fa-user-gear text-[11px]" aria-hidden />
                                  {resp.nome?.trim() || resp.matricula || "Sem nome"}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[var(--text)]">{vencimento}</td>
                        <td className="px-4 py-3 text-[var(--text)]">
                          <Badge variant={status === "CONCLUIDA" ? "success" : "muted"} className="uppercase">
                            {status === "CONCLUIDA" ? "Concluída" : "Pendente"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-[var(--text)]">
                          {registro.manutencao.criticidade ?? "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Relatório por mantenedor</CardTitle>
            <CardDescription>Distribuição de programações por responsável.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-40 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : (
              <div className="max-h-72 space-y-3 overflow-auto">
                {breakdowns.porMantenedor.map(item => (
                  <div
                    key={`${item.id ?? "sem"}-${item.nome}`}
                    className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">{item.nome}</p>
                      <p className="text-xs text-[var(--muted)]">
                        Pendentes: {integerFormatter.format(item.pendentes)} • Atrasadas: {integerFormatter.format(item.atrasadas)}
                      </p>
                    </div>
                    <Badge variant="muted">{integerFormatter.format(item.total)} OS</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Criticidade e concentração</CardTitle>
            <CardDescription>Visão rápida para priorização do PCM.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="h-32 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Por criticidade</p>
                  <div className="mt-2 space-y-2">
                    {breakdowns.porCriticidade.map(item => (
                      <div key={item.criticidade} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-[var(--text)]">{item.criticidade}</span>
                        <span className="text-[var(--muted)]">
                          {integerFormatter.format(item.total)}
                          {item.atrasadas ? ` • ${integerFormatter.format(item.atrasadas)} atrasadas` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Maiores volumes por máquina</p>
                  <div className="mt-2 space-y-2">
                    {breakdowns.porOficina.map(item => (
                      <div key={item.oficina} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-[var(--text)]">{item.oficina}</span>
                        <span className="text-[var(--muted)]">{integerFormatter.format(item.total)} OS</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
