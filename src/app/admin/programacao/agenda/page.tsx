"use client";

import { useEffect, useMemo, useState } from "react";

import { CriticidadeBadge } from "@/components/criticidade-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { ScheduleRecord, AreaFilter } from "@/lib/programacao/scheduling";

const areaOptions: Array<{ value: AreaFilter | "todas"; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "mecanica", label: "Mecânica" },
  { value: "eletrica", label: "Elétrica" },
];

const severityOptions = [
  { value: "", label: "Todas" },
  { value: "6", label: "6 - Emergencial" },
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

function groupByDate(records: ScheduleRecord[]) {
  const map = new Map<string, ScheduleRecord[]>();
  records.forEach(record => {
    const dateKey = record.datas.programada ? record.datas.programada.slice(0, 10) : "Sem data";
    const list = map.get(dateKey) ?? [];
    list.push(record);
    map.set(dateKey, list);
  });
  return Array.from(map.entries())
    .map(([date, list]) => ({ date, list }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default function AgendaProgramacaoPage() {
  const [filters, setFilters] = useState({
    area: "todas" as AreaFilter | "todas",
    severity: "",
    search: "",
    from: "",
    to: "",
    responsavelId: "",
  });
  const [items, setItems] = useState<ScheduleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"lista" | "agenda">("lista");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.area && filters.area !== "todas") params.set("area", filters.area);
    if (filters.severity) params.set("minSeverity", filters.severity);
    if (filters.search) params.set("search", filters.search);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.responsavelId) params.set("responsavelId", filters.responsavelId);
    fetch(`/api/programacao/agendamento/agenda?${params.toString()}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) {
          throw new Error("Falha ao carregar programação.");
        }
        const payload = (await response.json()) as { items: ScheduleRecord[] };
        setItems(payload.items);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filters.area, filters.from, filters.responsavelId, filters.search, filters.severity, filters.to]);

  const grouped = useMemo(() => groupByDate(items), [items]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/programacao/agendamento/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: filters.area !== "todas" ? filters.area : undefined,
          minSeverity: filters.severity ? Number(filters.severity) : undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          responsavelId: filters.responsavelId || undefined,
          search: filters.search || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error("Falha ao exportar programação.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `programacao-${Date.now()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">Agenda de programação</h1>
            <p className="text-sm text-[var(--muted)]">
              Visualize as programações agendadas, filtre por área e exporte a visão atual.
            </p>
          </div>
          <Button onClick={handleExport} disabled={exporting} loading={exporting} variant="outline">
            <i className="fas fa-file-excel" aria-hidden />
            Exportar Excel
          </Button>
        </div>
      </header>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Área</span>
            <Select
              value={filters.area}
              onChange={event => setFilters(prev => ({ ...prev, area: event.target.value as AreaFilter | "todas" }))}
            >
              {areaOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Criticidade mínima</span>
            <Select
              value={filters.severity}
              onChange={event => setFilters(prev => ({ ...prev, severity: event.target.value }))}
            >
              {severityOptions.map(option => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">De</span>
            <Input
              type="date"
              value={filters.from}
              onChange={event => setFilters(prev => ({ ...prev, from: event.target.value }))}
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Até</span>
            <Input
              type="date"
              value={filters.to}
              onChange={event => setFilters(prev => ({ ...prev, to: event.target.value }))}
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Responsável (ID)</span>
            <Input
              placeholder="Matricula ou ID"
              value={filters.responsavelId}
              onChange={event => setFilters(prev => ({ ...prev, responsavelId: event.target.value }))}
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Busca</span>
            <Input
              placeholder="Máquina, OS ou descrição"
              value={filters.search}
              onChange={event => setFilters(prev => ({ ...prev, search: event.target.value }))}
            />
          </label>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(37,99,235,0.08)_4%)] p-1 text-sm">
          <button
            type="button"
            onClick={() => setTab("lista")}
            className={cn(
              "flex-1 rounded-full px-4 py-2 font-medium transition",
              tab === "lista"
                ? "bg-[var(--primary)] text-white shadow-[0_16px_32px_-24px_rgba(37,99,235,0.75)]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            Lista
          </button>
          <button
            type="button"
            onClick={() => setTab("agenda")}
            className={cn(
              "flex-1 rounded-full px-4 py-2 font-medium transition",
              tab === "agenda"
                ? "bg-[var(--primary)] text-white shadow-[0_16px_32px_-24px_rgba(37,99,235,0.75)]"
                : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            Agenda
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,rgba(148,163,184,0.12)_6%)] px-4 py-6 text-center text-sm text-[var(--muted)]">
            Carregando programação...
          </div>
        ) : tab === "lista" ? (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <table className="min-w-full divide-y divide-[var(--border)] text-sm">
              <thead className="bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.1)_8%)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Data</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Máquina</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">NC / Execução</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Responsáveis</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">Criticidade</th>
                  <th className="px-4 py-2 text-left font-medium text-[var(--muted)]">OS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-[var(--muted)]">
                      Nenhuma programação registrada para o período.
                    </td>
                  </tr>
                ) : (
                  items.map(item => (
                    <tr key={item.id} className="transition hover:bg-[color-mix(in_srgb,var(--surface)_94%,rgba(37,99,235,0.08)_6%)]">
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="font-medium text-[var(--text)]">{formatDate(item.datas.programada, true)}</p>
                          <p className="text-xs text-[var(--muted)]">Prazo: {formatDate(item.datas.prazo)}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text)]">{item.machine.nome ?? "-"}</p>
                        <p className="text-xs text-[var(--muted)]">TAG {item.machine.tag ?? "-"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="font-medium text-[var(--text)]">
                            {item.issue?.descricao ?? "NC sem descrição"}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge
                              variant={item.execucao?.status === "concluida" ? "success" : "muted"}
                              className="text-[10px]"
                            >
                              {item.execucao?.status === "concluida"
                                ? `Concluída ${formatDate(item.execucao?.concluidaEm, true)}`
                                : "Pendente"}
                            </Badge>
                            {item.issue?.severity ? (
                              <CriticidadeBadge
                                state={item.issue.severity}
                                value={item.issue.effectiveSeverity ?? undefined}
                              />
                            ) : null}
                          </div>
                          {item.execucao?.descricao ? (
                            <p className="text-xs text-[var(--muted)]">Conclusão: {item.execucao.descricao}</p>
                          ) : null}
                          {item.issue?.fotos?.length ? (
                            <p className="text-xs text-[var(--muted)]">
                              Fotos NC:{" "}
                              {item.issue.fotos.map((foto, index) => (
                                <a
                                  key={foto}
                                  href={foto}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[var(--primary)] underline decoration-dotted"
                                >
                                  #{index + 1}
                                </a>
                              ))}
                            </p>
                          ) : null}
                          {item.execucao?.fotos?.length ? (
                            <p className="text-xs text-[var(--muted)]">
                              Fotos conclusão:{" "}
                              {item.execucao.fotos.map((foto, index) => (
                                <a
                                  key={foto}
                                  href={foto}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[var(--primary)] underline decoration-dotted"
                                >
                                  #{index + 1}
                                </a>
                              ))}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text)]">{item.responsavel.nome ?? "-"}</p>
                        {item.responsaveis.length > 0 ? (
                          <p className="text-xs text-[var(--muted)]">
                            + {item.responsaveis.map(resp => resp.nome ?? resp.maintId ?? "").filter(Boolean).join(", ")}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <CriticidadeBadge state={item.manutencao.severity} value={item.effectiveSeverity ?? undefined} showStatus />
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">{item.osNumero ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,rgba(148,163,184,0.12)_6%)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                Nenhuma programação agendada.
              </div>
            ) : (
              grouped.map(group => (
                <div key={group.date} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70">
                  <div className="border-b border-[var(--border)] px-4 py-3">
                    <h3 className="text-sm font-semibold text-[var(--text)]">
                      {group.date === "Sem data" ? "Sem data" : formatDate(group.date)}
                    </h3>
                  </div>
                  <ul className="divide-y divide-[var(--border)]">
                    {group.list.map(item => (
                      <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <p className="font-medium text-[var(--text)]">{item.machine.nome ?? item.machine.tag ?? "Máquina"}</p>
                          <p className="text-xs text-[var(--muted)]">
                            {formatDate(item.datas.programada, true)} · Responsável: {item.responsavel.nome ?? "-"}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            NC: {item.issue?.descricao ?? "NC sem descrição"}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                            <Badge variant={item.execucao?.status === "concluida" ? "success" : "muted"}>
                              {item.execucao?.status === "concluida"
                                ? `Concluída ${formatDate(item.execucao?.concluidaEm, true)}`
                                : "Pendente"}
                            </Badge>
                            {item.issue?.fotos?.length ? (
                              <span>
                                Fotos NC: {item.issue.fotos.length}
                              </span>
                            ) : null}
                            {item.execucao?.fotos?.length ? (
                              <span>
                                Fotos conclusão: {item.execucao.fotos.length}
                              </span>
                            ) : null}
                          </div>
                          {item.execucao?.descricao ? (
                            <p className="text-xs text-[var(--muted)]">Conclusão: {item.execucao.descricao}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-2 sm:items-end">
                          <CriticidadeBadge
                            state={item.manutencao.severity}
                            value={item.effectiveSeverity ?? undefined}
                          />
                          <span className="text-xs text-[var(--muted)]">OS {item.osNumero ?? "-"}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
