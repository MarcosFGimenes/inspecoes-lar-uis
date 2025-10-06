import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function buildDraftPayload(doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) {
  const data = doc.data() ?? {};
  const total = safeNumber(data.totalItens);
  const answered = Math.min(safeNumber(data.answeredItens), total > 0 ? total : Number.MAX_SAFE_INTEGER);
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((answered / total) * 100))) : 0;

  return {
    id: doc.id,
    machineId: safeString(data.machineId),
    machineTag: safeString(data.machineTag),
    machineNome: safeString(data.machineNome),
    machineUnidade: safeString(data.machineUnidade),
    machineSetor: safeString(data.machineSetor),
    templateId: safeString(data.templateId),
    templateNome: safeString(data.templateNome),
    answeredItens: answered,
    totalItens: total,
    progressPercent: percent,
    updatedAt: safeString(data.updatedAt),
    createdAt: safeString(data.createdAt),
  };
}

export async function GET() {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  try {
    const snapshot = await adminDb
      .collection("inspectionDrafts")
      .where("maintainerId", "==", auth.store.id!)
      .orderBy("updatedAt", "desc")
      .get();

    const drafts = snapshot.docs.map(buildDraftPayload);
    return NextResponse.json(drafts);
  } catch (err: unknown) {
    const message = err instanceof Error && err.message ? err.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
