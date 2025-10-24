import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";

import { mapDoc, normalizeIsoDate, updateSchema } from "../route";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD", details: parsed.error.issues }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };

  if (parsed.data.status) {
    updates.status = parsed.data.status;
  }

  if ("prazo" in parsed.data) {
    const prazoIso = normalizeIsoDate(parsed.data.prazo ?? null);
    const prazoDate = prazoIso ? new Date(prazoIso) : null;
    updates.prazoIso = prazoIso;
    updates.prazoTimestamp = prazoDate ? Timestamp.fromDate(prazoDate) : null;
  }

  if (typeof parsed.data.detalhes === "string") {
    updates.detalhes = parsed.data.detalhes?.trim() ? parsed.data.detalhes.trim() : null;
  }

  const docRef = adminDb.collection("programacoes_manutencao").doc(id);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await docRef.set(updates, { merge: true });
  const refreshed = await docRef.get();
  return NextResponse.json(mapDoc(refreshed));
}
