import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { templateSchema } from "@/lib/templates-schema";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const snapshot = await adminDb
    .collection("templates")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let data;
  try {
    data = templateSchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.issues?.[0]?.message || e?.message || "INVALID_PAYLOAD" },
      { status: 422 }
    );
  }

  const now = new Date().toISOString();
  const itens = data.itens.map((item, index) => ({
    ...item,
    id: item.id ?? randomUUID(),
    ordem: index + 1,
    createdAt: item.createdAt ?? now,
  }));

  const docRef = adminDb.collection("templates").doc();
  await docRef.set({
    nome: data.nome,
    imagemUrl: data.imagemUrl ?? null,
    itens,
    createdAt: now,
  });

  return NextResponse.json({
    id: docRef.id,
    nome: data.nome,
    imagemUrl: data.imagemUrl ?? null,
    itens,
    createdAt: now,
  });
}
