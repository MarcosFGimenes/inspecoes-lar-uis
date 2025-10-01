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

interface Params {
  params: {
    id: string;
  };
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const authorized = await requireAdminFromRequest(req);
    if (!authorized) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const doc = await adminDb.collection("templates").doc(params.id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ id: doc.id, ...doc.data() });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const docRef = adminDb.collection("templates").doc(params.id);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
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

    await docRef.update({
      nome: parsed.nome,
      imagemUrl: parsed.imagemUrl ?? null,
      itens,
    });

    return NextResponse.json({
      id: params.id,
      nome: parsed.nome,
      imagemUrl: parsed.imagemUrl ?? null,
      itens,
      createdAt: snapshot.data()?.createdAt,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    await adminDb.collection("templates").doc(params.id).delete();
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}
