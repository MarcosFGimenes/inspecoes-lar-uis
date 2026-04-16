"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";

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

type InspecoesResponse = {
  items: MaintInspectionListItem[];
  nextCursor: string | null;
};

const PAGE_LIMIT = 20;
const cacheInspecoes = new Map<string, InspecoesResponse>();

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

async function fetchInspecoes(
  appliedStart: string,
  appliedEnd: string,
  cursor?: string,
): Promise<InspecoesResponse> {
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

  const cacheKey = `${appliedStart}|${appliedEnd}|${cursor ?? "first"}`;
  const cached = cacheInspecoes.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(`/api/me/inspecoes?${params.toString()}`, { cache: "force-cache" });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("UNAUTHENTICATED");
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

  const result = {
    items: normalized,
    nextCursor: data?.nextCursor ? String(data.nextCursor) : null,
  };

  cacheInspecoes.set(cacheKey, result);
  return result;
}

export default function MaintCompletedInspectionsPage() {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedStart, setAppliedStart] = useState("");
  const [appliedEnd, setAppliedEnd] = useState("");

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

  const query = useInfiniteQuery({
    queryKey: ["inspecoes", appliedStart, appliedEnd],
    enabled: !dateError,
    queryFn: ({ pageParam }) => fetchInspecoes(appliedStart, appliedEnd, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap(page => page.items) ?? [],
    [query.data?.pages]
  );

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

  const loading = query.isLoading;
  const loadingMore = query.isFetchingNextPage;
  const error = query.error instanceof Error ? query.error.message : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 px-6 py-8 text-white shadow-lg">
        <h1 className="text-3xl font-semibold">Inspeções concluídas</h1>
        <p className="mt-2 text-sm text-emerald-100">
          Consulte o histórico completo, gere PDFs e relembre as respostas registradas sem alterar o resultado oficial.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-xs font-medium text-slate-600 sm:text-sm">
              <span>Data inicial</span>
              <input
                type="date"
                value={startDate}
                onChange={event => setStartDate(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600 sm:text-sm">
              <span>Data final</span>
              <input
                type="date"
                value={endDate}
                onChange={event => setEndDate(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Aplicar filtros
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Limpar
            </button>
          </div>
        </div>
        {dateError && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{dateError}</p>}
        {error && !items.length && !loading ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Histórico de inspeções</h2>
            <p className="text-sm text-slate-500">Toque para revisar as respostas ou gerar o PDF da inspeção finalizada.</p>
          </div>
          {!loading ? <span className="text-xs text-slate-400">{items.length} inspeções listadas</span> : null}
        </header>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Nenhuma inspeção encontrada para o período selecionado.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map(item => {
              const finishedLabel = formatDateTime(item.finalizadaEm);
              return (
                <article
                  key={item.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-slate-900">{item.machineNome ?? item.machineTag ?? "Máquina"}</h3>
                      <p className="text-xs text-slate-500">TAG {item.machineTag ?? "-"}</p>
                      <p className="text-xs text-slate-500">
                        {item.machineSetor ?? "Setor não informado"} • {item.machineUnidade ?? "Unidade não informada"}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Concluída</span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <p>Nº O.S.: {item.osNumero ?? "-"}</p>
                    <p>Concluída em: {finishedLabel}</p>
                    <p>NC registradas: {item.qtdNc > 0 ? item.qtdNc : "Nenhuma"}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <a
                      href={`/api/inspecoes/${item.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-xl border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                    >
                      Gerar PDF
                    </a>
                    <button
                      type="button"
                      onClick={() => handleViewInspection(item.id)}
                      className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      Visualizar respostas
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {query.hasNextPage && !loading && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={loadingMore}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMore ? "Carregando..." : "Carregar mais"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
