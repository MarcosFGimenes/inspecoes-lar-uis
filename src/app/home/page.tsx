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

export default function MaintHomeStartPage() {
  const router = useRouter();

  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<MaintSessionInfo | null>(null);

  const [machinesLoading, setMachinesLoading] = useState(true);
  const [machinesError, setMachinesError] = useState<string | null>(null);
  const [machines, setMachines] = useState<MachineRecord[]>([]);

  const [searchTag, setSearchTag] = useState("");
  const [logoutLoading, setLogoutLoading] = useState(false);
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
    if (!session) {
      setMachines([]);
      setMachinesLoading(false);
      setMachinesError(null);
      return;
    }

    let cancelled = false;
    async function loadMachines() {
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
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setInspectionSaved(params.get("ok") === "1");
  }, []);

  const displayName = useMemo(() => {
    if (!session) return "mantenedor";
    const nome = session.nome?.trim();
    if (nome && nome.length > 0) {
      const firstName = nome.split(" ")[0];
      return firstName || nome;
    }
    const matricula = session.matricula?.trim();
    return matricula && matricula.length > 0 ? matricula : "mantenedor";
  }, [session]);

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

  const handleSelectMachine = useCallback(
    (tag: string | null) => {
      if (!tag) return;
      router.push(`/inspecao/${encodeURIComponent(tag)}`);
    },
    [router]
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 px-6 py-8 text-white shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-100">Início</p>
            <h1 className="text-3xl font-semibold">Bem vindo, {displayName}!</h1>
            <p className="text-sm text-blue-100">
              Escolha uma máquina para iniciar uma nova inspeção ou digite a TAG abaixo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={logoutLoading}
            className="inline-flex items-center justify-center rounded-full border border-white/60 px-4 py-2 text-sm font-medium text-white transition hover:border-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {logoutLoading ? "Saindo..." : "Sair"}
          </button>
        </div>
        {inspectionSaved && (
          <div className="rounded-2xl border border-white/40 bg-white/15 px-4 py-3 text-sm">
            <p className="font-medium">Inspeção salva com sucesso!</p>
            <p className="text-blue-100">Você pode conferir os detalhes em &ldquo;Inspeções&rdquo; sempre que precisar.</p>
          </div>
        )}
        {sessionError && (
          <div className="rounded-2xl border border-red-200/70 bg-red-500/20 px-4 py-3 text-sm text-white">
            {sessionError}
          </div>
        )}
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Iniciar inspeção por TAG</h2>
        <p className="mt-1 text-sm text-slate-500">
          Digite a TAG desejada para ir direto ao checklist correspondente.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={searchTag}
            onChange={event => setSearchTag(event.target.value.toUpperCase())}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Ex.: ABC123"
            className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm uppercase tracking-wide text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:flex-1"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Iniciar
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Máquinas disponíveis</h2>
            <p className="text-sm text-slate-500">Selecione uma máquina para abrir uma nova inspeção.</p>
          </div>
          {sessionLoading && (
            <span className="text-xs text-slate-400">Carregando sessão...</span>
          )}
        </div>

        {machinesLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : machinesError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{machinesError}</div>
        ) : machines.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
            Nenhuma máquina atribuída a você no momento.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {machines.map(machine => {
              const hasTag = Boolean(machine.tag);
              return (
                <article
                  key={machine.id}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-transparent bg-white shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"
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
                    <div className="flex h-40 items-center justify-center bg-slate-100 text-sm font-medium text-slate-500">
                      Sem imagem
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-slate-900">{machine.nome ?? "Máquina"}</h3>
                      <p className="text-sm text-slate-600">TAG: {machine.tag ?? "-"}</p>
                      <p className="text-xs text-slate-500">Setor: {machine.setor ?? "-"}</p>
                      <p className="text-xs text-slate-500">Unidade: {machine.unidade ?? "-"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectMachine(machine.tag)}
                      disabled={!hasTag}
                      className="mt-auto inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      {hasTag ? "Iniciar inspeção" : "TAG indisponível"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
