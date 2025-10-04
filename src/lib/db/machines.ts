import { FieldPath } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";

const MACHINES_COLLECTION = "machines";

export type MachineDoc = {
  id: string;
  nome?: string | null;
  tag?: string | null;
  setor?: string | null;
  unidade?: string | null;
  localUnidade?: string | null;
  lac?: string | null;
  templateId?: string | null;
  fotoUrl?: string | null;
  ativo?: boolean | null;
  [key: string]: unknown;
};

function mapMachineDoc(docSnap: FirebaseFirestore.DocumentSnapshot): MachineDoc {
  const data = docSnap.data() ?? {};
  const record: MachineDoc = { id: docSnap.id, ...data } as MachineDoc;
  delete (record as Record<string, unknown>).id;
  record.id = docSnap.id;
  return record;
}

function chunkIds(ids: string[], size = 10): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export async function getMachinesByIdsChunked(ids: string[]): Promise<MachineDoc[]> {
  if (!ids?.length) return [];

  const chunks = chunkIds(ids);
  const results = new Map<string, MachineDoc>();

  for (const chunk of chunks) {
    const snapshot = await adminDb
      .collection(MACHINES_COLLECTION)
      .where(FieldPath.documentId(), "in", chunk)
      .get();

    snapshot.forEach(docSnap => {
      const record = mapMachineDoc(docSnap);
      results.set(record.id, record);
    });
  }

  const ordered: MachineDoc[] = [];
  const seen = new Set<string>();

  ids.forEach(id => {
    if (seen.has(id)) return;
    const record = results.get(id);
    if (record) {
      ordered.push(record);
      seen.add(id);
    }
  });

  results.forEach(record => {
    if (!seen.has(record.id)) {
      ordered.push(record);
      seen.add(record.id);
    }
  });

  return ordered;
}

export async function listActiveMachines(): Promise<MachineDoc[]> {
  const snapshot = await adminDb
    .collection(MACHINES_COLLECTION)
    .where("ativo", "==", true)
    .get();

  const records: MachineDoc[] = [];
  snapshot.forEach(docSnap => {
    records.push(mapMachineDoc(docSnap));
  });

  return records;
}

export async function listAllMachines(limit = 100): Promise<MachineDoc[]> {
  const snapshot = await adminDb
    .collection(MACHINES_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const records: MachineDoc[] = [];
  snapshot.forEach(docSnap => {
    records.push(mapMachineDoc(docSnap));
  });

  return records;
}
