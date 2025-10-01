"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface PageProps {
  params: {
    id: string;
  };
}

interface Maintainer {
  id: string;
  nome: string;
  matricula?: string;
  machines?: string[];
}

interface MachineSummary {
  id: string;
  tag: string;
  nome: string;
  ativo?: boolean;
}

export default function MaintainerMachinesPage({ params }: PageProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [maintainer, setMaintainer] = useState<Maintainer | null>(null);
  const [availableMachines, setAvailableMachines] = useState<MachineSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const session = await fetch("/api/admin-session", { cache: "no-store" });
        if (session.status === 401) {
          window.location.href = "/admin/login";
          return;
        }

        const [maintRes, machinesRes] = await Promise.all([
          fetch(`/api/mantenedores/${params.id}`, { cache: "no-store" }),
          fetch("/api/maquinas", { cache: "no-store" }),
        ]);

        if (!maintRes.ok) {
          const payload = await maintRes.json().catch(() => null);
          throw new Error(payload?.error || "Falha ao carregar mantenedor");
        }

        if (!machinesRes.ok) {
          const payload = await machinesRes.json().catch(() => null);
          throw new Error(payload?.error || "Falha ao carregar máquinas");
        }

        const maintData = (await maintRes.json()) as Maintainer;
        const machinesData = (await machinesRes.json()) as MachineSummary[];

        if (!cancelled) {
          setMaintainer(maintData);
          setSelected(Array.isArray(maintData.machines) ? maintData.machines : []);
          setAvailableMachines(Array.isArray(machinesData) ? machinesData : []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Erro desconhecido";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const activeMachines = useMemo(() => {
    return availableMachines
      .filter(machine => machine.ativo !== false)
      .sort((a, b) => {
        const tagA = (a.tag ?? "").toLowerCase();
        const tagB = (b.tag ?? "").toLowerCase();
        if (tagA < tagB) return -1;
        if (tagA > tagB) return 1;
        return 0;
      });
  }, [availableMachines]);

  const activeMachineMap = useMemo(() => {
    const map = new Map<string, MachineSummary>();
    activeMachines.forEach(machine => {
      map.set(machine.id, machine);
    });
    return map;
  }, [activeMachines]);

  const orphanedSelections = useMemo(() => {
    return selected.filter(machineId => !activeMachineMap.has(machineId));
  }, [activeMachineMap, selected]);

  function toggleMachine(id: string) {
    setSelected(current => {
      if (current.includes(id)) {
        return current.filter(item => item !== id);
      }
      return [...current, id];
    });
    setSuccess(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/mantenedores/${params.id}/machines`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ machines: selected }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Falha ao salvar atribuições");
      }

      setSuccess("Atribuições atualizadas com sucesso.");
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Erro desconhecido";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Gerenciar máquinas</h1>
          <Link href="/admin/mantenedores" className="text-sm text-blue-600 hover:underline">
            Voltar
          </Link>
        </div>
        <p>Carregando...</p>
      </div>
    );
  }

  if (error && !maintainer) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Gerenciar máquinas</h1>
          <Link href="/admin/mantenedores" className="text-sm text-blue-600 hover:underline">
            Voltar
          </Link>
        </div>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gerenciar máquinas</h1>
          {maintainer && (
            <p className="text-gray-600 text-sm">
              {maintainer.nome}
              {maintainer.matricula ? ` • Matrícula ${maintainer.matricula}` : ""}
            </p>
          )}
        </div>
        <Link href="/admin/mantenedores" className="text-sm text-blue-600 hover:underline">
          Voltar
        </Link>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {success && <p className="text-green-600 text-sm">{success}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="border rounded p-4 space-y-2">
          <legend className="font-semibold">Máquinas ativas</legend>
          {activeMachines.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhuma máquina ativa encontrada.</p>
          ) : (
            <div className="space-y-2">
              {activeMachines.map(machine => {
                const checked = selected.includes(machine.id);
                return (
                  <label key={machine.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={() => toggleMachine(machine.id)}
                    />
                    <span>
                      <span className="font-medium">{machine.tag}</span> - {machine.nome}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        {orphanedSelections.length > 0 && (
          <div className="border border-yellow-300 bg-yellow-50 text-yellow-800 rounded p-3 text-sm">
            <p className="font-semibold">Atenção</p>
            <p>
              Algumas máquinas atribuídas não estão mais ativas e serão mantidas até que você desmarque:
            </p>
            <ul className="list-disc list-inside">
              {orphanedSelections.map(machineId => (
                <li key={machineId}>{machineId}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link
            href="/admin/mantenedores"
            className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
