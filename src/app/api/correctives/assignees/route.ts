import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { requireMaintOrAdmin } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MaintainerRecord {
  id: string;
  nome: string | null;
  matricula: string | null;
  area: "mechanical" | "electrical" | null;
  rawArea: string | null;
}

function normalizeArea(value: unknown): "mechanical" | "electrical" | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["mechanical", "mecanico", "mecânico", "mecanica", "mecânica"].some(term => normalized.includes(term))) {
    return "mechanical";
  }

  if (["electrical", "eletrico", "elétrico", "eletrica", "elétrica"].some(term => normalized.includes(term))) {
    return "electrical";
  }

  return null;
}

function extractRecord(docId: string, data: FirebaseFirestore.DocumentData): MaintainerRecord | null {
  const nome = typeof data.nome === "string" ? data.nome : null;
  const matricula = typeof data.matricula === "string" ? data.matricula : null;

  const areaCandidates: Array<string | null> = [];
  if (typeof data.area === "string") {
    areaCandidates.push(data.area);
  }
  if (typeof data.setor === "string") {
    areaCandidates.push(data.setor);
  }
  if (typeof data.principalArea === "string") {
    areaCandidates.push(data.principalArea);
  }
  if (Array.isArray(data.areas)) {
    data.areas.forEach(entry => {
      if (typeof entry === "string") {
        areaCandidates.push(entry);
      }
    });
  }

  let normalizedArea: MaintainerRecord["area"] = null;
  let rawArea: string | null = null;
  for (const candidate of areaCandidates) {
    if (!candidate) continue;
    const mapped = normalizeArea(candidate);
    if (mapped) {
      normalizedArea = mapped;
      rawArea = candidate;
      break;
    }
  }

  return {
    id: docId,
    nome,
    matricula,
    area: normalizedArea,
    rawArea,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireMaintOrAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const areaParam = req.nextUrl.searchParams.get("area");
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(Number.parseInt(limitParam, 10) || 0, 500)) : 200;

  try {
    const collectionRef = adminDb.collection("mantenedores");
    const snapshot = await collectionRef.limit(limit).get();

    const records: MaintainerRecord[] = snapshot.docs
      .map(doc => extractRecord(doc.id, doc.data() ?? {}))
      .filter((item): item is MaintainerRecord => Boolean(item));

    let filtered = records;
    const normalizedArea = normalizeArea(areaParam);
    if (normalizedArea) {
      filtered = records.filter(item => !item.area || item.area === normalizedArea);
    }

    const items = filtered.map(item => ({
      id: item.id,
      nome: item.nome,
      matricula: item.matricula,
      area: item.area,
      rawArea: item.rawArea,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
