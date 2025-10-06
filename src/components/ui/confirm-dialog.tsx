import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "@/lib/cn";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm(): void;
  onCancel(): void;
  busy?: boolean;
  footer?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  busy,
  footer,
}: ConfirmDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;
  const portalTarget = document.body;
  if (!portalTarget || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.55)] p-4 backdrop-blur-sm"
    >
      <div
        className={cn(
          "w-full max-w-md rounded-[30px] border border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(255,255,255,0.85)_4%)] p-8 text-[var(--text)] shadow-[0_26px_50px_-28px_rgb(var(--shadow-color)/55%)] backdrop-blur-xl",
        )}
      >
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
          {description && <p className="text-sm text-[var(--muted)]">{description}</p>}
        </div>
        {footer ? (
          <div className="mt-6">{footer}</div>
        ) : (
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirm} loading={busy}>
              {confirmLabel}
            </Button>
          </div>
        )}
      </div>
    </div>,
    portalTarget
  );
}
