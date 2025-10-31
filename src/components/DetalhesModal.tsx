"use client";

import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import type { EnrichedWorkOrder } from "@/services/firestore";

interface DetalhesModalProps {
  open: boolean;
  order: EnrichedWorkOrder | null;
  onClose: () => void;
  onConclude?: (orderId: string) => Promise<void> | void;
  concludingId?: string | null;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Não informado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

function buildResponsaveis(order: EnrichedWorkOrder | null): string {
  if (!order) {
    return "Não informado";
  }
  if (order.ui_mantenedorNomes?.length) {
    return order.ui_mantenedorNomes.join(", ");
  }
  if (order.ui_mantenedorNome) {
    return order.ui_mantenedorNome;
  }
  if (order.mantenedoresIds?.length) {
    return order.mantenedoresIds.join(", ");
  }
  if (order.mantenedorId) {
    return order.mantenedorId;
  }
  return "Não informado";
}

export function DetalhesModal({
  open,
  order,
  onClose,
  onConclude,
  concludingId,
}: DetalhesModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    lastFocusedElement.current = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("disabled"));

    const firstFocusable = focusableElements[0];
    firstFocusable?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }

      if (event.key !== "Tab" || focusableElements.length === 0) {
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      lastFocusedElement.current?.focus();
    };
  }, [open, onClose]);

  const osNumero = useMemo(
    () => (order ? order.ui_osNumero ?? order.osNumero ?? order.id : ""),
    [order],
  );

  if (!open || !order) {
    return null;
  }

  const isConcluding = concludingId === order.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        role="presentation"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ordem-detalhes-title"
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="ordem-detalhes-title" className="text-xl font-semibold text-gray-900">
              O.S. {osNumero}
            </h2>
            <p className="text-sm text-gray-600">{order.descricao ?? "Sem descrição"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-transparent px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Fechar
          </button>
        </div>

        <div className="mt-6 space-y-3 text-sm text-gray-700">
          <p>
            <span className="font-semibold">Responsáveis:</span> {buildResponsaveis(order)}
          </p>
          <p>
            <span className="font-semibold">Severidade:</span> {order.severidade ?? "Não informada"}
          </p>
          <p>
            <span className="font-semibold">Programada para:</span> {formatDate(order.dataProgramada)}
          </p>
          <p>
            <span className="font-semibold">Concluída em:</span> {formatDate(order.concluidaEm)}
          </p>
        </div>

        {order.status !== "completed" && onConclude ? (
          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onConclude(order.id)}
              disabled={isConcluding}
              className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-400"
            >
              {isConcluding ? "Concluindo..." : "✅ Concluir Manutenção"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
