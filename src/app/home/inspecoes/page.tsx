"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export default function MaintCompletedInspectionsPage() {
  const router = useRouter();
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-gray-900">Inspeções concluídas</h1>
        <p className="text-sm text-gray-600">
          Consulte inspeções finalizadas, gere relatórios em PDF e visualize as respostas registradas.
        </p>
        <button
          type="button"
          onClick={() => router.push("/home")}
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Voltar para a home
        </button>
      </header>

      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Filtros</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>Data inicial</span>
            <input
              type="date"
              value={startDate}
              onChange={event => setStartDate(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>Data final</span>
            <input
              type="date"
              value={endDate}
              onChange={event => setEndDate(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
        </div>
        {dateError && <p className="text-sm text-red-600">{dateError}</p>}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            Aplicar filtros
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            Limpar filtros
          </button>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Resultados</h2>
          {(loading || initializing) && <span className="text-xs text-gray-500">Carregando...</span>}
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : items.length === 0 && !loading ? (
          <p className="text-sm text-gray-600">Nenhuma inspeção encontrada para os filtros selecionados.</p>
        ) : (
          <div className="space-y-4">
            {items.map(item => (
              <article
                key={item.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-gray-900">{item.machineNome ?? item.machineTag ?? "Máquina"}</h3>
                    <p className="text-sm text-gray-600">TAG: {item.machineTag ?? "-"}</p>
                    <p className="text-xs text-gray-500">
                      Setor: {item.machineSetor ?? "-"} • Unidade: {item.machineUnidade ?? "-"}
                    </p>
                  </div>
                  <div className="text-right text-sm text-gray-600">
                    <p>
                      Concluída em <span className="font-medium text-gray-800">{formatDateTime(item.finalizadaEm)}</span>
                    </p>
                    <p>Nº O.S.: {item.osNumero ?? "-"}</p>
                    <p>NC registradas: {item.qtdNc > 0 ? item.qtdNc : "Nenhuma"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/inspecoes/${item.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-md border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
                  >
                    Gerar PDF
                  </a>
                  <button
                    type="button"
                    onClick={() => handleViewInspection(item.id)}
                    className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                  >
                    Visualizar respostas
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {nextCursor && !loading && !error && (
          <button
            type="button"
            onClick={() => fetchInspections({ reset: false, cursor: nextCursor }).catch(() => undefined)}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loadingMore}
          >
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        )}
      </section>
    </main>
  );
}
