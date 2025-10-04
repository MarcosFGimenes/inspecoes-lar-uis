import { FieldPath } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";

const PRIMARY_COLLECTION = "machines";
const LEGACY_COLLECTIONS = ["maquinas"] as const;

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

async function fetchMachinesByIdsFromCollection(
  collectionName: string,
  ids: string[],
): Promise<MachineDoc[]> {
  if (ids.length === 0) return [];

  const chunks = chunkIds(ids);
  const records: MachineDoc[] = [];

  for (const chunk of chunks) {
    const snapshot = await adminDb
      .collection(collectionName)
      .where(FieldPath.documentId(), "in", chunk)
      .get();

    snapshot.forEach(docSnap => {
      records.push(mapMachineDoc(docSnap));
    });
  }

  return records;
}

function mergeById(primary: MachineDoc[], secondary: MachineDoc[]): MachineDoc[] {
  const map = new Map<string, MachineDoc>();

  primary.forEach(record => {
    map.set(record.id, record);
  });

  secondary.forEach(record => {
    if (!map.has(record.id)) {
      map.set(record.id, record);
    }
  });

  return Array.from(map.values());
}

export async function getMachinesByIdsChunked(ids: string[]): Promise<MachineDoc[]> {
  if (!ids?.length) return [];

  const primaryRecords = await fetchMachinesByIdsFromCollection(PRIMARY_COLLECTION, ids);
  const foundIds = new Set(primaryRecords.map(record => record.id));

  const missingIds = ids.filter(id => !foundIds.has(id));
  let fallbackRecords: MachineDoc[] = [];

  if (missingIds.length > 0) {
    for (const legacyCollection of LEGACY_COLLECTIONS) {
      const legacyRecords = await fetchMachinesByIdsFromCollection(legacyCollection, missingIds);
      if (legacyRecords.length > 0) {
        fallbackRecords = mergeById(fallbackRecords, legacyRecords);
      }
    }

    if (fallbackRecords.length > 0) {
      console.debug(
        "[machines-repo] fetched legacy machines",
        fallbackRecords.map(record => record.id),
      );
    }
  }

  const combined = mergeById(primaryRecords, fallbackRecords);
  const combinedMap = new Map(combined.map(record => [record.id, record] as const));

  const ordered: MachineDoc[] = [];
  const seen = new Set<string>();

  ids.forEach(id => {
    if (seen.has(id)) return;
    const record = combinedMap.get(id);
    if (record) {
      ordered.push(record);
      seen.add(id);
    }
  });

  combined.forEach(record => {
    if (!seen.has(record.id)) {
      ordered.push(record);
      seen.add(record.id);
    }
  });

  return ordered;
}

async function findMachineByTagInCollection(
  collectionName: string,
  tag: string,
): Promise<MachineDoc | null> {
  const snapshot = await adminDb
    .collection(collectionName)
    .where("tag", "==", tag)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return mapMachineDoc(snapshot.docs[0]!);
}

export async function findMachineByTag(tag: string): Promise<MachineDoc | null> {
  const primaryRecord = await findMachineByTagInCollection(PRIMARY_COLLECTION, tag);
  if (primaryRecord) {
    return primaryRecord;
  }

  for (const legacyCollection of LEGACY_COLLECTIONS) {
    const legacyRecord = await findMachineByTagInCollection(legacyCollection, tag);
    if (legacyRecord) {
      console.debug("[machines-repo] fetched legacy machine by tag", {
        tag,
        legacyCollection,
        id: legacyRecord.id,
      });
      return legacyRecord;
    }
  }

  return null;
}

async function listActiveMachinesFromCollection(collectionName: string): Promise<MachineDoc[]> {
  const snapshot = await adminDb
    .collection(collectionName)
    .where("ativo", "==", true)
    .get();

  const records: MachineDoc[] = [];
  snapshot.forEach(docSnap => {
    records.push(mapMachineDoc(docSnap));
  });

  return records;
}

export async function listActiveMachines(): Promise<MachineDoc[]> {
  const [primaryRecords, ...legacyRecordsList] = await Promise.all([
    listActiveMachinesFromCollection(PRIMARY_COLLECTION),
    ...LEGACY_COLLECTIONS.map(collectionName => listActiveMachinesFromCollection(collectionName)),
  ]);

  const combined = legacyRecordsList.reduce<MachineDoc[]>(
    (acc, records) => mergeById(acc, records),
    primaryRecords,
  );

  if (combined.length > primaryRecords.length) {
    const legacyIds = combined
      .filter(record => !primaryRecords.some(primary => primary.id === record.id))
      .map(record => record.id);

    if (legacyIds.length > 0) {
      console.debug("[machines-repo] merged legacy active machines", legacyIds);
    }
  }

  return combined;
}

export async function listAllMachines(limit = 100): Promise<MachineDoc[]> {
  const snapshot = await adminDb
    .collection(PRIMARY_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const records: MachineDoc[] = [];
  snapshot.forEach(docSnap => {
    records.push(mapMachineDoc(docSnap));
  });

  if (records.length < limit) {
    for (const legacyCollection of LEGACY_COLLECTIONS) {
      const legacySnapshot = await adminDb
        .collection(legacyCollection)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      legacySnapshot.forEach(docSnap => {
        const record = mapMachineDoc(docSnap);
        if (!records.some(item => item.id === record.id)) {
          records.push(record);
        }
      });
    }
  }

  return records;
}
