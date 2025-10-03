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
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center text-[var(--muted)]",
        className
      )}
      {...props}
    >
      {icon && <div className="text-3xl" aria-hidden>{icon}</div>}
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      {description && <p className="max-w-md text-sm text-[var(--muted)]">{description}</p>}
    </div>
  );
}
