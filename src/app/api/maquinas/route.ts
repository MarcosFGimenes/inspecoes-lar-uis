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

type MachineRecord = Record<string, unknown> & {
  id: string;
  tag?: unknown;
  nome?: unknown;
};

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
    const query = adminDb.collection("maquinas").orderBy("createdAt", "desc").limit(100);

    const snapshot = await query.get();
    let records: MachineRecord[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MachineRecord[];

    if (q) {
      records = records.filter(item => {
        const tag = typeof item.tag === "string" ? item.tag.toLowerCase() : "";
        const nome = typeof item.nome === "string" ? item.nome.toLowerCase() : "";
        return tag.includes(q) || nome.includes(q);
      });
    }

    return NextResponse.json(records);
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
    parsed = machineSchema.parse(body);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INVALID_PAYLOAD") },
      { status: 422 }
    );
  }

  try {
    const existing = await adminDb
      .collection("maquinas")
      .where("tag", "==", parsed.tag)
      .limit(1)
      .get();
    if (!existing.empty) {
      return NextResponse.json({ error: "TAG_DUPLICATE" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const docRef = await adminDb.collection("maquinas").add({
      ...parsed,
      fotoUrl: parsed.fotoUrl ?? null,
      createdAt: now,
    });

    return NextResponse.json({ id: docRef.id, ...parsed, createdAt: now });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}

