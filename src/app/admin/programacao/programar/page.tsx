"use client";

import { useEffect, useMemo, useState } from "react";

import { CriticidadeBadge } from "@/components/criticidade-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { SchedulingNCRecord } from "@/lib/programacao/scheduling";
import type { AreaFilter } from "@/lib/programacao/scheduling";

interface MaintainerOption {
  id: string;
  nome: string | null;
  matricula: string | null;
  setor: string | null;
}

const areaOptions: Array<{ value: AreaFilter | "todas"; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "mecanica", label: "Mecânica" },
  { value: "eletrica", label: "Elétrica" },
];

const severityOptions = [
  { value: "", label: "Todas" },
  { value: "5", label: "5 - Crítica" },
  { value: "4", label: "4" },
  { value: "3", label: "3" },
  { value: "2", label: "2" },
  { value: "1", label: "1" },
];

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return withTime
    ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : date.toLocaleDateString("pt-BR");
}

function filterMaintainersByArea(options: MaintainerOption[], area: AreaFilter | "todas") {
  if (area === "todas") return options;
  return options.filter(option => {
    const setor = option.setor?.toLowerCase() ?? "";
    if (area === "eletrica") return setor.includes("ele");
    if (area === "mecanica") return setor.includes("mec");
    return true;
  });
}

export default function ProgramarManutencaoPage() {
  const [loading, setLoading] = useState(false);
  const [maintLoading, setMaintLoading] = useState(false);
  const [items, setItems] = useState<SchedulingNCRecord[]>([]);
  const [maintainers, setMaintainers] = useState<MaintainerOption[]>([]);
  const [filters, setFilters] = useState({ area: "todas" as AreaFilter | "todas", severity: "", search: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    responsavel: "",
    mantenedor1: "",
    mantenedor2: "",
    dataProgramada: "",
    prazo: "",
  });

  useEffect(() => {
    setMaintLoading(true);
    fetch("/api/mantenedores", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) {
          throw new Error("Falha ao carregar mantenedores.");
        }
        return (await response.json()) as Array<{ id: string; nome?: string; matricula?: string; setor?: string }>;
      })
      .then(records => {
        const mapped = records.map(record => ({
          id: record.id,
          nome: typeof record.nome === "string" ? record.nome : null,
          matricula: typeof record.matricula === "string" ? record.matricula : null,
          setor: typeof record.setor === "string" ? record.setor : null,
        }));
        setMaintainers(mapped);
      })
      .catch(() => {
        setMaintainers([]);
      })
      .finally(() => setMaintLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.area && filters.area !== "todas") {
      params.set("area", filters.area);
    }
    if (filters.severity) {
      params.set("minSeverity", filters.severity);
    }
    if (filters.search) {
      params.set("search", filters.search);
    }
    fetch(`/api/programacao/agendamento/ncs?${params.toString()}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) {
          throw new Error("Falha ao carregar não conformidades.");
        }
        const payload = (await response.json()) as { items: SchedulingNCRecord[] };
        setItems(payload.items);
        if (payload.items.length > 0) {
          setSelectedId(payload.items[0]!.id);
        } else {
          setSelectedId(null);
        }
      })
      .catch(() => {
        setItems([]);
        setSelectedId(null);
      })
      .finally(() => setLoading(false));
  }, [filters.area, filters.search, filters.severity]);

  const selected = useMemo(() => items.find(item => item.id === selectedId) ?? null, [items, selectedId]);

  const availableMaintainers = useMemo(() => filterMaintainersByArea(maintainers, filters.area), [maintainers, filters.area]);

  const getMaintainerPayload = (id: string) => {
    if (!id) return undefined;
    const record = maintainers.find(item => item.id === id);
    if (!record) return undefined;
    return {
      maintId: record.id,
      nome: record.nome ?? undefined,
      matricula: record.matricula ?? undefined,
    };
  };

  const handleSubmit = async () => {
    if (!selected) {
      setFeedback({ type: "error", message: "Selecione uma não conformidade." });
      return;
    }
    if (!form.dataProgramada) {
      setFeedback({ type: "error", message: "Informe a data programada." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        issueId: selected.id,
        programacaoId: selected.programacao?.id ?? undefined,
        dataProgramada: form.dataProgramada,
        prazo: form.prazo || undefined,
        responsavel: getMaintainerPayload(form.responsavel),
        mantenedores: [form.mantenedor1, form.mantenedor2]
          .map(id => getMaintainerPayload(id))
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
      };
      const response = await fetch("/api/programacao/agendamento/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error ?? "Falha ao programar manutenção.");
      }
      setFeedback({ type: "success", message: "Programação salva com sucesso." });
      setForm({ responsavel: "", mantenedor1: "", mantenedor2: "", dataProgramada: "", prazo: "" });
      setFilters(prev => ({ ...prev }));
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : "Falha ao programar manutenção.";
      setFeedback({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--text)]">Programar manutenção</h1>
        <p className="text-sm text-[var(--muted)]">
          Selecione uma não conformidade aberta, defina responsáveis e registre a programação da OS vinculada.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label className="text-xs font-medium text-[var(--muted)]" htmlFor="area-filter">
                Área
              </label>
              <Select
                id="area-filter"
                value={filters.area}
                onChange={event => setFilters(prev => ({ ...prev, area: event.target.value as AreaFilter | "todas" }))}
              >
                {areaOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-medium text-[var(--muted)]" htmlFor="severity-filter">
                Criticidade mínima
              </label>
              <Select
                id="severity-filter"
                value={filters.severity}
                onChange={event => setFilters(prev => ({ ...prev, severity: event.target.value }))}
              >
                {severityOptions.map(option => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-1 flex-col">
              <label className="text-xs font-medium text-[var(--muted)]" htmlFor="search-filter">
                Busca
              </label>
              <Input
                id="search-filter"
                placeholder="Descrição, OS ou máquina"
                value={filters.search}
                onChange={event => setFilters(prev => ({ ...prev, search: event.target.value }))}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <table className="min-w-full divide-y divide-[var(--border)] text-sm">
              <thead className="bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.1)_8%)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">NC</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Máquina</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Área</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Criticidade</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">OS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[var(--muted)]">
                      Carregando não conformidades...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[var(--muted)]">
                      Nenhuma não conformidade encontrada com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  items.map(item => {
                    const active = item.id === selectedId;
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "cursor-pointer transition hover:bg-[color-mix(in_srgb,var(--surface)_92%,rgba(59,130,246,0.18)_8%)]",
                          active ? "bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface)_88%)]" : "",
                        )}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <p className="font-medium text-[var(--text)]">
                              {item.descricao ?? "NC sem descrição"}
                            </p>
                            <p className="text-xs text-[var(--muted)]">
                              {formatDate(item.createdAt)} · {item.status}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <p className="font-medium text-[var(--text)]">{item.machine.nome ?? "-"}</p>
                            <p className="text-xs text-[var(--muted)]">TAG {item.machine.tag ?? "-"}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--muted)]">{item.machine.area}</td>
                        <td className="px-4 py-3">
                          <CriticidadeBadge state={item.severity} showStatus />
                        </td>
                        <td className="px-4 py-3 text-[var(--muted)]">{item.osNumero ?? "-"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-4 shadow-sm">
          {selected ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Resumo da não conformidade</h2>
                <p className="text-sm text-[var(--muted)]">
                  {selected.descricao ?? "Sem descrição registrada."}
                </p>
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Máquina</p>
                  <p className="font-semibold text-[var(--text)]">{selected.machine.nome ?? "-"}</p>
                  <p className="text-xs text-[var(--muted)]">TAG {selected.machine.tag ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Área</p>
                  <p className="font-semibold text-[var(--text)]">{selected.machine.area}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">OS vinculada</p>
                  <p className="font-semibold text-[var(--text)]">{selected.osNumero ?? selected.programacao?.osNumero ?? "-"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Criticidade</p>
                  <CriticidadeBadge state={selected.severity} showStatus />
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm text-[var(--text)]">
                    <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Responsável</span>
                    <select
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                      value={form.responsavel}
                      onChange={event => setForm(prev => ({ ...prev, responsavel: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      {availableMaintainers.map(option => (
                        <option key={option.id} value={option.id}>
                          {option.nome ?? option.matricula ?? option.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm text-[var(--text)]">
                    <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Mantenedor 1</span>
                    <select
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                      value={form.mantenedor1}
                      onChange={event => setForm(prev => ({ ...prev, mantenedor1: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      {availableMaintainers.map(option => (
                        <option key={option.id} value={option.id}>
                          {option.nome ?? option.matricula ?? option.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm text-[var(--text)]">
                    <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Mantenedor 2</span>
                    <select
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                      value={form.mantenedor2}
                      onChange={event => setForm(prev => ({ ...prev, mantenedor2: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      {availableMaintainers.map(option => (
                        <option key={option.id} value={option.id}>
                          {option.nome ?? option.matricula ?? option.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm text-[var(--text)]">
                    <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Prazo (opcional)</span>
                    <Input
                      type="date"
                      value={form.prazo}
                      onChange={event => setForm(prev => ({ ...prev, prazo: event.target.value }))}
                    />
                  </label>
                </div>

                <label className="space-y-1 text-sm text-[var(--text)]">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Data programada</span>
                  <Input
                    type="datetime-local"
                    value={form.dataProgramada}
                    onChange={event => setForm(prev => ({ ...prev, dataProgramada: event.target.value }))}
                  />
                </label>
              </div>

              {feedback ? (
                <div
                  className={cn(
                    "rounded-xl border px-4 py-3 text-sm",
                    feedback.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-rose-200 bg-rose-50 text-rose-700",
                  )}
                >
                  {feedback.message}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button onClick={handleSubmit} disabled={saving} loading={saving}>
                  <i className="fas fa-save" aria-hidden />
                  Programar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
              Selecione uma não conformidade para visualizar os detalhes e registrar a programação.
            </div>
          )}

          {maintLoading ? (
            <p className="text-center text-xs text-[var(--muted)]">Carregando mantenedores...</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
