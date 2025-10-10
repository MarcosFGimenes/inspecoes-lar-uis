import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

const UpdateMaintainerSchema = z.object({
  matricula: z.string().min(1),
  nome: z.string().min(2),
  setor: z.string().min(2),
  lac: z.string().regex(/^\d{3}$/),
  ativo: z.boolean(),
  password: z.string().min(8).optional(),
});

function serializeMaintainer(doc: FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() ?? {};
  const { passwordHash, ...rest } = data as Record<string, unknown> & {
    passwordHash?: unknown;
  };
  void passwordHash;
  return {
    id: doc.id,
    ...rest,
  };
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = (await context.params) ?? {};
  const idValue = params.id;
  const id = Array.isArray(idValue) ? idValue[0] ?? null : idValue ?? null;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const doc = await adminDb.collection("mantenedores").doc(id).get();
  if (!doc.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(serializeMaintainer(doc));
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = (await context.params) ?? {};
  const idValue = params.id;
  const id = Array.isArray(idValue) ? idValue[0] ?? null : idValue ?? null;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const maintRef = adminDb.collection("mantenedores").doc(id);
  const maintSnap = await maintRef.get();
  if (!maintSnap.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let data: z.infer<typeof UpdateMaintainerSchema>;
  try {
    data = UpdateMaintainerSchema.parse(await req.json());
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "INVALID_PAYLOAD" }, { status: 422 });
    }
    const message = error instanceof Error && error.message ? error.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const normalizedMatricula = data.matricula.trim();

  if (!normalizedMatricula) {
    return NextResponse.json({ error: "Matrícula obrigatória" }, { status: 422 });
  }

  const duplicateSnap = await adminDb
    .collection("mantenedores")
    .where("matricula", "==", normalizedMatricula)
    .limit(1)
    .get();

  if (!duplicateSnap.empty && duplicateSnap.docs[0]?.id !== id) {
    return NextResponse.json({ error: "Matrícula já existe" }, { status: 409 });
  }

  const updatePayload: Record<string, unknown> = {
    matricula: normalizedMatricula,
    nome: data.nome.trim(),
    setor: data.setor.trim(),
    lac: data.lac.trim(),
    ativo: data.ativo,
    updatedAt: new Date().toISOString(),
  };

  const trimmedPassword = data.password?.trim();
  if (trimmedPassword) {
    updatePayload.passwordHash = await bcrypt.hash(trimmedPassword, 10);
  }

  await maintRef.update(updatePayload);

  const updatedSnap = await maintRef.get();
  return NextResponse.json(serializeMaintainer(updatedSnap));
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = (await context.params) ?? {};
  const idValue = params.id;
  const id = Array.isArray(idValue) ? idValue[0] ?? null : idValue ?? null;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const maintRef = adminDb.collection("mantenedores").doc(id);
  const maintSnap = await maintRef.get();
  if (!maintSnap.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await maintRef.delete();

  return NextResponse.json({ ok: true });
}
