import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { machineSchema } from "@/lib/machines-schema";
import { listAllMachines } from "@/lib/db/machines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
    const records = await listAllMachines(100);

    const filtered = q
      ? records.filter(item => {
          const tag = typeof item.tag === "string" ? item.tag.toLowerCase() : "";
          const nome = typeof item.nome === "string" ? item.nome.toLowerCase() : "";
          return tag.includes(q) || nome.includes(q);
        })
      : records;

    return NextResponse.json(filtered);
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
      .collection("machines")
      .where("tag", "==", parsed.tag)
      .limit(1)
      .get();
    if (!existing.empty) {
      return NextResponse.json({ error: "TAG_DUPLICATE" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const docRef = await adminDb.collection("machines").add({
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

