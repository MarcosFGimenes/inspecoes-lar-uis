"use client";

import { FormEvent, use, useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  ativo?: boolean | null;
}

interface MachinesResponse {
  maintainer: Maintainer;
  assignedIds: string[];
  assignedDocs: MachineSummary[];
  activeDocs: MachineSummary[];
  inactiveOrMissingIds: string[];
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
        const tagA = (a.tag ?? "").toLowerCase();
        const tagB = (b.tag ?? "").toLowerCase();
        if (tagA < tagB) return -1;
        if (tagA > tagB) return 1;
        return 0;
      });
  }, [activeDocs]);

  const assignedDocsMap = useMemo(() => {
    const map = new Map<string, MachineSummary>();
    assignedDocs.forEach(doc => {
      map.set(doc.id, doc);
    });
    return map;
  }, [assignedDocs]);

  const activeMachineMap = useMemo(() => {
    const map = new Map<string, MachineSummary>();
    activeMachines.forEach(machine => {
      map.set(machine.id, machine);
    });
    return map;
  }, [activeMachines]);

  const inactiveOrMissingSelections = useMemo(() => {
    return selected.filter(machineId => !activeMachineMap.has(machineId));
  }, [activeMachineMap, selected]);

  useEffect(() => {
    console.debug("[assign-machines] assignedIds", selected);
    console.debug("[assign-machines] activeIds", activeMachines.map(machine => machine.id));
    console.debug("[assign-machines] inactiveOrMissingIds", inactiveOrMissingSelections);
  }, [selected, activeMachines, inactiveOrMissingSelections]);

  function toggleMachine(id: string) {
    setSelected(current => {
      if (current.includes(id)) {
        return current.filter(item => item !== id);
      }
      return [...current, id];
    });
    setSuccess(null);
  }

  function removeInactiveSelection(id: string) {
    setSelected(current => current.filter(item => item !== id));
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
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-spinner fa-spin text-blue-600 text-xl"></i>
            </div>
            <p className="text-gray-600">Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 pt-6">
          <div className="flex items-center mb-4 md:mb-0">
            <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center mr-3">
              <i className="fas fa-tractor text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Lar Cooperativa Agroindustrial</h1>
              <p className="text-gray-600">Sistema de Manutenção de Rotas</p>
            </div>
          </div>
          
          <Link 
            href="/admin/mantenedores"
            className="flex items-center justify-center px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition duration-150 ease-in-out"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Voltar aos Mantenedores
          </Link>
        </div>

        {/* Conteúdo Principal */}
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          {error && !maintainer ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-exclamation-triangle text-red-600 text-2xl"></i>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Erro ao carregar</h3>
              <p className="text-red-600 mb-4">{error}</p>
              <Link 
                href="/admin/mantenedores"
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition duration-150 ease-in-out"
              >
                <i className="fas fa-arrow-left mr-2"></i>
                Voltar
              </Link>
            </div>
          ) : (
            <>
              {/* Cabeçalho da Página */}
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
                <div className="mb-4 md:mb-0">
                  <div className="flex items-center mb-2">
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center mr-3">
                      <i className="fas fa-cogs text-orange-600"></i>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">Gerenciar Máquinas</h2>
                  </div>
                  {maintainer && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 inline-block">
                      <p className="text-blue-800 font-medium">
                        {maintainer.nome ?? "—"}
                        {maintainer.matricula && (
                          <span className="text-blue-600 ml-2">• Matrícula {maintainer.matricula}</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Mensagens de Status */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start">
                  <i className="fas fa-exclamation-triangle text-red-600 mt-0.5 mr-3"></i>
                  <div>
                    <p className="text-red-800 font-medium">Erro</p>
                    <p className="text-red-600 text-sm mt-1">{error}</p>
                  </div>
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-start">
                  <i className="fas fa-check-circle text-green-600 mt-0.5 mr-3"></i>
                  <div>
                    <p className="text-green-800 font-medium">Sucesso</p>
                    <p className="text-green-600 text-sm mt-1">{success}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Lista de Máquinas Ativas */}
                <div className="border border-gray-200 rounded-xl p-6">
                  <div className="flex items-center mb-4">
                    <i className="fas fa-list-check text-blue-600 mr-2"></i>
                    <h3 className="text-lg font-semibold text-gray-900">Máquinas Ativas</h3>
                    <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                      {activeMachines.length}
                    </span>
                  </div>
                  
                  {activeMachines.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <i className="fas fa-inbox text-3xl mb-2 opacity-50"></i>
                      <p>Nenhuma máquina ativa encontrada.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto p-2">
                      {activeMachines.map(machine => {
                        const checked = selected.includes(machine.id);
                        return (
                          <label 
                            key={machine.id} 
                            className={`flex items-start p-3 rounded-lg border cursor-pointer transition duration-150 ease-in-out ${
                              checked 
                                ? 'bg-blue-50 border-blue-300' 
                                : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                              checked={checked}
                              onChange={() => toggleMachine(machine.id)}
                            />
                            <div className="ml-3">
                              <div className="font-medium text-gray-900">{machine.tag}</div>
                              <div className="text-sm text-gray-600">{machine.nome}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Aviso de Máquinas Orfãs */}
                {inactiveOrMissingSelections.length > 0 && (
                  <div className="border border-yellow-300 bg-yellow-50 rounded-xl p-4">
                    <div className="flex items-start">
                      <i className="fas fa-exclamation-triangle text-yellow-600 mt-0.5 mr-3"></i>
                      <div>
                        <p className="font-semibold text-yellow-800">Atenção</p>
                        <p className="text-yellow-700 text-sm mt-1">
                          Algumas máquinas atribuídas não foram encontradas como <strong>ativas</strong> (podem estar inativas ou ausentes por permissão/consulta). Elas continuam marcadas <strong>até você desmarcar</strong>:
                        </p>
                        <ul className="list-disc list-inside text-yellow-700 text-sm mt-2 space-y-1">
                          {inactiveOrMissingSelections.map(machineId => {
                            const machine = assignedDocsMap.get(machineId);
                            return (
                              <li key={machineId} className="flex items-center justify-between gap-4 font-mono">
                                <span className="truncate">
                                  {machine?.tag ?? machine?.nome ?? machineId}
                                </span>
                                <label className="flex items-center gap-2 text-xs font-sans">
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(machineId)}
                                    onChange={() => removeInactiveSelection(machineId)}
                                    className="h-4 w-4 text-yellow-600 focus:ring-yellow-500 border-yellow-300 rounded"
                                  />
                                  <span>Desmarcar</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                        {initialInactiveOrMissing.length > 0 && (
                          <p className="text-yellow-700 text-xs mt-3">
                            IDs recebidos: {initialInactiveOrMissing.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Botões de Ação */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition duration-150 ease-in-out"
                  >
                    {saving ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Salvando...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save mr-2"></i>
                        Salvar Atribuições
                      </>
                    )}
                  </button>
                  
                  <Link 
                    href="/admin/mantenedores"
                    className="flex-1 flex items-center justify-center px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition duration-150 ease-in-out"
                  >
                    <i className="fas fa-times mr-2"></i>
                    Cancelar
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="text-center text-gray-500 text-sm mt-8 pb-4">
          <p>Lar Cooperativa Agroindustrial &copy; {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}