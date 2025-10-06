import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "default" | "outline" | "ghost" | "secondary" | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-gradient-to-r from-[var(--primary)] via-[var(--primary-600)] to-[color-mix(in_srgb,var(--primary)_82%,var(--primary-700)_18%)] text-white shadow-[0_18px_36px_-22px_rgba(37,99,235,0.55)] hover:shadow-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--primary)_65%,var(--primary-700)_35%)]",
  outline:
    "border border-[color-mix(in_srgb,var(--border)_85%,transparent_15%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(255,255,255,0.8)_4%)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--surface)_90%,rgba(148,163,184,0.08)_10%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
  ghost:
    "text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--surface)_88%,rgba(148,163,184,0.12)_12%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
  secondary:
    "bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.12)_8%)] text-[var(--text)] shadow-[0_10px_30px_-24px_rgb(var(--shadow-color)/55%)] hover:bg-[color-mix(in_srgb,var(--surface)_88%,rgba(148,163,184,0.16)_12%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
  destructive:
    "bg-gradient-to-r from-[var(--danger)] to-[color-mix(in_srgb,var(--danger)_85%,#991b1b_15%)] text-white shadow-[0_18px_36px_-22px_rgba(220,38,38,0.55)] hover:shadow-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--danger)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 rounded-xl px-3.5 text-sm",
  md: "h-11 rounded-2xl px-4 text-sm",
  lg: "h-12 rounded-3xl px-6 text-base",
  icon: "h-11 w-11 rounded-2xl",
};

interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export function buttonStyles({ variant = "default", size = "md", className }: ButtonStyleOptions = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60",
    variantClasses[variant],
    sizeClasses[size],
    className
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", disabled, loading, children, ...props }, ref) => {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        className={buttonStyles({ variant, size, className })}
        disabled={isDisabled}
        {...props}
      >
        {loading && (
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            aria-hidden="true"
            role="presentation"
          >
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path
              className="opacity-80"
              d="M4 12a8 8 0 0 1 8-8"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        )}
        <span>{children}</span>
      </button>
    );
  }
);

Button.displayName = "Button";
