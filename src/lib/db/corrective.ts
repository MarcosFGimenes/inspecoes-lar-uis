import { adminDb } from "@/lib/firebase-admin";
import {
  syncCorrectiveWorkOrderView,
  syncOpenNonConformityView,
  type CorrectiveNonConformityRecord,
  type CorrectiveWorkOrderRecord,
} from "@/lib/db/corrective-views";

const correctiveNonConformities = adminDb.collection("corrective_nonConformities");
const correctiveWorkOrders = adminDb.collection("corrective_workOrders");

export async function saveCorrectiveNonConformity(
  ncId: string,
  record: CorrectiveNonConformityRecord,
  options: { merge?: boolean } = {}
) {
  const docRef = correctiveNonConformities.doc(ncId);
  await docRef.set(record, { merge: options.merge ?? true });
  await syncOpenNonConformityView(ncId, record);
  return docRef;
}

export async function saveCorrectiveWorkOrder(
  osId: string,
  record: CorrectiveWorkOrderRecord,
  options: { merge?: boolean } = {}
) {
  const docRef = correctiveWorkOrders.doc(osId);
  await docRef.set(record, { merge: options.merge ?? true });
  await syncCorrectiveWorkOrderView(osId, record);
  return docRef;
}

export async function deleteCorrectiveNonConformity(ncId: string) {
  await correctiveNonConformities.doc(ncId).delete().catch(() => undefined);
  await syncOpenNonConformityView(ncId, { status: "closed" });
}

export async function deleteCorrectiveWorkOrder(osId: string) {
  await correctiveWorkOrders.doc(osId).delete().catch(() => undefined);
  await syncCorrectiveWorkOrderView(osId, { type: "" });
}
