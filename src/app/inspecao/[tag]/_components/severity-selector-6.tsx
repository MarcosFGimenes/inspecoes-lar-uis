"use client";

import { useCallback } from "react";

import type { Severity6 } from "@/types/severity";

const OPTIONS: Array<{
  value: Severity6;
  label: string;
  tone: string;
  tooltip: string;
}> = [
  { value: 1, label: "1", tone: "from-red-900/20 to-red-900/30", tooltip: "Baixa" },
  { value: 2, label: "2", tone: "from-red-800/30 to-red-800/40", tooltip: "Moderada" },
  { value: 3, label: "3", tone: "from-red-700/40 to-red-700/50", tooltip: "Relevante" },
  { value: 4, label: "4", tone: "from-red-600/60 to-red-600/70", tooltip: "Alta" },
  { value: 5, label: "5", tone: "from-red-500/80 to-red-500/90", tooltip: "Muito alta" },
  { value: 6, label: "6", tone: "from-red-500 to-red-500", tooltip: "Crítica" },
];

function buildClasses(active: boolean, disabled: boolean) {
  const base =
    "inline-flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300";
  if (disabled) {
    return `${base} cursor-not-allowed border-red-900/20 bg-red-900/10 text-red-200`;
  }
  if (active) {
    return `${base} border-red-400 bg-gradient-to-br from-red-600 to-red-500 text-white shadow`;
  }
  return `${base} border border-red-900/40 bg-gradient-to-br from-red-900/10 to-red-900/20 text-red-200 hover:border-red-500 hover:text-red-100`;
}

interface Props {
  value: Severity6 | null;
  onChange: (value: Severity6) => void;
  disabled?: boolean;
}

export function SeveritySelector6({ value, onChange, disabled = false }: Props) {
  const handleSelect = useCallback(
    (option: Severity6) => {
      if (disabled) return;
      onChange(option);
    },
    [disabled, onChange]
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-red-200">Severidade da não conformidade (1–6)</span>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Selecionar severidade da não conformidade">
        {OPTIONS.map(option => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`${buildClasses(isActive, disabled)} ${!disabled ? `bg-gradient-to-br ${option.tone}` : ""}`.trim()}
              onClick={() => handleSelect(option.value)}
              aria-pressed={isActive}
              aria-label={`Severidade ${option.value} — ${option.tooltip}`}
              disabled={disabled}
              title={`Severidade ${option.value} · ${option.tooltip}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-red-100/80">1 = Baixa ··· 6 = Crítica</p>
    </div>
  );
}
