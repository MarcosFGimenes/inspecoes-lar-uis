"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type MaintSessionInfo = {
  nome?: string | null;
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

function formatDate(value: string | null) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return date.toLocaleString("pt-BR");
}

export default function MaintDraftsPage() {
  const router = useRouter();

  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<MaintSessionInfo | null>(null);

  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      setSessionError(null);
      try {
        const response = await fetch("/api/auth/maint/me", { cache: "no-store" });
        if (response.status === 401) {
          if (!cancelled) {
            setSession(null);
            setSessionError("Sessão expirada. Faça login novamente.");
          }
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar sessão");
        }
        const data = await response.json();
        if (!cancelled) {
          setSession({ nome: data.store?.nome ?? null });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar sessão";
          setSessionError(message);
          setSession(null);
        }
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchDrafts = useCallback(async () => {
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
      const normalized = Array.isArray(data)
        ? (data as DraftSummary[])
            .map(draft => ({
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
            .filter(draft => draft.id)
        : [];
      setDrafts(normalized);
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Falha ao carregar rascunhos";
      setDraftsError(message);
      setDrafts([]);
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setDrafts([]);
      setDraftsLoading(false);
      setDraftsError(null);
      return;
    }
    fetchDrafts().catch(() => undefined);
  }, [fetchDrafts, session]);

  const sortedDrafts = useMemo(() => {
    return [...drafts].sort((a, b) => {
      const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bDate - aDate;
    });
  }, [drafts]);

  const handleResume = useCallback(
    (tag: string | null) => {
      if (!tag) return;
      router.push(`/inspecao/${encodeURIComponent(tag)}`);
    },
    [router]
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="rounded-3xl bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 px-6 py-8 text-white shadow-lg">
        <h1 className="text-3xl font-semibold">Rascunhos em andamento</h1>
        <p className="mt-2 text-sm text-indigo-100">
          Continue exatamente do ponto onde parou. Os rascunhos são salvos automaticamente enquanto você responde o checklist.
        </p>
        {session?.nome && (
          <p className="mt-3 text-sm text-indigo-100">Rascunhos salvos para {session.nome}.</p>
        )}
        {sessionError && (
          <div className="mt-4 rounded-2xl border border-red-200/70 bg-red-500/20 px-4 py-3 text-sm text-white">
            {sessionError}
          </div>
        )}
      </header>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Meus rascunhos</h2>
            <p className="text-sm text-slate-500">Visualize o progresso atual e retome a inspeção em um clique.</p>
          </div>
          <button
            type="button"
            onClick={() => fetchDrafts().catch(() => undefined)}
            disabled={draftsLoading}
            className="inline-flex items-center justify-center rounded-xl border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {draftsLoading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        {draftsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : draftsError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{draftsError}</div>
        ) : sortedDrafts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Nenhum rascunho salvo no momento. Ao iniciar uma inspeção, seu progresso aparecerá aqui automaticamente.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sortedDrafts.map(draft => {
              const progress = Math.max(0, Math.min(100, draft.progressPercent));
              const answered = Math.max(0, draft.answeredItens);
              const total = Math.max(answered, draft.totalItens);
              const hasTag = Boolean(draft.machineTag);
              return (
                <article
                  key={draft.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-slate-900">{draft.machineNome ?? draft.machineTag ?? "Máquina"}</h3>
                      <p className="text-xs text-slate-500">TAG {draft.machineTag ?? "-"}</p>
                      <p className="text-xs text-slate-500">{draft.machineSetor ?? "Setor não informado"}</p>
                      <p className="text-xs text-slate-500">{draft.machineUnidade ?? "Unidade não informada"}</p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      {progress}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {answered}/{total} itens respondidos
                    </p>
                    <p className="text-xs text-slate-400">Última atualização: {formatDate(draft.updatedAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleResume(draft.machineTag)}
                    disabled={!hasTag}
                    className="mt-auto inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {hasTag ? "Retomar inspeção" : "TAG indisponível"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
