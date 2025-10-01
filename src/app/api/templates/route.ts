import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { templateSchema } from "@/lib/templates-schema";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function GET(req: NextRequest) {
  try {
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
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let parsed;
  try {
    const body = await req.json();
    parsed = templateSchema.parse(body);
  } catch (err: unknown) {
    const message = extractMessage(err, "INVALID_PAYLOAD");
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    const now = new Date().toISOString();
    const itens = parsed.itens.map((item, index) => ({
      ...item,
      id: item.id ?? randomUUID(),
      ordem: index + 1,
      createdAt: item.createdAt ?? now,
    }));

    const docRef = adminDb.collection("templates").doc();
    await docRef.set({
      nome: parsed.nome,
      imagemUrl: parsed.imagemUrl ?? null,
      itens,
      createdAt: now,
    });

    return NextResponse.json({
      id: docRef.id,
      nome: parsed.nome,
      imagemUrl: parsed.imagemUrl ?? null,
      itens,
      createdAt: now,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}
