import { NextResponse } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHUNK_SIZE = 10;

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function GET() {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  try {
    const maintDoc = await adminDb.collection("mantenedores").doc(auth.store.id!).get();
    if (!maintDoc.exists) {
      return NextResponse.json({ error: "MAINTAINER_NOT_FOUND" }, { status: 403 });
    }

    const maintData = maintDoc.data() ?? {};
    const machinesIds = Array.isArray(maintData.machines)
      ? (maintData.machines as string[]).filter(Boolean)
      : [];

    if (machinesIds.length === 0) {
      return NextResponse.json([]);
    }

    const chunks = chunkArray(machinesIds, CHUNK_SIZE);
    const results: Array<{
      id: string;
      tag: string | null;
      nome: string | null;
      setor: string | null;
      unidade: string | null;
      fotoUrl: string | null;
    }> = [];

    for (const chunk of chunks) {
      const snap = await adminDb
        .collection("maquinas")
        .where(FieldPath.documentId(), "in", chunk)
        .get();

      snap.docs.forEach(doc => {
        const data = doc.data() ?? {};
        if (data.ativo === false) {
          return;
        }
        results.push({
          id: doc.id,
          tag: data.tag ?? null,
          nome: data.nome ?? null,
          setor: data.setor ?? null,
          unidade: data.unidade ?? null,
          fotoUrl: data.fotoUrl ?? null,
        });
      });
    }

    results.sort((a, b) => {
      const nameA = (a.nome ?? "").toLowerCase();
      const nameB = (b.nome ?? "").toLowerCase();
      if (nameA && nameB) return nameA.localeCompare(nameB);
      return (a.tag ?? "").localeCompare(b.tag ?? "");
    });

    return NextResponse.json(results);
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
