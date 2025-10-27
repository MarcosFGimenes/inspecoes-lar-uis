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

export interface CorrectiveScheduleContext {
  ncId: string | null;
  description: string | null;
  area: string | null;
  effectiveSeverity: number | null;
}

interface AssigneeOption {
  id: string;
  nome: string | null;
  matricula: string | null;
  area: "mechanical" | "electrical" | null;
  rawArea: string | null;
}

interface ScheduleResultPayload {
  osId: string;
  ncId: string | null;
  area: "mechanical" | "electrical";
  scheduledDate: string;
  description: string | null;
}

interface ScheduleCorrectiveProps {
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

function formatAssigneeLabel(option: AssigneeOption): string {
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
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assigneesError, setAssigneesError] = useState<string | null>(null);
  const [maintSession, setMaintSession] = useState<MaintSessionInfo | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const loadedAssigneesRef = useRef(false);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

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

  const fetchAssignees = useCallback(async () => {
    if (loadedAssigneesRef.current) {
      return;
    }
    setAssigneesLoading(true);
    setAssigneesError(null);
    try {
      const response = await fetch("/api/correctives/assignees", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = typeof payload?.error === "string" ? payload.error : "Falha ao carregar responsáveis";
        throw new Error(message);
      }
      const payload = (await response.json()) as { items?: Array<Record<string, unknown>> };
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const mapped: AssigneeOption[] = items
        .map(item => {
          const id = typeof item.id === "string" ? item.id : null;
          if (!id) return null;
          const nome = typeof item.nome === "string" ? item.nome : null;
          const matricula = typeof item.matricula === "string" ? item.matricula : null;
          const areaValue = typeof item.area === "string" ? (item.area === "mechanical" || item.area === "electrical" ? item.area : null) : null;
          const rawArea = typeof item.rawArea === "string" ? item.rawArea : null;
          return {
            id,
            nome,
            matricula,
            area: areaValue,
            rawArea,
          } satisfies AssigneeOption;
        })
        .filter((item): item is AssigneeOption => Boolean(item));
      setAssignees(mapped);
      loadedAssigneesRef.current = true;
    } catch (err) {
      console.error("[correctives] failed to load assignees", err);
      const message = err instanceof Error && err.message ? err.message : "Falha ao carregar responsáveis";
      setAssigneesError(message);
    } finally {
      setAssigneesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchAssignees();
    }
  }, [open, fetchAssignees]);

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
    setSubmitting(false);
    // owner is refreshed when options load
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
      setSubmitting(true);
      setSubmitError(null);

      const scheduledIso = toIsoString(scheduledDate);
      if (!scheduledIso) {
        setSubmitError("Informe uma data programada válida.");
        setSubmitting(false);
        return;
      }

      if (!area) {
        setSubmitError("Selecione a área da corretiva.");
        setSubmitting(false);
        return;
      }

      const trimmedDescription = description.trim();
      if (mode === "new" && !trimmedDescription) {
        setSubmitError("Descreva o serviço corretivo.");
        setSubmitting(false);
        return;
      }

      const payload = {
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
      };

      try {
        const response = await fetch("/api/correctives/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          const message = typeof data?.error === "string" ? data.error : "Não foi possível programar a corretiva.";
          throw new Error(message);
        }

        const body = (await response.json()) as { osId?: string };
        if (!body?.osId) {
          throw new Error("Resposta inesperada do servidor.");
        }

        onScheduled({
          osId: body.osId,
          ncId: mode === "existing" ? context?.ncId ?? null : null,
          area,
          scheduledDate: scheduledIso,
          description: trimmedDescription || context?.description || null,
        });
        onClose();
      } catch (err) {
        console.error("[correctives] failed to schedule", err);
        const message = err instanceof Error && err.message ? err.message : "Erro ao programar a corretiva.";
        setSubmitError(message);
      } finally {
        setSubmitting(false);
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
      owner,
      maintainer1,
      maintainer2,
      dueDate,
      onClose,
      onScheduled,
    ]
  );

  if (!mounted || !open) {
    return null;
  }

  const target = document.body;
  if (!target) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.55)] p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={handleBackdropClick} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-3xl overflow-hidden rounded-[32px] border border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(255,255,255,0.85)_4%)] p-8 text-[var(--text)] shadow-[0_28px_60px_-30px_rgb(var(--shadow-color)/45%)]"
        onClick={event => event.stopPropagation()}
      >
        <header className="space-y-1">
          <h2 className="text-xl font-semibold">Programar corretiva</h2>
          <p className="text-sm text-[var(--muted)]">
            Defina os responsáveis e as datas para registrar a ordem de serviço corretiva.
          </p>
        </header>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          {mode === "existing" ? (
            <div className="rounded-2xl border border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)] bg-[color-mix(in_srgb,var(--surface)_95%,rgba(255,255,255,0.85)_5%)] p-4">
              <p className="text-sm text-[var(--muted)]">Corretiva vinculada à NC</p>
              <div className="mt-2 grid gap-3 text-sm text-[var(--text)] md:grid-cols-2">
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">NC</span>
                  <span className="mt-1 block text-base font-medium">{context?.ncId ?? "Não informada"}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Severidade</span>
                  <span className="mt-1 block text-base font-medium">{severityLabel}</span>
                </div>
                <div className="md:col-span-2">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Descrição</span>
                  <span className="mt-1 block text-base font-medium">
                    {context?.description?.trim() || "NC sem descrição"}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="corrective-area">
                Área
              </label>
              <Select
                id="corrective-area"
                value={area}
                onChange={event => setArea(event.target.value as typeof area)}
                disabled={mode === "existing" && Boolean(context?.area) && Boolean(area)}
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
              Descrição da corretiva
            </label>
            <Textarea
              id="corrective-description"
              ref={descriptionRef}
              placeholder="Descreva o serviço corretivo..."
              value={description}
              onChange={event => setDescription(event.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="corrective-owner">
                Responsável
              </label>
              <Select
                id="corrective-owner"
                value={owner}
                onChange={event => setOwner(event.target.value)}
                disabled={assigneesLoading || filteredAssignees.length === 0}
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
              <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="corrective-maintainer1">
                Mantenedor 1
              </label>
              <Select
                id="corrective-maintainer1"
                value={maintainer1}
                onChange={event => setMaintainer1(event.target.value)}
                disabled={assigneesLoading || filteredAssignees.length === 0}
              >
                <option value="">Não atribuído</option>
                {filteredAssignees.map(option => (
                  <option key={option.id} value={option.id}>
                    {formatAssigneeLabel(option)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-[var(--muted)]" htmlFor="corrective-maintainer2">
                Mantenedor 2
              </label>
              <Select
                id="corrective-maintainer2"
                value={maintainer2}
                onChange={event => setMaintainer2(event.target.value)}
                disabled={assigneesLoading || filteredAssignees.length === 0}
              >
                <option value="">Não atribuído</option>
                {filteredAssignees.map(option => (
                  <option key={option.id} value={option.id}>
                    {formatAssigneeLabel(option)}
                  </option>
                ))}
              </Select>
              {assigneesLoading ? (
                <p className="pt-1 text-xs text-[var(--muted)]">Carregando responsáveis disponíveis...</p>) : null}
              {assigneesError ? (
                <p className="pt-1 text-xs text-[var(--danger)]">{assigneesError}</p>
              ) : null}
            </div>
          </div>

          {submitError ? (
            <div className="rounded-2xl border border-[var(--danger)]/25 bg-[color-mix(in_srgb,var(--danger)_9%,transparent_91%)] px-4 py-3 text-sm text-[color-mix(in_srgb,var(--danger)_85%,#991b1b_15%)]">
              {submitError}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" loading={submitting} disabled={!canSubmit}>
              Salvar programação
            </Button>
          </div>
        </form>
      </div>
    </div>,
    target
  );
}
