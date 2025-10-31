"use client";

import { useCallback, useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

import { firebaseDb } from "@/lib/firebaseClient";
import type { EnrichedWorkOrder } from "@/services/firestore";

interface UseWorkOrdersOptions {
  initialScheduled: EnrichedWorkOrder[];
  initialCompleted: EnrichedWorkOrder[];
}

function sortCompleted(orders: EnrichedWorkOrder[]): EnrichedWorkOrder[] {
  return [...orders].sort((a, b) => {
    const dateA = a.concluidaEm ? new Date(a.concluidaEm).getTime() : 0;
    const dateB = b.concluidaEm ? new Date(b.concluidaEm).getTime() : 0;
    return dateB - dateA;
  });
}

export function useWorkOrders({
  initialScheduled,
  initialCompleted,
}: UseWorkOrdersOptions) {
  const [scheduled, setScheduled] = useState<EnrichedWorkOrder[]>(initialScheduled);
  const [completed, setCompleted] = useState<EnrichedWorkOrder[]>(() => sortCompleted(initialCompleted));
  const [concludingId, setConcludingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scheduledMap = useMemo(() => new Map(scheduled.map((order) => [order.id, order])), [scheduled]);

  const concludeWorkOrder = useCallback(
    async (orderId: string) => {
      const currentOrder = scheduledMap.get(orderId);

      if (!currentOrder) {
        setError("Ordem de serviço não encontrada.");
        return;
      }

      setConcludingId(orderId);
      setError(null);

      try {
        const docRef = doc(firebaseDb, "corrective_workOrders", orderId);
        await updateDoc(docRef, {
          status: "completed",
          concluidaEm: serverTimestamp(),
        });

        const concludedAt = new Date().toISOString();
        const updatedOrder: EnrichedWorkOrder = {
          ...currentOrder,
          status: "completed",
          concluidaEm: concludedAt,
        };

        setScheduled((previous) => previous.filter((order) => order.id !== orderId));
        setCompleted((previous) => sortCompleted([updatedOrder, ...previous]));
      } catch (err) {
        console.error("Erro ao concluir ordem de serviço", err);
        setError("Não foi possível concluir a manutenção. Tente novamente.");
        throw err;
      } finally {
        setConcludingId(null);
      }
    },
    [scheduledMap],
  );

  return {
    scheduled,
    completed,
    concludeWorkOrder,
    concludingId,
    error,
  };
}
