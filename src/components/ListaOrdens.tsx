"use client";

import { useCallback, useMemo, useState } from "react";

import { useWorkOrders } from "@/hooks/useWorkOrders";
import type { EnrichedWorkOrder } from "@/services/firestore";

import { DetalhesModal } from "./DetalhesModal";
import { OrdemItem } from "./OrdemItem";
import { Tabs } from "./Tabs";

const TAB_ITEMS = [
  { key: "scheduled", label: "Agendadas" },
  { key: "completed", label: "Concluídas" },
] as const;

type TabKey = (typeof TAB_ITEMS)[number]["key"];

interface ListaOrdensProps {
  scheduled: EnrichedWorkOrder[];
  completed: EnrichedWorkOrder[];
}

export function ListaOrdens({ scheduled, completed }: ListaOrdensProps) {
  const { scheduled: scheduledOrders, completed: completedOrders, concludeWorkOrder, concludingId, error } =
    useWorkOrders({
      initialScheduled: scheduled,
      initialCompleted: completed,
    });

  const [activeTab, setActiveTab] = useState<TabKey>("scheduled");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const ordersByTab = useMemo(
    () => ({
      scheduled: scheduledOrders,
      completed: completedOrders,
    }),
    [scheduledOrders, completedOrders],
  );

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) {
      return null;
    }

    return ordersByTab[activeTab].find((order) => order.id === selectedOrderId) ?? null;
  }, [activeTab, ordersByTab, selectedOrderId]);

  const handleViewDetails = useCallback((order: EnrichedWorkOrder) => {
    setSelectedOrderId(order.id);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedOrderId(null);
  }, []);

  const handleConclude = useCallback(
    async (orderId: string) => {
      try {
        await concludeWorkOrder(orderId);
        setActiveTab("completed");
        setSelectedOrderId(null);
      } catch (err) {
        console.error("Falha ao concluir ordem de serviço", err);
        // TODO: Integrar com sistema de toast global do projeto.
      }
    },
    [concludeWorkOrder],
  );

  const currentOrders = ordersByTab[activeTab];

  return (
    <div className="space-y-6">
      <Tabs items={TAB_ITEMS} activeKey={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {currentOrders.length === 0 ? (
        <p className="text-sm text-gray-600">Nenhuma ordem de serviço encontrada.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {currentOrders.map((order) => (
            <OrdemItem key={order.id} order={order} onViewDetails={handleViewDetails} />
          ))}
        </div>
      )}

      <DetalhesModal
        open={Boolean(selectedOrder)}
        order={selectedOrder}
        onClose={handleCloseModal}
        onConclude={activeTab === "scheduled" ? handleConclude : undefined}
        concludingId={concludingId}
      />
    </div>
  );
}
