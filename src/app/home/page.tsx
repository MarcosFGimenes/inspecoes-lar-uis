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

export default function HomeMaint() {
  const router = useRouter();
  const [sessionLoading, setSessionLoading] = useState(true);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [machinesError, setMachinesError] = useState<string | null>(null);
  const [session, setSession] = useState<MaintSessionInfo | null>(null);
  const [machines, setMachines] = useState<MachineRecord[]>([]);
  const [searchTag, setSearchTag] = useState("");
  const [logoutLoading, setLogoutLoading] = useState(false);

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

  const greeting = useMemo(() => {
    if (!session) return null;
    const nome = session.nome ? String(session.nome) : "";
    const matricula = session.matricula ? String(session.matricula) : "";
    return { nome, matricula };
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
      </header>

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
    </main>
  );
}
