"use client";

import { useCallback, useMemo } from "react";

import type { Severity } from "@/types/severity";
import { cn } from "@/lib/cn";

const LEVELS: Severity[] = [1, 2, 3, 4, 5];

const palette: Array<{ background: string; border: string; text: string; shadow: string }> = [
  {
    background: "linear-gradient(135deg, rgba(254,226,226,0.95), rgba(252,165,165,0.85))",
    border: "rgba(254,202,202,1)",
    text: "#7f1d1d",
    shadow: "rgba(248,113,113,0.45)",
  },
  {
    background: "linear-gradient(135deg, rgba(254,202,202,0.95), rgba(252,165,165,0.85))",
    border: "rgba(248,171,171,1)",
    text: "#7f1d1d",
    shadow: "rgba(239,68,68,0.45)",
  },
  {
    background: "linear-gradient(135deg, rgba(252,165,165,0.96), rgba(248,113,113,0.88))",
    border: "rgba(248,113,113,1)",
    text: "#7f1d1d",
    shadow: "rgba(220,38,38,0.45)",
  },
  {
    background: "linear-gradient(135deg, rgba(248,113,113,0.95), rgba(239,68,68,0.9))",
    border: "rgba(239,68,68,1)",
    text: "#7f1d1d",
    shadow: "rgba(185,28,28,0.45)",
  },
  {
    background: "linear-gradient(135deg, rgba(239,68,68,0.95), rgba(220,38,38,0.92))",
    border: "rgba(220,38,38,1)",
    text: "#7f1d1d",
    shadow: "rgba(153,27,27,0.5)",
  },
];

export interface CriticidadeSelectorProps {
  value: Severity | null | undefined;
  onChange: (value: Severity) => void;
  disabled?: boolean;
  className?: string;
  name?: string;
}

export function CriticidadeSelector({ value, onChange, disabled, className, name }: CriticidadeSelectorProps) {
  const currentValue = useMemo<Severity | null>(() => (typeof value === "number" ? value : null), [value]);

  const handleArrowChange = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, level: Severity) => {
      if (disabled) return;
      const base = currentValue ?? level;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = Math.min(5, base + 1) as Severity;
        if (next !== currentValue) {
          onChange(next);
        }
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = Math.max(1, base - 1) as Severity;
        if (next !== currentValue) {
          onChange(next);
        }
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        if (currentValue !== 1) {
          onChange(1);
        }
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        if (currentValue !== 5) {
          onChange(5 as Severity);
        }
      }
    },
    [currentValue, disabled, onChange],
  );

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="radiogroup" aria-disabled={disabled}>
      {LEVELS.map(level => {
        const active = currentValue === level;
        const styles = palette[level - 1] ?? palette[0]!;
        return (
          <button
            key={level}
            type="button"
            name={name}
            role="radio"
            aria-checked={active}
            aria-label={`Criticidade ${level}`}
            disabled={disabled}
            onKeyDown={event => handleArrowChange(event, level)}
            onClick={() => {
              if (!disabled) {
                onChange(level);
              }
            }}
            tabIndex={active || (!currentValue && level === 3) ? 0 : -1}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl border-2 font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              active
                ? "shadow-[0_10px_25px_-12px_rgba(220,38,38,0.45)] focus-visible:ring-[rgba(220,38,38,0.5)]"
                : "bg-[color-mix(in_srgb,var(--surface)_92%,rgba(254,226,226,0.2)_8%)] text-[var(--text)] focus-visible:ring-[color-mix(in_srgb,var(--primary)_45%,rgba(220,38,38,0.35)_55%)]",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:scale-[1.04]",
            )}
            style={
              active
                ? {
                    background: styles.background,
                    borderColor: styles.border,
                    color: styles.text,
                    boxShadow: `0 12px 24px -18px ${styles.shadow}`,
                  }
                : {
                    borderColor: "color-mix(in srgb, var(--border) 72%, rgba(252,165,165,0.45) 28%)",
                  }
            }
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}
