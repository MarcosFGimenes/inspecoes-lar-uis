import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "muted";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "border border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] bg-[color-mix(in_srgb,var(--surface)_94%,rgba(255,255,255,0.8)_6%)] text-[var(--text)]",
  success:
    "bg-[color-mix(in_srgb,var(--success)_18%,rgba(16,185,129,0.08)_82%)] text-[var(--success)]",
  warning:
    "bg-[color-mix(in_srgb,var(--warning)_24%,rgba(251,191,36,0.08)_76%)] text-[#b45309]",
  danger:
    "bg-[color-mix(in_srgb,var(--danger)_22%,rgba(220,38,38,0.08)_78%)] text-[#991b1b]",
  muted:
    "border border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)] bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.1)_8%)] text-[var(--muted)]",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide shadow-[0_10px_24px_-20px_rgb(var(--shadow-color)/45%)]",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
