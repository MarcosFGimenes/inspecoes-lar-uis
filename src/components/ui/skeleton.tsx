import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-[color-mix(in_srgb,var(--surface-strong)_90%,rgba(255,255,255,0.6)_10%)]",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-[color-mix(in_srgb,var(--surface)_70%,rgba(148,163,184,0.25)_30%)] before:to-transparent",
        className
      )}
      {...props}
    />
  );
}
