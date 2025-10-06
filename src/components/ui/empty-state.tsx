import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  icon?: ReactNode;
}

export function EmptyState({ title, description, icon, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-[color-mix(in_srgb,var(--border)_70%,transparent_30%)] bg-[color-mix(in_srgb,var(--surface)_94%,rgba(255,255,255,0.82)_6%)] px-8 py-14 text-center text-[var(--muted)] shadow-[0_18px_40px_-28px_rgb(var(--shadow-color)/35%)]",
        className
      )}
      {...props}
    >
      {icon && <div className="text-3xl text-[var(--primary)]" aria-hidden>{icon}</div>}
      <h3 className="text-lg font-semibold text-[var(--text)]">{title}</h3>
      {description && <p className="max-w-md text-sm text-[var(--muted)]">{description}</p>}
    </div>
  );
}
