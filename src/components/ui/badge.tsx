import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "muted";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-[var(--surface-strong)] text-[var(--text)] border border-[var(--border)]",
  success: "bg-[color-mix(in_oklab,var(--primary),#fff_70%)] text-[var(--primary-700)]",
  warning: "bg-[color-mix(in_oklab,#fbbf24,#fff_70%)] text-[#b45309]",
  danger: "bg-[color-mix(in_oklab,var(--danger),#fff_70%)] text-[#991b1b]",
  muted: "bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)]",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
