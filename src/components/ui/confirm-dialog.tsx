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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className={cn("w-full max-w-md rounded-xl bg-white p-6 shadow-xl")}>
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
