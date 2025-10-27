"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export interface CorrectiveScheduleContext {
  ncId: string | null;
  description: string | null;
  area: string | null;
  effectiveSeverity: number | null;
}

interface ScheduleCorrectivePlaceholderProps {
  open: boolean;
  onClose: () => void;
  context: CorrectiveScheduleContext | null;
  mode: "existing" | "new";
}

function renderContextSummary(context: CorrectiveScheduleContext | null): ReactNode {
  if (!context) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Preencha os dados da nova corretiva para prosseguir com o agendamento.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-[var(--muted)]">A corretiva será vinculada à seguinte NC:</p>
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)] bg-[color-mix(in_srgb,var(--surface)_95%,rgba(255,255,255,0.85)_5%)] p-3">
        <p className="font-medium text-[var(--text)]">{context.description ?? context.ncId ?? "NC sem descrição"}</p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--muted)]">
          <div>
            <dt className="font-semibold uppercase tracking-wide">Área</dt>
            <dd className="mt-0.5">
              {context.area === "mechanical"
                ? "Mecânica"
                : context.area === "electrical"
                ? "Elétrica"
                : "Não informada"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">Severidade</dt>
            <dd className="mt-0.5">{context.effectiveSeverity ?? "-"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function ScheduleCorrectivePlaceholder({ open, onClose, context, mode }: ScheduleCorrectivePlaceholderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted || !open) {
    return null;
  }

  const target = document.body;
  if (!target) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.55)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[32px] border border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(255,255,255,0.85)_4%)] p-8 text-[var(--text)] shadow-[0_28px_60px_-30px_rgb(var(--shadow-color)/45%)]">
        <header className="space-y-2">
          <h2 className="text-xl font-semibold text-[var(--text)]">Programar corretiva</h2>
          <p className="text-sm text-[var(--muted)]">
            {mode === "existing"
              ? "Este é um espaço reservado para o formulário de agendamento que será implementado na próxima fase."
              : "Utilize este espaço para cadastrar uma nova ordem corretiva sem uma NC vinculada. O formulário completo será liberado em breve."}
          </p>
        </header>

        <div className="mt-6 space-y-4">
          {renderContextSummary(mode === "existing" ? context : null)}
          <div className="rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)] bg-[color-mix(in_srgb,var(--surface)_94%,rgba(255,255,255,0.82)_6%)] p-4 text-sm text-[var(--muted)]">
            O formulário completo de programação será disponibilizado na fase seguinte. Nenhuma alteração é salva nesta etapa.
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>,
    target
  );
}
