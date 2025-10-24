"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type MaintainerOption = {
  id: string;
  nome: string;
  matricula: string;
  setor: string | null;
  ativo: boolean;
};

type NcOption = {
  id: string;
  responseId: string;
  questionId: string;
  questionText: string;
  summary: string;
  status: string;
  observation: string | null;
  dueDate: string | null;
  checklistDate: string | null;
  machine: { id: string | null; nome: string | null; tag: string | null };
  maintainer: { nome: string | null; matricula: string | null };
};

type MaintenanceTask = {
  id: string;
  pendencia: string;
  detalhes: string | null;
  origem: "NC" | "MANUAL";
  status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | string;
  prazo: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  responsavel: {
    id: string | null;
    nome: string | null;
    matricula: string | null;
  };
  nc: {
    responseId: string | null;
    questionId: string | null;
    summary: string | null;
    questionText: string | null;
    machineId: string | null;
    machineTag: string | null;
    machineName: string | null;
    checklistDate: string | null;
  } | null;
};

type Feedback = { type: "success" | "error"; message: string } | null;

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "warning" | "success" }> = {
  PENDENTE: { label: "Pendente", variant: "default" },
  EM_ANDAMENTO: { label: "Em andamento", variant: "warning" },
  CONCLUIDA: { label: "Concluída", variant: "success" },
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export default function AdminMaintenanceSchedulePage() {
  const [loadingSession, setLoadingSession] = useState(true);

  const [maintainers, setMaintainers] = useState<MaintainerOption[]>([]);
  const [maintainersLoading, setMaintainersLoading] = useState(true);

  const [ncOptions, setNcOptions] = useState<NcOption[]>([]);
  const [ncLoading, setNcLoading] = useState(true);

  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  const [formMaintainerId, setFormMaintainerId] = useState("");
  const [formNcId, setFormNcId] = useState("");
  const [formPendencia, setFormPendencia] = useState("");
  const [formDetalhes, setFormDetalhes] = useState("");
  const [formPrazo, setFormPrazo] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formFeedback, setFormFeedback] = useState<Feedback>(null);

  const [statusFilter, setStatusFilter] = useState<"todos" | "abertos">("abertos");
  const [tasksFeedback, setTasksFeedback] = useState<Feedback>(null);

  useEffect(() => {
    fetch("/api/admin-session", { cache: "no-store" }).then(response => {
      if (response.status === 401) {
        window.location.href = "/admin/login";
      }
      setLoadingSession(false);
    });
  }, []);

  const loadMaintainers = useCallback(async () => {
    setMaintainersLoading(true);
    try {
      const response = await fetch("/api/mantenedores", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Falha ao carregar mantenedores");
      }
      const data = (await response.json()) as MaintainerOption[];
      setMaintainers(data.filter(item => item.ativo));
    } catch (error: unknown) {
      console.error("[manutencao] failed to load maintainers", error);
      setMaintainers([]);
    } finally {
      setMaintainersLoading(false);
    }
  }, []);

  const loadNcOptions = useCallback(async () => {
    setNcLoading(true);
    try {
      const response = await fetch("/api/nc/abertas?limit=150", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Falha ao carregar não conformidades");
      }
      const data = (await response.json()) as NcOption[];
      setNcOptions(data);
    } catch (error: unknown) {
      console.error("[manutencao] failed to load NC options", error);
      setNcOptions([]);
    } finally {
      setNcLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksFeedback(null);
    try {
      const response = await fetch("/api/manutencoes/programadas", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Falha ao carregar programação de manutenção");
      }
      const data = (await response.json()) as MaintenanceTask[];
      setTasks(data);
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : "Falha ao carregar programação";
      setTasksFeedback({ type: "error", message });
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMaintainers().catch(() => undefined);
    loadNcOptions().catch(() => undefined);
    loadTasks().catch(() => undefined);
  }, [loadMaintainers, loadNcOptions, loadTasks]);

  useEffect(() => {
    if (!formNcId) return;
    const option = ncOptions.find(item => item.id === formNcId);
    if (!option) return;
    const suggested = option.summary?.trim() || option.questionText;
    if (suggested && !formPendencia) {
      setFormPendencia(suggested);
    }
    if (option.dueDate && !formPrazo) {
      const date = new Date(option.dueDate);
      if (!Number.isNaN(date.getTime())) {
        setFormPrazo(date.toISOString().slice(0, 10));
      }
    }
  }, [formNcId, formPendencia, formPrazo, ncOptions]);

  const selectedMaintainer = useMemo(() => maintainers.find(item => item.id === formMaintainerId) ?? null, [
    formMaintainerId,
    maintainers,
  ]);

  const filteredTasks = useMemo(() => {
    if (statusFilter === "todos") return tasks;
    return tasks.filter(task => task.status !== "CONCLUIDA");
  }, [statusFilter, tasks]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (formSubmitting) return;
      setFormFeedback(null);

      if (!formMaintainerId) {
        setFormFeedback({ type: "error", message: "Selecione um mantenedor." });
        return;
      }
      if (!formPendencia.trim()) {
        setFormFeedback({ type: "error", message: "Descreva a pendência a ser executada." });
        return;
      }

      setFormSubmitting(true);
      try {
        const maintainer = maintainers.find(item => item.id === formMaintainerId);
        const ncOption = ncOptions.find(item => item.id === formNcId);
        const payload: Record<string, unknown> = {
          pendencia: formPendencia.trim(),
          detalhes: formDetalhes.trim() ? formDetalhes.trim() : undefined,
          responsavelId: maintainer?.id,
          responsavelNome: maintainer?.nome,
          responsavelMatricula: maintainer?.matricula,
          prazo: formPrazo || undefined,
          origem: ncOption ? "NC" : "MANUAL",
        };

        if (ncOption) {
          payload.nc = {
            responseId: ncOption.responseId,
            questionId: ncOption.questionId,
            summary: ncOption.summary,
            questionText: ncOption.questionText,
            machineId: ncOption.machine.id,
            machineTag: ncOption.machine.tag,
            machineName: ncOption.machine.nome,
            checklistDate: ncOption.checklistDate,
          };
        }

        const response = await fetch("/api/manutencoes/programadas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          throw new Error(errorPayload?.error ?? "Não foi possível criar a programação");
        }

        const created = (await response.json()) as MaintenanceTask;
        setTasks(current => [created, ...current]);
        setFormFeedback({ type: "success", message: "Pendência atribuída ao mantenedor." });
        setFormNcId("");
        setFormPendencia("");
        setFormDetalhes("");
        setFormPrazo("");
      } catch (error: unknown) {
        const message = error instanceof Error && error.message ? error.message : "Falha ao salvar programação";
        setFormFeedback({ type: "error", message });
      } finally {
        setFormSubmitting(false);
      }
    },
    [formSubmitting, formMaintainerId, formPendencia, formDetalhes, formPrazo, formNcId, maintainers, ncOptions]
  );

  const handleUpdateStatus = useCallback(
    async (task: MaintenanceTask, status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA") => {
      try {
        const response = await fetch(`/api/manutencoes/programadas/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Não foi possível atualizar o status");
        }
        const updated = (await response.json()) as MaintenanceTask;
        setTasks(current => current.map(item => (item.id === updated.id ? updated : item)));
      } catch (error: unknown) {
        const message = error instanceof Error && error.message ? error.message : "Falha ao atualizar status";
        setTasksFeedback({ type: "error", message });
      }
    },
    []
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[var(--text)]">Programar manutenção</h1>
          <p className="text-sm text-[var(--muted)]">
            Separe as pendências das inspeções e crie ordens de manutenção direcionadas para cada mantenedor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/dashboard" className={buttonStyles({ variant: "secondary" })}>
            <i className="fas fa-arrow-left" aria-hidden />
            Voltar ao dashboard
          </Link>
          <Button type="button" variant="outline" onClick={() => loadTasks().catch(() => undefined)} disabled={tasksLoading}>
            <i className="fas fa-rotate" aria-hidden />
            Atualizar lista
          </Button>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Criar programação</CardTitle>
            <CardDescription>
              Escolha uma não conformidade aberta ou descreva uma pendência manual e atribua ao mantenedor responsável.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text)]" htmlFor="maintainer">
                  Mantenedor responsável
                </label>
                {maintainersLoading ? (
                  <Skeleton className="h-11 w-full" />
                ) : (
                  <Select
                    id="maintainer"
                    value={formMaintainerId}
                    onChange={event => setFormMaintainerId(event.target.value)}
                  >
                    <option value="">Selecione um mantenedor</option>
                    {maintainers.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.nome} — {item.matricula}
                      </option>
                    ))}
                  </Select>
                )}
                {selectedMaintainer && (
                  <p className="text-xs text-[var(--muted)]">
                    {selectedMaintainer.setor ? `Setor ${selectedMaintainer.setor}` : "Setor não informado"}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text)]" htmlFor="nc">
                  Não conformidade (opcional)
                </label>
                {ncLoading ? (
                  <Skeleton className="h-11 w-full" />
                ) : (
                  <Select id="nc" value={formNcId} onChange={event => setFormNcId(event.target.value)}>
                    <option value="">Nenhuma — digitar pendência manual</option>
                    {ncOptions.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.machine.tag ? `${item.machine.tag} • ` : ""}
                        {item.summary}
                      </option>
                    ))}
                  </Select>
                )}
                {formNcId && (
                  <div className="rounded-2xl border border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)] bg-[color-mix(in_srgb,var(--surface)_95%,rgba(148,163,184,0.12)_5%)] px-3 py-2 text-xs text-[var(--muted)]">
                    {(() => {
                      const option = ncOptions.find(item => item.id === formNcId);
                      if (!option) return null;
                      return (
                        <div className="space-y-1">
                          <p className="font-medium text-[var(--text)]">{option.summary}</p>
                          <p>
                            {option.machine.tag ? `${option.machine.tag} • ` : ""}
                            {option.machine.nome ?? "Máquina"}
                          </p>
                          {option.dueDate && (
                            <p>
                              Prazo sugerido: {formatDate(option.dueDate)}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text)]" htmlFor="pendencia">
                  Pendência a executar
                </label>
                <Input
                  id="pendencia"
                  placeholder="Descreva o que precisa ser executado"
                  value={formPendencia}
                  onChange={event => setFormPendencia(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text)]" htmlFor="detalhes">
                  Orientações adicionais
                </label>
                <Textarea
                  id="detalhes"
                  placeholder="Detalhes técnicos, peças e combinações necessárias"
                  value={formDetalhes}
                  onChange={event => setFormDetalhes(event.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text)]" htmlFor="prazo">
                  Prazo para execução
                </label>
                <Input
                  id="prazo"
                  type="date"
                  value={formPrazo}
                  onChange={event => setFormPrazo(event.target.value)}
                />
              </div>

              {formFeedback && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    formFeedback.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  {formFeedback.message}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" loading={formSubmitting}>
                  <i className="fas fa-calendar-plus" aria-hidden />
                  Programar manutenção
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormNcId("");
                    setFormPendencia("");
                    setFormDetalhes("");
                    setFormPrazo("");
                    setFormFeedback(null);
                  }}
                >
                  <i className="fas fa-eraser" aria-hidden />
                  Limpar campos
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <CardTitle>Programações existentes</CardTitle>
              <CardDescription>Acompanhe o andamento das pendências e atualize o status quando concluídas.</CardDescription>
            </div>
            <Select value={statusFilter} onChange={event => setStatusFilter(event.target.value as "todos" | "abertos")}>
              <option value="abertos">Pendentes e em andamento</option>
              <option value="todos">Todas as programações</option>
            </Select>
          </CardHeader>
          <CardContent className="space-y-4">
            {tasksFeedback && (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  tasksFeedback.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {tasksFeedback.message}
              </div>
            )}
            {tasksLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : filteredTasks.length === 0 ? (
              <EmptyState
                title="Nenhuma programação encontrada"
                description="Crie uma pendência para visualizar aqui a agenda do mantenedor."
                icon={<i className="fas fa-clipboard-list" aria-hidden />}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pendência</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Atualizar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map(task => {
                      const badge = STATUS_LABELS[task.status] ?? STATUS_LABELS.PENDENTE;
                      return (
                        <TableRow key={task.id}>
                          <TableCell className="max-w-xs">
                            <div className="space-y-1">
                              <p className="font-medium text-[var(--text)]">{task.pendencia}</p>
                              {task.nc?.machineTag || task.nc?.machineName ? (
                                <p className="text-xs text-[var(--muted)]">
                                  {task.nc?.machineTag ? `${task.nc.machineTag} • ` : ""}
                                  {task.nc?.machineName ?? "Máquina"}
                                </p>
                              ) : null}
                              {task.detalhes && (
                                <p className="text-xs text-[var(--muted)]">{task.detalhes}</p>
                              )}
                              <p className="text-[11px] text-[var(--muted)]">
                                Criada em {formatDateTime(task.createdAt)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium text-[var(--text)]">{task.responsavel.nome ?? "Sem nome"}</p>
                              <p className="text-xs text-[var(--muted)]">{task.responsavel.matricula ?? "Sem matrícula"}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {task.origem === "NC" ? (
                              <Badge variant="warning">NC</Badge>
                            ) : (
                              <Badge>Manual</Badge>
                            )}
                          </TableCell>
                          <TableCell>{formatDate(task.prazo)}</TableCell>
                          <TableCell>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Select
                              value={task.status}
                              onChange={event =>
                                handleUpdateStatus(task, event.target.value as "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA")
                              }
                            >
                              <option value="PENDENTE">Pendente</option>
                              <option value="EM_ANDAMENTO">Em andamento</option>
                              <option value="CONCLUIDA">Concluída</option>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {!loadingSession && (
        <p className="text-xs text-[var(--muted)]">
          As alterações ficam disponíveis imediatamente para o mantenedor em sua página de programação de manutenção.
        </p>
      )}
    </div>
  );
}
