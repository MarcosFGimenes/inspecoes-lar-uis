import { FieldPath, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";

export type WorkOrderStatus = "scheduled" | "completed";

export interface WorkOrder {
  id: string;
  status: WorkOrderStatus;
  descricao?: string;
  severidade?: string;
  dataProgramada?: string | null;
  osId?: string;
  osNumero?: string;
  mantenedorId?: string;
  mantenedoresIds?: string[];
  concluidaEm?: string | null;
}

export interface EnrichedWorkOrder extends WorkOrder {
  ui_osNumero?: string;
  ui_mantenedorNome?: string;
  ui_mantenedorNomes?: string[];
}

export interface Issue {
  id: string;
  osNumero?: string;
}

export interface Mantenedor {
  id: string;
  nome?: string;
}

const CHUNK_SIZE = 10;

function chunkArray<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    chunks.push(items.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

function normalizeTimestamp(value?: Timestamp | null): string | null {
  if (!value) {
    return null;
  }
  return value.toDate().toISOString();
}

export async function batchGetIssuesNumbers(osIds: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const uniqueIds = Array.from(new Set(osIds)).filter(Boolean);

  if (!uniqueIds.length) {
    return results;
  }

  const chunks = chunkArray(uniqueIds);

  for (const chunk of chunks) {
    const snapshot = await adminDb
      .collection("issues")
      .where(FieldPath.documentId(), "in", chunk)
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data() as { osNumero?: string } | undefined;
      if (data?.osNumero) {
        results.set(doc.id, String(data.osNumero));
      }
    });
  }

  return results;
}

export async function batchGetMantenedores(ids: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);

  if (!uniqueIds.length) {
    return results;
  }

  const chunks = chunkArray(uniqueIds);

  for (const chunk of chunks) {
    const snapshot = await adminDb
      .collection("mantenedores")
      .where(FieldPath.documentId(), "in", chunk)
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data() as { nome?: string } | undefined;
      if (data?.nome) {
        results.set(doc.id, data.nome);
      }
    });
  }

  return results;
}

export async function fetchWorkOrdersByStatusSSR(
  status: WorkOrderStatus,
): Promise<EnrichedWorkOrder[]> {
  const snapshot = await adminDb
    .collection("corrective_workOrders")
    .where("status", "==", status)
    .get();

  const workOrders: EnrichedWorkOrder[] = snapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      status: data.status as WorkOrderStatus,
      descricao: data.descricao,
      severidade: data.severidade,
      dataProgramada: normalizeTimestamp(data.dataProgramada ?? null),
      osId: data.osId,
      osNumero: data.osNumero,
      mantenedorId: data.mantenedorId,
      mantenedoresIds: Array.isArray(data.mantenedoresIds)
        ? (data.mantenedoresIds as string[])
        : undefined,
      concluidaEm: normalizeTimestamp(data.concluidaEm ?? null),
    };
  });

  const osIds = workOrders
    .map((order) => order.osNumero ? undefined : order.osId)
    .filter((value): value is string => Boolean(value));

  const mantenedorIds: string[] = [];
  workOrders.forEach((order) => {
    if (order.mantenedorId) {
      mantenedorIds.push(order.mantenedorId);
    }
    if (order.mantenedoresIds?.length) {
      mantenedorIds.push(...order.mantenedoresIds);
    }
  });

  const [issuesMap, mantenedoresMap] = await Promise.all([
    batchGetIssuesNumbers(osIds),
    batchGetMantenedores(mantenedorIds),
  ]);

  const enrichedOrders = workOrders.map((order) => {
    const enriched: EnrichedWorkOrder = { ...order };

    if (!enriched.ui_osNumero) {
      const numeroFromIssue = order.osId ? issuesMap.get(order.osId) : undefined;
      enriched.ui_osNumero = order.osNumero ?? numeroFromIssue;
    }

    if (order.mantenedorId) {
      enriched.ui_mantenedorNome = mantenedoresMap.get(order.mantenedorId);
    }

    if (order.mantenedoresIds?.length) {
      enriched.ui_mantenedorNomes = order.mantenedoresIds
        .map((id) => mantenedoresMap.get(id) ?? id)
        .filter(Boolean);
    }

    if (!enriched.ui_mantenedorNomes && order.mantenedorId && enriched.ui_mantenedorNome) {
      enriched.ui_mantenedorNomes = [enriched.ui_mantenedorNome];
    }

    return enriched;
  });

  const sorted = [...enrichedOrders];

  if (status === "completed") {
    sorted.sort((a, b) => {
      const dateA = a.concluidaEm ? new Date(a.concluidaEm).getTime() : 0;
      const dateB = b.concluidaEm ? new Date(b.concluidaEm).getTime() : 0;
      return dateB - dateA;
    });
  } else {
    sorted.sort((a, b) => {
      const dateA = a.dataProgramada ? new Date(a.dataProgramada).getTime() : Number.POSITIVE_INFINITY;
      const dateB = b.dataProgramada ? new Date(b.dataProgramada).getTime() : Number.POSITIVE_INFINITY;
      return dateA - dateB;
    });
  }

  return sorted;
}
