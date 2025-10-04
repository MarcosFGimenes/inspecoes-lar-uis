import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";
import { getMachinesByIdsChunked } from "@/lib/db/machines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const docs = await getMachinesByIdsChunked(machinesIds);

    const results = docs
      .filter(doc => doc.ativo !== false)
      .map(doc => ({
        id: doc.id,
        tag: typeof doc.tag === "string" ? doc.tag : null,
        nome: typeof doc.nome === "string" ? doc.nome : null,
        setor: typeof doc.setor === "string" ? doc.setor : null,
        unidade: typeof doc.unidade === "string" ? doc.unidade : null,
        fotoUrl: typeof doc.fotoUrl === "string" ? doc.fotoUrl : null,
      }));

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
