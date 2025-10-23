"use client";

import type { Severity, SeverityState } from "@/types/severity";
import { cn } from "@/lib/cn";

const palette: Record<Severity, { bg: string; text: string; border: string }> = {
  1: {
    bg: "bg-rose-100/80 dark:bg-rose-900/50",
    text: "text-rose-700 dark:text-rose-200",
    border: "border-rose-200/80 dark:border-rose-700/70",
  },
  2: {
    bg: "bg-rose-200/80 dark:bg-rose-900/60",
    text: "text-rose-700 dark:text-rose-200",
    border: "border-rose-300/80 dark:border-rose-700/70",
  },
  3: {
    bg: "bg-rose-300/80 dark:bg-rose-900/70",
    text: "text-rose-800 dark:text-rose-100",
    border: "border-rose-400/80 dark:border-rose-600/70",
  },
  4: {
    bg: "bg-rose-400/80 dark:bg-rose-900/80",
    text: "text-rose-900 dark:text-rose-50",
    border: "border-rose-500/80 dark:border-rose-500/70",
  },
  5: {
    bg: "bg-rose-500/80 dark:bg-rose-950/80",
    text: "text-rose-50",
    border: "border-rose-600/80 dark:border-rose-500/80",
  },
};

function deriveSeverity(value?: Severity | null, state?: SeverityState | null): Severity | null {
  if (typeof value === "number" && value >= 1 && value <= 5) {
    return value as Severity;
  }
  if (!state) return null;
  if (typeof state.effective === "number") {
    return state.effective as Severity;
  }
  if (typeof state.signer === "number") {
    return state.signer as Severity;
  }
  if (typeof state.maintainer === "number") {
    return state.maintainer as Severity;
  }
  return null;
}

function resolveStatus(state?: SeverityState | null) {
  if (!state) return "";
  if (typeof state.signer === "number") {
    return "assinado";
  }
  if (state.signer === null && typeof state.maintainer === "number") {
    return "aguardando";
  }
  if (typeof state.maintainer === "number") {
    return "sugerido";
  }
  return "";
}

export interface CriticidadeBadgeProps {
  value?: Severity | null;
  state?: SeverityState | null;
  label?: string;
  className?: string;
  showStatus?: boolean;
}

export function CriticidadeBadge({ value, state, label, className, showStatus }: CriticidadeBadgeProps) {
  const finalSeverity = deriveSeverity(value, state);
  const paletteEntry = finalSeverity ? palette[finalSeverity] : null;
  const status = showStatus ? resolveStatus(state) : "";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        paletteEntry ? `${paletteEntry.bg} ${paletteEntry.text} ${paletteEntry.border}` : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
        className,
      )}
    >
      {label ? <span>{label}</span> : null}
      <span className="flex items-center gap-1">
        <span>{finalSeverity ?? "-"}</span>
        {status ? (
          <span className="rounded-full bg-white/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700/90 dark:bg-rose-950/40 dark:text-rose-100/90">
            {status === "assinado" ? "PCM" : status === "aguardando" ? "aguarda PCM" : ""}
          </span>
        ) : null}
      </span>
    </span>
  );
}
