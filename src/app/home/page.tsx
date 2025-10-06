"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type MaintSessionInfo = {
  nome?: string | null;
  matricula?: string | null;
};

type MachineRecord = {
  id: string;
  tag: string | null;
  nome: string | null;
  setor: string | null;
  unidade: string | null;
  fotoUrl: string | null;
};

type DraftSummary = {
  id: string;
  machineId: string | null;
  machineTag: string | null;
  machineNome: string | null;
  machineSetor: string | null;
  machineUnidade: string | null;
  templateId: string | null;
  templateNome: string | null;
  answeredItens: number;
  totalItens: number;
  progressPercent: number;
  updatedAt: string | null;
};

type CompletedInspectionSummary = {
  id: string;
  machineTag: string | null;
  machineNome: string | null;
  machineSetor: string | null;
  machineUnidade: string | null;
  finalizadaEm: string | null;
  osNumero: string | null;
  qtdNc: number;
};

export default function HomeMaint() {
  const router = useRouter();
  const [sessionLoading, setSessionLoading] = useState(true);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [machinesError, setMachinesError] = useState<string | null>(null);
  const [session, setSession] = useState<MaintSessionInfo | null>(null);
  const [machines, setMachines] = useState<MachineRecord[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [searchTag, setSearchTag] = useState("");
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [inspectionDate, setInspectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [completedInspections, setCompletedInspections] = useState<CompletedInspectionSummary[]>([]);
  const [completedLoading, setCompletedLoading] = useState(true);
  const [completedError, setCompletedError] = useState<string | null>(null);
  const [inspectionSaved, setInspectionSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      setSessionLoading(true);
      setSessionError(null);
      try {
        const response = await fetch("/api/auth/maint/me", { cache: "no-store" });
        if (response.status === 401) {
          if (!cancelled) {
            setSession(null);
            setSessionError("Sessão não encontrada. Faça login novamente.");
          }
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar sessão");
        }
        const data = await response.json();
        if (!cancelled) {
          setSession({
            nome: data.store?.nome ?? null,
            matricula: data.store?.matricula ?? null,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar sessão";
          setSessionError(message);
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }
    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadMachines() {
      if (!session) {
        setMachines([]);
        setMachinesLoading(false);
        return;
      }
      setMachinesLoading(true);
      setMachinesError(null);
      try {
        const response = await fetch("/api/me/machines", { cache: "no-store" });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar máquinas");
        }
        const data = (await response.json()) as MachineRecord[];
        if (!cancelled) {
          setMachines(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar máquinas";
          setMachinesError(message);
          setMachines([]);
        }
      } finally {
        if (!cancelled) {
          setMachinesLoading(false);
        }
      }
    }
    loadMachines();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    async function loadDrafts() {
      if (!session) {
        setDrafts([]);
        setDraftsLoading(false);
        setDraftsError(null);
        return;
      }
      setDraftsLoading(true);
      setDraftsError(null);
      try {
        const response = await fetch("/api/inspecoes/drafts", { cache: "no-store" });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(typeof payload?.error === "string" ? payload.error : "Falha ao carregar rascunhos");
        }
        const data = await response.json();
        if (!cancelled) {
          const normalized = Array.isArray(data)
            ? (data as DraftSummary[]).map(draft => ({
                id: String(draft.id ?? ""),
                machineId: draft.machineId ?? null,
                machineTag: draft.machineTag ?? null,
                machineNome: draft.machineNome ?? null,
                machineSetor: draft.machineSetor ?? null,
                machineUnidade: draft.machineUnidade ?? null,
                templateId: draft.templateId ?? null,
                templateNome: draft.templateNome ?? null,
                answeredItens: Number.isFinite(draft.answeredItens) ? Number(draft.answeredItens) : 0,
                totalItens: Number.isFinite(draft.totalItens) ? Number(draft.totalItens) : 0,
                progressPercent:
                  typeof draft.progressPercent === "number" && Number.isFinite(draft.progressPercent)
                    ? Math.max(0, Math.min(100, Math.round(draft.progressPercent)))
                    : 0,
                updatedAt: draft.updatedAt ?? null,
              }))
            : [];
          setDrafts(normalized);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar rascunhos";
          setDraftsError(message);
          setDrafts([]);
        }
      } finally {
        if (!cancelled) {
          setDraftsLoading(false);
        }
      }
    }
    loadDrafts();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      setCompletedInspections([]);
      setCompletedLoading(false);
      setCompletedError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadCompletedInspections() {
      setCompletedLoading(true);
      setCompletedError(null);
      try {
        const params = new URLSearchParams();
        const trimmedDate = inspectionDate?.trim();
        if (trimmedDate) {
          params.set("date", trimmedDate);
        }
        params.set("limit", "12");
        const response = await fetch(`/api/me/inspecoes?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(typeof payload?.error === "string" ? payload.error : "Falha ao carregar inspeções concluídas");
        }
        const data = await response.json();
        if (cancelled) return;
        const rawItems = Array.isArray(data?.items) ? (data.items as CompletedInspectionSummary[]) : [];
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
        setCompletedInspections(normalized);
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const message = err instanceof Error && err.message ? err.message : "Falha ao carregar inspeções concluídas";
        setCompletedError(message);
        setCompletedInspections([]);
      } finally {
        if (!cancelled) {
          setCompletedLoading(false);
        }
      }
    }

    loadCompletedInspections();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [inspectionDate, session]);

  const greeting = useMemo(() => {
    if (!session) return null;
    const nome = session.nome ? String(session.nome) : "";
    const matricula = session.matricula ? String(session.matricula) : "";
    return { nome, matricula };
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setInspectionSaved(params.get("ok") === "1");
  }, []);

  const handleSearch = useCallback(() => {
    const trimmed = searchTag.trim();
    if (!trimmed) return;
    router.push(`/inspecao/${encodeURIComponent(trimmed)}`);
  }, [router, searchTag]);

  const handleLogout = useCallback(async () => {
    try {
      setLogoutLoading(true);
      await fetch("/api/auth/maint/logout", { method: "POST" });
      window.location.href = "/login";
    } finally {
      setLogoutLoading(false);
    }
  }, []);

  const handleOpenDraft = useCallback(
    (tag: string | null) => {
      if (!tag) return;
      router.push(`/inspecao/${encodeURIComponent(tag)}`);
    },
    [router]
  );

  const handleViewAllCompleted = useCallback(() => {
    const params = new URLSearchParams();
    if (inspectionDate?.trim()) {
      params.set("date", inspectionDate.trim());
    }
    const query = params.toString();
    router.push(query ? `/home/inspecoes?${query}` : "/home/inspecoes");
  }, [inspectionDate, router]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-gray-900">Home do Mantenedor</h1>
        {sessionLoading ? (
          <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
        ) : greeting ? (
          <p className="text-gray-700">
            Olá, <span className="font-medium">{greeting.nome}</span> (matrícula {greeting.matricula || "-"})
          </p>
        ) : (
          <p className="text-sm text-red-600">{sessionError ?? "Sessão expirada."}</p>
        )}
        {greeting && (
          <button
            onClick={handleLogout}
            disabled={logoutLoading}
            className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {logoutLoading ? "Saindo..." : "Sair"}
          </button>
        )}
        {inspectionSaved && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Inspeção salva com sucesso.
          </div>
        )}
      </header>

      {greeting && (draftsLoading || draftsError || drafts.length > 0) && (
        <section className="space-y-4 rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Inspeções em andamento</h2>
              <p className="text-sm text-gray-600">Continue de onde parou seus rascunhos.</p>
            </div>
            <span className="text-xs text-gray-500">
              {draftsLoading ? "Carregando..." : drafts.length === 0 ? "Nenhum rascunho" : `${drafts.length} rascunho(s)`}
            </span>
          </div>
          {draftsLoading ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="min-w-[16rem] flex-shrink-0 rounded-lg border border-gray-200 bg-gray-100 p-4 shadow-sm"
                >
                  <div className="h-4 w-32 animate-pulse rounded bg-gray-300" />
                  <div className="mt-3 h-2 w-full animate-pulse rounded bg-gray-300" />
                  <div className="mt-2 h-2 w-2/3 animate-pulse rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : draftsError ? (
            <p className="text-sm text-red-600">{draftsError}</p>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhuma inspeção em andamento no momento.</p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {drafts.map(draft => {
                const progress = Math.max(
                  0,
                  Math.min(
                    100,
                    typeof draft.progressPercent === "number" && Number.isFinite(draft.progressPercent)
                      ? Math.round(draft.progressPercent)
                      : 0,
                  ),
                );
                const answered = Number.isFinite(draft.answeredItens) ? draft.answeredItens : 0;
                const total = Number.isFinite(draft.totalItens) ? draft.totalItens : 0;
                const updatedLabel = draft.updatedAt ? new Date(draft.updatedAt).toLocaleString("pt-BR") : null;
                const hasTag = Boolean(draft.machineTag);

                return (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => handleOpenDraft(draft.machineTag)}
                    disabled={!hasTag}
                    className={`min-w-[16rem] flex-shrink-0 rounded-lg border px-4 py-3 text-left shadow-sm transition ${
                      hasTag
                        ? "border-gray-200 bg-white hover:-translate-y-1 hover:border-blue-400 hover:shadow-md"
                        : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {draft.machineNome ?? draft.machineTag ?? "Máquina"}
                      </p>
                      <span className="text-xs text-gray-500">TAG {draft.machineTag ?? "-"}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {draft.machineSetor ?? "-"} • {draft.machineUnidade ?? "-"}
                    </p>
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>Progresso</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="text-[0.7rem] text-gray-500">
                        {answered}/{total} itens respondidos
                      </p>
                      {updatedLabel && (
                        <p className="text-[0.65rem] text-gray-400">Atualizado em {updatedLabel}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {greeting && (
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Minhas máquinas</h2>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <input
                value={searchTag}
                onChange={event => setSearchTag(event.target.value.toUpperCase())}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder="Buscar por TAG"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:w-64"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Buscar
              </button>
            </div>
          </div>

          {machinesLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-lg border border-gray-200 bg-gray-100" />
              ))}
            </div>
          ) : machinesError ? (
            <p className="text-sm text-red-600">{machinesError}</p>
          ) : machines.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhuma máquina atribuída a você no momento.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {machines.map(machine => (
                <article
                  key={machine.id}
                  className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                >
                  {machine.fotoUrl ? (
                    <div className="relative h-40 w-full">
                      <Image
                        src={machine.fotoUrl}
                        alt={`Foto da máquina ${machine.nome ?? machine.tag ?? ""}`}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      />
                    </div>
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-gray-100 text-sm text-gray-500">
                      Sem foto
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-gray-900">{machine.nome ?? "Máquina"}</h3>
                      <p className="text-sm text-gray-600">TAG: {machine.tag ?? "-"}</p>
                      <p className="text-xs text-gray-500">Setor: {machine.setor ?? "-"}</p>
                      <p className="text-xs text-gray-500">Unidade: {machine.unidade ?? "-"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!machine.tag) return;
                        router.push(`/inspecao/${encodeURIComponent(machine.tag)}`);
                      }}
                      disabled={!machine.tag}
                      className="mt-auto inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Inspecionar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {greeting && (completedLoading || completedError || completedInspections.length > 0 || inspectionDate) && (
        <section className="space-y-4 rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Inspeções realizadas</h2>
              <p className="text-sm text-gray-600">Visualize inspeções concluídas por data.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex flex-col text-xs font-medium text-gray-600 sm:text-sm">
                <span>Data</span>
                <input
                  type="date"
                  value={inspectionDate}
                  onChange={event => setInspectionDate(event.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <button
                type="button"
                onClick={handleViewAllCompleted}
                className="inline-flex items-center justify-center rounded-md border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
              >
                Ver todas
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500">Use “Ver todas” para gerar PDFs ou revisar respostas detalhadas.</p>
          {completedLoading ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="min-w-[16rem] flex-shrink-0 rounded-lg border border-gray-200 bg-gray-100 p-4 shadow-sm"
                >
                  <div className="h-4 w-32 animate-pulse rounded bg-gray-300" />
                  <div className="mt-3 h-2 w-full animate-pulse rounded bg-gray-300" />
                  <div className="mt-2 h-2 w-2/3 animate-pulse rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : completedError ? (
            <p className="text-sm text-red-600">{completedError}</p>
          ) : completedInspections.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhuma inspeção concluída para a data selecionada.</p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {completedInspections.map(inspection => {
                const finishedLabel = inspection.finalizadaEm
                  ? new Date(inspection.finalizadaEm).toLocaleString("pt-BR")
                  : null;
                return (
                  <div
                    key={inspection.id}
                    className="min-w-[16rem] flex-shrink-0 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {inspection.machineNome ?? inspection.machineTag ?? "Máquina"}
                      </p>
                      <span className="text-xs text-gray-500">TAG {inspection.machineTag ?? "-"}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {inspection.machineSetor ?? "-"} • {inspection.machineUnidade ?? "-"}
                    </p>
                    <div className="mt-3 space-y-1 text-xs text-gray-600">
                      <p>
                        Concluída em:
                        <span className="ml-1 font-medium text-gray-700">{finishedLabel ?? "-"}</span>
                      </p>
                      <p>
                        Nº O.S.: <span className="font-medium text-gray-700">{inspection.osNumero ?? "-"}</span>
                      </p>
                      <p>
                        NC registradas: {inspection.qtdNc > 0 ? inspection.qtdNc : "Nenhuma"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
