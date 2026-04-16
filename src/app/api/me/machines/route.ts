import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";
import { getMachinesByIdsChunked } from "@/lib/db/machines";
import { getOrSetServerCache } from "@/lib/server-memory-cache";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  try {
    const maintId = auth.store.id!;
    const cacheKey = `me:machines:${maintId}`;
    const results = await getOrSetServerCache(cacheKey, 60_000, async () => {
      const maintDoc = await adminDb.collection("mantenedores").doc(maintId).get();
      if (!maintDoc.exists) {
        throw new Error("MAINTAINER_NOT_FOUND");
      }

      const maintData = maintDoc.data() ?? {};
      const machinesIds = Array.isArray(maintData.machines)
        ? (maintData.machines as string[]).filter(Boolean)
        : [];

      if (machinesIds.length === 0) {
        return [];
      }

      const docs = await getMachinesByIdsChunked(machinesIds);

      const mapped = docs
        .filter(doc => doc.ativo !== false)
        .map(doc => ({
          id: doc.id,
          tag: typeof doc.tag === "string" ? doc.tag : null,
          nome: typeof doc.nome === "string" ? doc.nome : null,
          setor: typeof doc.setor === "string" ? doc.setor : null,
          unidade: typeof doc.unidade === "string" ? doc.unidade : null,
          fotoUrl: typeof doc.fotoUrl === "string" ? doc.fotoUrl : null,
        }));

      mapped.sort((a, b) => {
        const nameA = (a.nome ?? "").toLowerCase();
        const nameB = (b.nome ?? "").toLowerCase();
        if (nameA && nameB) return nameA.localeCompare(nameB);
        return (a.tag ?? "").localeCompare(b.tag ?? "");
      });

      return mapped;
    });

    return NextResponse.json(results, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    const status = message === "MAINTAINER_NOT_FOUND" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
