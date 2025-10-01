import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { machineSchema } from "@/lib/machines-schema";

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
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const doc = await adminDb.collection("maquinas").doc(params.id).get();
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

  const docRef = adminDb.collection("maquinas").doc(params.id);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let parsed;
  try {
    const body = await req.json();
    parsed = machineSchema.parse(body);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INVALID_PAYLOAD") },
      { status: 422 }
    );
  }

  try {
    if (parsed.tag !== snapshot.data()?.tag) {
      const duplicate = await adminDb
        .collection("maquinas")
        .where("tag", "==", parsed.tag)
        .limit(1)
        .get();
      if (!duplicate.empty) {
        return NextResponse.json({ error: "TAG_DUPLICATE" }, { status: 409 });
      }
    }

    await docRef.update({
      ...parsed,
      fotoUrl: parsed.fotoUrl ?? null,
    });

    return NextResponse.json({
      id: params.id,
      ...parsed,
      createdAt: snapshot.data()?.createdAt ?? null,
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
    await adminDb.collection("maquinas").doc(params.id).delete();
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}
