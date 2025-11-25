"use client";

import { useEffect, useMemo, useState } from "react";

import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const percentFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return dateFormatter.format(date);
}

type CurvaSPoint = {
  id: string;
  referencia: string;
  planejado: number;
  realizado: number;
  terceiroPercentual: number | null;
  terceiroData: string | null;
};

function buildLinePath(points: CurvaSPoint[], accessor: (point: CurvaSPoint) => number | null, xScale: (date: Date) => number) {
  const sorted = [...points].sort(
    (a, b) => new Date(a.referencia).getTime() - new Date(b.referencia).getTime(),
  );
  const coords = sorted
    .map(point => {
      const yValue = accessor(point);
      if (yValue === null || Number.isNaN(yValue)) return null;
      return {
        x: xScale(new Date(point.referencia)),
        y: 100 - Math.max(0, Math.min(100, yValue)),
      };
    })
    .filter(Boolean) as Array<{ x: number; y: number }>;

  if (!coords.length) return "";
  return coords
    .map((coord, idx) => `${idx === 0 ? "M" : "L"}${coord.x},${coord.y}`)
    .join(" ");
}

function CurvaSChart({ points }: { points: CurvaSPoint[] }) {
  const sorted = useMemo(
    () => [...points].sort((a, b) => new Date(a.referencia).getTime() - new Date(b.referencia).getTime()),
    [points],
  );

  const { xScale, width } = useMemo(() => {
    const chartWidth = 640;
    if (!sorted.length) {
      return { xScale: () => 0, width: chartWidth } as const;
    }
    const minDate = new Date(sorted[0]!.referencia);
    const maxDate = new Date(sorted[sorted.length - 1]!.referencia);
    const span = Math.max(maxDate.getTime() - minDate.getTime(), 1);
    const scale = (value: Date) => {
      const delta = value.getTime() - minDate.getTime();
      const ratio = Math.max(0, Math.min(1, delta / span));
      return Math.round(ratio * chartWidth);
    };
    return { xScale: scale, width: chartWidth } as const;
  }, [sorted]);

  const planejadoPath = useMemo(
    () => buildLinePath(sorted, point => point.planejado, xScale),
    [sorted, xScale],
  );
  const realizadoPath = useMemo(
    () => buildLinePath(sorted, point => point.realizado, xScale),
    [sorted, xScale],
  );
  const terceiroPath = useMemo(
    () => buildLinePath(sorted, point => point.terceiroPercentual, xScale),
    [sorted, xScale],
  );

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} 120`} className="w-full min-w-[320px]" role="img" aria-label="Curva S do serviço">
        <defs>
          <linearGradient id="plannedGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#plannedGradient)" />
        <g strokeWidth="2.5" fill="none">
          <path d={planejadoPath} stroke="#6366f1" />
          <path d={realizadoPath} stroke="#22c55e" />
          <path d={terceiroPath} stroke="#f97316" strokeDasharray="6 4" />
        </g>
        <g stroke="#e2e8f0" strokeWidth="0.5">
          {[0, 25, 50, 75, 100].map(percent => (
            <line key={percent} x1={0} x2={width} y1={100 - percent} y2={100 - percent} strokeDasharray="4 4" />
          ))}
        </g>
      </svg>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-[#6366f1]" /> Planejado</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-[#22c55e]" /> Realizado</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-[#f97316]" /> Terceiro</span>
      </div>
    </div>
  );
}

export default function CurvaServicoPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<CurvaSPoint[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/curva-servico", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar Curva S.");
        }
        return (await response.json()) as { points: CurvaSPoint[] };
      })
      .then(data => {
        setPoints(
          data.points.map(point => ({
            ...point,
            terceiroPercentual: point.terceiroPercentual ?? null,
            terceiroData: point.terceiroData ?? null,
          })),
        );
      })
      .catch(err => {
        const message = err instanceof Error && err.message ? err.message : "Falha ao carregar Curva S.";
        setError(message);
        setPoints([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (id: string, field: "terceiroPercentual" | "terceiroData", value: string) => {
    setPoints(current =>
      current.map(point => {
        if (point.id !== id) return point;
        if (field === "terceiroPercentual") {
          const numeric = value === "" ? null : Number(value);
          return { ...point, terceiroPercentual: Number.isNaN(numeric) ? null : numeric };
        }
        return { ...point, terceiroData: value ? new Date(value).toISOString() : null };
      }),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        updates: points.map(point => ({
          id: point.id,
          terceiroPercentual: point.terceiroPercentual ?? null,
          terceiroData: point.terceiroData ?? null,
        })),
      };
      const response = await fetch("/api/curva-servico", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Falha ao salvar ajustes do terceiro.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Falha ao salvar ajustes do terceiro.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">Curva S do serviço</h1>
            <p className="text-sm text-[var(--muted)]">
              Visualize o planejado x realizado e corrija lançamentos do terceiro sem interromper o uso do relatório.
            </p>
          </div>
          <a href="/admin/programacao" className={buttonStyles({ variant: "ghost", className: "gap-2" })}>
            <i className="fas fa-arrow-left" aria-hidden />
            Voltar para programação
          </a>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </header>

      <section className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Curva S consolidada</CardTitle>
            <CardDescription>Inclui os lançamentos enviados pelo terceiro.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-60 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
            ) : points.length ? (
              <CurvaSChart points={points} />
            ) : (
              <p className="text-sm text-[var(--muted)]">Nenhum ponto disponível.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Corrigir lançamentos do terceiro</CardTitle>
            <CardDescription>Altere porcentagem ou data para corrigir lançamentos incorretos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <div className="h-10 animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
                <div className="h-10 animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
                <div className="h-10 animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)]" />
              </div>
            ) : points.length ? (
              <div className="space-y-3">
                {points.map(point => {
                  const dateInputValue = point.terceiroData
                    ? new Date(point.terceiroData).toISOString().slice(0, 10)
                    : "";
                  return (
                    <div key={point.id} className="rounded-xl border border-[var(--border)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
                        <span>{formatDate(point.referencia)}</span>
                        <div className="flex gap-3 text-xs">
                          <span className="text-[var(--text)]">Plan: {percentFormatter.format(point.planejado)}%</span>
                          <span className="text-[var(--text)]">Real: {percentFormatter.format(point.realizado)}%</span>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="text-[var(--muted)]">% Terceiro</span>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={point.terceiroPercentual ?? ""}
                            onChange={event => handleChange(point.id, "terceiroPercentual", event.target.value)}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-[var(--muted)]">Data lançada</span>
                          <Input
                            type="date"
                            value={dateInputValue}
                            onChange={event => handleChange(point.id, "terceiroData", event.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Nenhum lançamento do terceiro para editar.</p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={handleSave} disabled={saving || !points.length}>
                <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-save"}`} aria-hidden />
                Salvar ajustes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
                disabled={saving}
              >
                <i className="fas fa-rotate" aria-hidden />
                Recarregar pontos
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
