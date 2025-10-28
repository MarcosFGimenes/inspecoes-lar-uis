"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { useCorrectiveAssignees } from "../_hooks/useCorrectiveAssignees";
import { useScheduleCorrectiveMutation } from "../_hooks/useScheduleCorrectiveMutation";
import type {
  CorrectiveAssigneeOption,
  CorrectiveScheduleContext,
  ScheduleResultPayload,
} from "../_types";

export interface ScheduleCorrectiveProps {
  open: boolean;
  onClose: () => void;
  context: CorrectiveScheduleContext | null;
  mode: "existing" | "new";
  onScheduled: (payload: ScheduleResultPayload) => void;
}

interface MaintSessionInfo {
  id: string | null;
  nome: string | null;
  matricula: string | null;
}

function normalizeArea(area: string | null | undefined): "mechanical" | "electrical" | "" {
  if (!area) return "";
  if (area === "mechanical" || area === "electrical") {
    return area;
  }
  const lowered = area.toLowerCase();
  if (["mecanico", "mecânico", "mecanica", "mecânica"].some(term => lowered.includes(term))) {
    return "mechanical";
  }
  if (["eletrico", "elétrico", "eletrica", "elétrica", "elétric"].some(term => lowered.includes(term))) {
    return "electrical";
  }
  return "";
}

function formatArea(area: string | null | undefined): string {
  if (!area) return "-";
  if (area === "mechanical") return "Mecânica";
  if (area === "electrical") return "Elétrica";
  if (typeof area === "string" && area.trim().length > 0) {
    return area;
  }
  return "-";
}

function formatAssigneeLabel(option: CorrectiveAssigneeOption): string {
  const pieces: string[] = [];
  if (option.matricula) {
    pieces.push(option.matricula);
  }
  if (option.nome) {
    pieces.push(option.nome);
  }
  const base = pieces.join(" — ") || option.id;
  if (option.area === "mechanical") {
    return `${base} (Mecânica)`;
  }
  if (option.area === "electrical") {
    return `${base} (Elétrica)`;
  }
  if (option.rawArea) {
    return `${base} (${option.rawArea})`;
  }
  return base;
}

function toIsoString(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function resolveDescription(context: CorrectiveScheduleContext | null, mode: "existing" | "new"): string {
  if (mode === "existing") {
    return context?.description ?? "";
  }
  return "";
}

export function ScheduleCorrectivePlaceholder({
  open,
  onClose,
  context,
  mode,
  onScheduled,
}: ScheduleCorrectiveProps) {
  const [mounted, setMounted] = useState(false);
  const [area, setArea] = useState<"" | "mechanical" | "electrical">(normalizeArea(context?.area));
  const [description, setDescription] = useState<string>(resolveDescription(context, mode));
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [owner, setOwner] = useState<string>("");
  const [maintainer1, setMaintainer1] = useState<string>("");
  const [maintainer2, setMaintainer2] = useState<string>("");
  const [maintSession, setMaintSession] = useState<MaintSessionInfo | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

  const scheduleMutation = useScheduleCorrectiveMutation();
  const submitting = scheduleMutation.isPending;

  const {
    data: assigneesData = [],
    isLoading: assigneesLoading,
    error: assigneesError,
  } = useCorrectiveAssignees(open);

  const assignees = assigneesData;

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch("/api/auth/maint/me", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { store?: { id?: string; nome?: string; matricula?: string } };
        if (payload?.store) {
          setMaintSession({
            id: payload.store.id ?? null,
            nome: payload.store.nome ?? null,
            matricula: payload.store.matricula ?? null,
          });
        }
      } catch (err) {
        console.error("[correctives] failed to load maint session", err);
      }
    }

    loadSession();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const normalizedArea = normalizeArea(context?.area);
    setArea(mode === "existing" ? normalizedArea : normalizeArea(context?.area));
    setDescription(resolveDescription(context, mode));
    setScheduledDate("");
    setDueDate("");
    setMaintainer1("");
    setMaintainer2("");
    setSubmitError(null);
  }, [open, context, mode]);

  const filteredAssignees = useMemo(() => {
    if (!area) {
      return assignees;
    }
    return assignees.filter(option => !option.area || option.area === area);
  }, [assignees, area]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = setTimeout(() => {
      descriptionRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    if (filteredAssignees.length === 0) {
      if (owner) {
        setOwner("");
      }
      return;
    }
    if (owner && filteredAssignees.some(option => option.id === owner)) {
      return;
    }
    const preferredId = maintSession?.id;
    if (preferredId && filteredAssignees.some(option => option.id === preferredId)) {
      setOwner(preferredId);
      return;
    }
    setOwner(filteredAssignees[0]?.id ?? "");
  }, [open, filteredAssignees, owner, maintSession]);

  useEffect(() => {
    if (!open) return;
    if (maintainer1 && !filteredAssignees.some(option => option.id === maintainer1)) {
      setMaintainer1("");
    }
    if (maintainer2 && !filteredAssignees.some(option => option.id === maintainer2)) {
      setMaintainer2("");
    }
  }, [open, filteredAssignees, maintainer1, maintainer2]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const severityLabel = useMemo(() => {
    if (!context?.effectiveSeverity) {
      return "-";
    }
    return `Severidade ${context.effectiveSeverity}`;
  }, [context?.effectiveSeverity]);

  const machineLabel = useMemo(() => {
    if (!context?.machineName && !context?.machineTag) {
      return "Máquina não identificada";
    }
    if (context.machineName && context.machineTag) {
      return `${context.machineName} · TAG ${context.machineTag}`;
    }
    return context.machineName ?? `TAG ${context.machineTag}`;
  }, [context?.machineName, context?.machineTag]);

  const photos = context?.photos ?? null;

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!owner) return false;
    if (!area) return false;
    if (!scheduledDate) return false;
    if (mode === "new" && !description.trim()) return false;
    return true;
  }, [owner, area, scheduledDate, submitting, mode, description]);

  const handleBackdropClick = useCallback(() => {
    if (!submitting) {
      onClose();
    }
  }, [onClose, submitting]);

  const handleSubmit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (!canSubmit) {
        return;
      }
      setSubmitError(null);

      const scheduledIso = toIsoString(scheduledDate);
      if (!scheduledIso) {
        setSubmitError("Informe uma data programada válida.");
        return;
      }

      if (!area) {
        setSubmitError("Selecione a área da corretiva.");
        return;
      }

      const trimmedDescription = description.trim();
      if (mode === "new" && !trimmedDescription) {
        setSubmitError("Descreva o serviço corretivo.");
        return;
      }

      const requestPayload = {
        ncId: mode === "existing" ? context?.ncId ?? undefined : undefined,
        description: trimmedDescription || undefined,
        area,
        assignees: {
          owner,
          maintainer1: maintainer1 || undefined,
          maintainer2: maintainer2 || undefined,
        },
        scheduledDate: scheduledIso,
        dueDate: dueDate ? toIsoString(dueDate) ?? undefined : undefined,
        ncContext:
          mode === "existing"
            ? {
                description: context?.description ?? null,
                area,
                effectiveSeverity: context?.effectiveSeverity ?? null,
                severity:
                  context?.effectiveSeverity && context.effectiveSeverity >= 1
                    ? { maintainer: context.effectiveSeverity }
                    : null,
                inspectionId: context?.inspectionId ?? undefined,
                source: context?.source ?? undefined,
                machineId: context?.machineId ?? undefined,
                machineTag: context?.machineTag ?? undefined,
                machineName: context?.machineName ?? undefined,
                osNumero: context?.osNumero ?? undefined,
                photos: context?.photos ?? undefined,
                questionId: context?.questionId ?? undefined,
                questionLabel: context?.questionLabel ?? undefined,
                inspectionResponseId: context?.inspectionResponseId ?? undefined,
                templateId: context?.templateId ?? undefined,
              }
            : undefined,
      };

      const resultBase: Omit<ScheduleResultPayload, "osId"> = {
        ncId: mode === "existing" ? context?.ncId ?? null : null,
        area,
        scheduledDate: scheduledIso,
        dueDate: requestPayload.dueDate ?? null,
        description: trimmedDescription || context?.description || null,
        effectiveSeverity: context?.effectiveSeverity ?? null,
        inspectionId: context?.inspectionId ?? null,
        source: context?.source ?? null,
        status: "scheduled",
        updatedAt: new Date().toISOString(),
        machineId: context?.machineId ?? null,
        machineTag: context?.machineTag ?? null,
        machineName: context?.machineName ?? null,
        ncPhotos: context?.photos ?? null,
        osNumero: context?.osNumero ?? null,
        inspectionResponseId: context?.inspectionResponseId ?? null,
        templateId: context?.templateId ?? null,
        questionId: context?.questionId ?? null,
        questionLabel: context?.questionLabel ?? null,
        assignees: {
          owner,
          maintainer1: maintainer1 || null,
          maintainer2: maintainer2 || null,
        },
      };

      try {
        await scheduleMutation.mutateAsync({
          request: requestPayload,
          ncId: mode === "existing" ? context?.ncId ?? null : null,
          result: resultBase,
          onSuccess: payload => {
            onScheduled(payload);
            onClose();
          },
        });
      } catch (err) {
        console.error("[correctives] failed to schedule", err);
        const message = err instanceof Error && err.message ? err.message : "Erro ao programar a corretiva.";
        setSubmitError(message);
      }
    },
    [
      canSubmit,
      scheduledDate,
      area,
      description,
      mode,
      context?.ncId,
      context?.description,
      context?.effectiveSeverity,
      context?.inspectionId,
      context?.source,
      owner,
      maintainer1,
      maintainer2,
      dueDate,
      onClose,
      onScheduled,
      scheduleMutation,
    ]
  );

  if (!mounted) {
    return null;
  }

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) {
    return null;
  }

  return createPortal(
    open ? (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm">
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Fechar programação corretiva"
          onClick={handleBackdropClick}
        />
        <div className="relative z-10 w-full max-w-2xl rounded-[32px] border border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)] bg-[color-mix(in_srgb,var(--surface)_97%,rgba(255,255,255,0.9)_3%)] shadow-[0_28px_80px_-30px_rgb(var(--shadow-color)/45%)]">
          <div className="flex items-start justify-between rounded-t-[32px] bg-[color-mix(in_srgb,var(--surface)_94%,rgba(255,255,255,0.8)_6%)] px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-[var(--text)]">Programar corretiva</h2>
              <p className="text-sm text-[var(--muted)]">
                {mode === "existing"
                  ? "Confirme as informações e defina a agenda para tratar a NC selecionada."
                  : "Defina a programação de um novo serviço corretivo."}
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={handleBackdropClick} disabled={submitting}>
              <i className="fas fa-xmark" aria-hidden />
              <span className="sr-only">Fechar</span>
            </Button>
          </div>

          <form className="space-y-6 px-6 pb-6" onSubmit={handleSubmit}>
            {assigneesError ? (
              <div className="rounded-2xl border border-[var(--warning)]/40 bg-[color-mix(in_srgb,var(--warning)_8%,transparent_92%)] px-4 py-3 text-sm text-[color-mix(in_srgb,var(--warning)_80%,#92400e_20%)]">
                {assigneesError instanceof Error ? assigneesError.message : String(assigneesError)}
              </div>
            ) : null}

            {mode === "existing" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-2xl border border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(255,255,255,0.85)_4%)] p-4">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Máquina</span>
                    <p className="text-sm font-medium text-[var(--text)]">{machineLabel}</p>
                    <p className="text-xs text-[var(--muted)]">NC #{context?.ncId ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Item do checklist</span>
                    <p className="text-sm text-[var(--text)]">
                      {context?.questionLabel || context?.description || "Item não identificado"}
                    </p>
                    {context?.area ? (
                      <p className="text-xs text-[var(--muted)]">Área sugerida: {formatArea(context.area)}</p>
                    ) : null}
                    {context?.osNumero ? (
                      <p className="text-xs text-[var(--muted)]">O.S. vinculada: {context.osNumero}</p>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-3 rounded-2xl border border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(255,255,255,0.85)_4%)] p-4">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Severidade efetiva</span>
                    <p className="text-sm font-medium text-[var(--text)]">{severityLabel}</p>
                  </div>
                  {photos?.length ? (
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Anexos</span>
                      <ul className="mt-1 space-y-1 text-xs text-[var(--primary-700)]">
                        {photos.map((photo, index) => (
                          <li key={photo.key ?? photo.url ?? `photo-${index}`}>
                            <a
                              href={photo.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[color-mix(in_srgb,var(--primary)_85%,var(--text)_15%)] underline-offset-2 hover:underline"
                            >
                              <i className="fas fa-paperclip text-[0.75rem]" aria-hidden />
                              Ver anexo
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="corrective-area">
                  Área da corretiva
                </label>
                <Select
                  id="corrective-area"
                  value={area}
                  onChange={event => setArea(event.target.value as typeof area)}
                  disabled={mode === "existing" && Boolean(context?.area)}
                >
                  <option value="">Selecione a área</option>
                  <option value="mechanical">Mecânica</option>
                  <option value="electrical">Elétrica</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="corrective-scheduled">
                  Data programada
                </label>
                <Input
                  id="corrective-scheduled"
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={event => setScheduledDate(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="corrective-due">
                  Prazo (opcional)
                </label>
                <Input
                  id="corrective-due"
                  type="datetime-local"
                  value={dueDate}
                  onChange={event => setDueDate(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="corrective-description">
                Descrição do serviço
              </label>
              <Textarea
                id="corrective-description"
                ref={descriptionRef}
                rows={4}
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder="Descreva o serviço corretivo a ser executado"
                disabled={mode === "existing"}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="corrective-owner">
                  Responsável
                </label>
                <Select
                  id="corrective-owner"
                  value={owner}
                  onChange={event => setOwner(event.target.value)}
                  disabled={filteredAssignees.length === 0 || assigneesLoading}
                >
                  <option value="">Selecione o responsável</option>
                  {filteredAssignees.map(option => (
                    <option key={option.id} value={option.id}>
                      {formatAssigneeLabel(option)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="corrective-maint1">
                  Mantenedor 1
                </label>
                <Select
                  id="corrective-maint1"
                  value={maintainer1}
                  onChange={event => setMaintainer1(event.target.value)}
                  disabled={filteredAssignees.length === 0 || assigneesLoading}
                >
                  <option value="">Não atribuir</option>
                  {filteredAssignees.map(option => (
                    <option key={option.id} value={option.id}>
                      {formatAssigneeLabel(option)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="corrective-maint2">
                  Mantenedor 2
                </label>
                <Select
                  id="corrective-maint2"
                  value={maintainer2}
                  onChange={event => setMaintainer2(event.target.value)}
                  disabled={filteredAssignees.length === 0 || assigneesLoading}
                >
                  <option value="">Não atribuir</option>
                  {filteredAssignees.map(option => (
                    <option key={option.id} value={option.id}>
                      {formatAssigneeLabel(option)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {submitError ? (
              <div className="rounded-2xl border border-[var(--danger)]/30 bg-[color-mix(in_srgb,var(--danger)_8%,transparent_92%)] px-4 py-3 text-sm text-[color-mix(in_srgb,var(--danger)_85%,#991b1b_15%)]">
                {submitError}
              </div>
            ) : null}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={handleBackdropClick} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" loading={submitting} disabled={!canSubmit}>
                Salvar programação
              </Button>
            </div>
          </form>
        </div>
      </div>
    ) : null,
    portalTarget
  );
}
