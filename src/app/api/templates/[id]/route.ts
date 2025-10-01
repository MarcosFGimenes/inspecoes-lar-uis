import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { templateSchema } from "@/lib/templates-schema";
import { randomUUID } from "crypto";

interface Params {
  params: {
    id: string;
  };
}

export async function GET(req: NextRequest, { params }: Params) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const doc = await adminDb.collection("templates").doc(params.id).get();
  if (!doc.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ id: doc.id, ...doc.data() });
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

  await docRef.update({
    nome: data.nome,
    imagemUrl: data.imagemUrl ?? null,
    itens,
  });

  return NextResponse.json({
    id: params.id,
    nome: data.nome,
    imagemUrl: data.imagemUrl ?? null,
    itens,
    createdAt: snapshot.data()?.createdAt,
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await adminDb.collection("templates").doc(params.id).delete();
  return NextResponse.json({ ok: true });
}
