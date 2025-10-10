"use client";

import { FormEvent, use, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

interface Maintainer {
  id: string;
  nome: string | null;
  matricula?: string | null;
}

interface MachineSummary {
  id: string;
  tag: string | null;
  nome: string | null;
  setor?: string | null;
  unidade?: string | null;
  ativo?: boolean | null;
}

interface MachinesResponse {
  maintainer: Maintainer;
  assignedIds: string[];
  assignedDocs: MachineSummary[];
  activeDocs: MachineSummary[];
  inactiveOrMissingIds: string[];
}

function formatMachineLabel(machine: MachineSummary) {
  const tag = machine.tag ?? undefined;
  const name = machine.nome ?? undefined;
  if (tag && name) {
    return `${tag} — ${name}`;
  }
  return tag ?? name ?? machine.id;
}

export default function MaintainerMachinesPage({ params }: PageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [maintainer, setMaintainer] = useState<Maintainer | null>(null);
  const [activeDocs, setActiveDocs] = useState<MachineSummary[]>([]);
  const [assignedDocs, setAssignedDocs] = useState<MachineSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [initialInactiveOrMissing, setInitialInactiveOrMissing] = useState<string[]>([]);
  const [machineQuery, setMachineQuery] = useState("");

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

        const machinesRes = await fetch(`/api/mantenedores/${id}/machines`, { cache: "no-store" });

        if (!machinesRes.ok) {
          const payload = await machinesRes.json().catch(() => null);
          throw new Error(payload?.error || "Falha ao carregar máquinas");
        }

        const data = (await machinesRes.json()) as MachinesResponse;

        if (!cancelled) {
          setMaintainer(data.maintainer);
          setSelected(Array.isArray(data.assignedIds) ? data.assignedIds : []);
          setActiveDocs(Array.isArray(data.activeDocs) ? data.activeDocs : []);
          setAssignedDocs(Array.isArray(data.assignedDocs) ? data.assignedDocs : []);
          setInitialInactiveOrMissing(Array.isArray(data.inactiveOrMissingIds) ? data.inactiveOrMissingIds : []);
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
  }, [id]);

  const activeMachines = useMemo(() => {
    return activeDocs
      .filter(machine => machine.ativo !== false)
      .sort((a, b) => {
        const tagA = (a.tag ?? a.nome ?? "").toLowerCase();
        const tagB = (b.tag ?? b.nome ?? "").toLowerCase();
        return tagA.localeCompare(tagB);
      });
  }, [activeDocs]);

  const assignedDocsMap = useMemo(() => {
    const map = new Map<string, MachineSummary>();
    assignedDocs.forEach(doc => {
      map.set(doc.id, doc);
    });
    return map;
  }, [assignedDocs]);

  const inactiveOrMissingSelections = useMemo(() => {
    return selected.filter(machineId => !activeMachines.some(machine => machine.id === machineId));
  }, [activeMachines, selected]);

  const filteredActiveMachines = useMemo(() => {
    if (!machineQuery) return activeMachines;
    const query = machineQuery.toLowerCase();
    return activeMachines.filter(machine => {
      return (
        (machine.tag ?? "").toLowerCase().includes(query) ||
        (machine.nome ?? "").toLowerCase().includes(query) ||
        (machine.setor ?? "").toLowerCase().includes(query) ||
        (machine.unidade ?? "").toLowerCase().includes(query)
      );
    });
  }, [activeMachines, machineQuery]);

  const selectedCount = selected.length;

  function toggleMachine(machineId: string) {
    setSelected(current => {
      if (current.includes(machineId)) {
        return current.filter(item => item !== machineId);
      }
      return [...current, machineId];
    });
    setSuccess(null);
  }

  function removeInactiveSelection(machineId: string) {
    setSelected(current => current.filter(item => item !== machineId));
    setSuccess(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/mantenedores/${id}/machines`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assignedIds: selected }),
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
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--surface)_88%,rgba(148,163,184,0.35)_12%)]" />
          <div className="h-10 w-32 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--surface)_88%,rgba(148,163,184,0.35)_12%)]" />
        </div>
        <Card>
          <CardContent className="space-y-4 py-8">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-[var(--text)]">Gerenciar máquinas</h1>
          {maintainer && (
            <p className="text-sm text-[var(--muted)]">
              Atualize as máquinas atribuídas a <span className="font-semibold text-[var(--text)]">{maintainer.nome ?? "—"}</span>
              {maintainer.matricula ? ` • Matrícula ${maintainer.matricula}` : ""}.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/mantenedores" className={buttonStyles({ variant: "secondary" })}>
            <i className="fas fa-arrow-left" aria-hidden />
            Voltar para a lista
          </Link>
          <Link href={`/admin/mantenedores/${id}`} className={buttonStyles({ variant: "outline" })}>
            <i className="fas fa-pen" aria-hidden />
            Editar mantenedor
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Atribuições de máquinas</CardTitle>
            <CardDescription>
              Pesquise pelo tag, nome ou setor para localizar rapidamente e marcar as máquinas disponíveis.
            </CardDescription>
          </div>
          <div className="text-sm text-[var(--muted)]">
            {selectedCount > 0 ? (
              <span>
                {selectedCount} máquina{selectedCount === 1 ? "" : "s"} selecionada{selectedCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span>Nenhuma máquina selecionada</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <div className="flex items-start gap-3">
                <i className="fas fa-circle-exclamation mt-1" aria-hidden />
                <div>
                  <p className="font-medium">Não foi possível concluir a ação.</p>
                  <p>{error}</p>
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <div className="flex items-start gap-3">
                <i className="fas fa-check-circle mt-1" aria-hidden />
                <div>
                  <p className="font-medium">Tudo certo!</p>
                  <p>{success}</p>
                </div>
              </div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Input
                  value={machineQuery}
                  onChange={event => setMachineQuery(event.target.value)}
                  placeholder="Buscar por TAG, nome, setor ou unidade"
                  aria-label="Buscar máquina"
                />
                {machineQuery && (
                  <Button type="button" variant="ghost" onClick={() => setMachineQuery("")}
                    className="self-start sm:self-auto"
                  >
                    Limpar filtro
                  </Button>
                )}
              </div>
              <div className="rounded-[30px] border border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(255,255,255,0.85)_4%)] px-4 py-4">
                {filteredActiveMachines.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-[var(--muted)]">
                    <i className="fas fa-search text-lg" aria-hidden />
                    <p>Nenhuma máquina encontrada com o filtro informado.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {filteredActiveMachines.map(machine => {
                      const checked = selected.includes(machine.id);
                      return (
                        <label
                          key={machine.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                            checked
                              ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent_88%)] shadow-[0_18px_36px_-22px_rgba(37,99,235,0.45)]"
                              : "border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(148,163,184,0.16)_4%)] hover:border-[var(--primary)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                            checked={checked}
                            onChange={() => toggleMachine(machine.id)}
                          />
                          <div className="min-w-0 space-y-1">
                            <div className="text-sm font-medium text-[var(--text)]">{formatMachineLabel(machine)}</div>
                            {(machine.setor || machine.unidade) && (
                              <p className="text-xs text-[var(--muted)]">
                                {[machine.setor, machine.unidade].filter(Boolean).join(" • ")}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {inactiveOrMissingSelections.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                <div className="flex items-start gap-3">
                  <i className="fas fa-triangle-exclamation mt-1" aria-hidden />
                  <div className="space-y-2">
                    <p className="font-semibold">Máquinas fora da lista ativa</p>
                    <p>
                      Mantivemos selecionadas as máquinas que não aparecem como ativas. Desmarque manualmente se não quiser
                      vinculá-las.
                    </p>
                    <ul className="space-y-2 text-xs text-amber-700">
                      {inactiveOrMissingSelections.map(machineId => {
                        const machine = assignedDocsMap.get(machineId);
                        return (
                          <li key={machineId} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2">
                            <span className="truncate font-medium text-amber-900">
                              {machine ? formatMachineLabel(machine) : machineId}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-amber-700 hover:bg-amber-100 hover:text-amber-900"
                              onClick={() => removeInactiveSelection(machineId)}
                            >
                              Remover
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                    {initialInactiveOrMissing.length > 0 && (
                      <p className="text-[0.7rem] uppercase tracking-wide text-amber-600">
                        IDs originais: {initialInactiveOrMissing.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] pt-6 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => window.history.back()}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Salvar alterações
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
