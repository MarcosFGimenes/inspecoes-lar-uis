"use client";

import type { EnrichedWorkOrder } from "@/services/firestore";

interface OrdemItemProps {
  order: EnrichedWorkOrder;
  onViewDetails: (order: EnrichedWorkOrder) => void;
}

function getResponsaveis(order: EnrichedWorkOrder): string {
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

export function OrdemItem({ order, onViewDetails }: OrdemItemProps) {
  const osNumero = order.ui_osNumero ?? order.osNumero ?? order.id;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-gray-900">O.S. {osNumero}</h3>
        <p className="text-sm text-gray-700">{order.descricao ?? "Sem descrição"}</p>
      </div>
      <div className="text-xs text-gray-600">
        <p>
          <span className="font-semibold">Responsáveis:</span> {getResponsaveis(order)}
        </p>
        {order.severidade ? (
          <p>
            <span className="font-semibold">Severidade:</span> {order.severidade}
          </p>
        ) : null}
        {order.status === "scheduled" && order.dataProgramada ? (
          <p>
            <span className="font-semibold">Agendada para:</span> {new Date(order.dataProgramada).toLocaleString("pt-BR")}
          </p>
        ) : null}
        {order.status === "completed" && order.concluidaEm ? (
          <p>
            <span className="font-semibold">Concluída em:</span> {new Date(order.concluidaEm).toLocaleString("pt-BR")}
          </p>
        ) : null}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => onViewDetails(order)}
          className="rounded-md border border-blue-600 px-3 py-1 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
        >
          Ver detalhes
        </button>
      </div>
    </div>
  );
}
