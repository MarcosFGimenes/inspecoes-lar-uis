import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";
import { getOrSetServerCache } from "@/lib/server-memory-cache";

export const runtime = "nodejs";
export const revalidate = 60;

type MaintInspectionSummary = {
  id: string;
  machineTag: string | null;
  machineNome: string | null;
  machineSetor: string | null;
  machineUnidade: string | null;
  templateNome: string | null;
  finalizadaEm: string | null;
  createdAt: string | null;
  osNumero: string | null;
  qtdNc: number;
};

function clampLimit(value: number | null | undefined, fallback: number, max = 50) {
  if (!value || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.max(Math.floor(value), 1), max);
}

function parseDate(input: string | null, endOfDay = false) {
  if (!input) return null;
  const normalized = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date.toISOString();
}

function deriveRange(params: URLSearchParams) {
  const singleDate = params.get("date");
  if (singleDate) {
    const start = parseDate(singleDate, false);
    const end = parseDate(singleDate, true);
    return { start, end };
  }
  const start = parseDate(params.get("startDate"), false);
  const end = parseDate(params.get("endDate"), true);
  return { start, end };
}

function mapInspectionSummary(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): MaintInspectionSummary {
  const data = doc.data() ?? {};
  const machine = (data.machine ?? {}) as Record<string, unknown>;
  const template = (data.template ?? {}) as Record<string, unknown>;
  const finalizadaEm = typeof data.finalizadaEm === "string" ? data.finalizadaEm : null;
  const createdAt = typeof data.createdAt === "string" ? data.createdAt : null;
  const osNumero = typeof data.osNumero === "string" ? data.osNumero : null;
  const qtdNc = typeof data.qtdNC === "number" && Number.isFinite(data.qtdNC) ? data.qtdNC : 0;

  return {
    id: doc.id,
    machineTag: typeof machine.tag === "string" ? machine.tag : null,
    machineNome: typeof machine.nome === "string" ? machine.nome : null,
    machineSetor: typeof machine.setor === "string" ? machine.setor : null,
    machineUnidade: typeof machine.unidade === "string" ? machine.unidade : null,
    templateNome: typeof template.nome === "string" ? template.nome : null,
    finalizadaEm,
    createdAt,
    osNumero,
    qtdNc,
  } satisfies MaintInspectionSummary;
}

export async function GET(req: NextRequest) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const params = url.searchParams;
    const limitValue = clampLimit(Number(params.get("limit")), params.has("date") ? 15 : 25, 100);
    const cursorId = params.get("cursor");
    const range = deriveRange(params);
    const maintId = auth.store.id!;

    const cacheKey = [
      "me:inspecoes",
      maintId,
      String(limitValue),
      cursorId ?? "",
      range.start ?? "",
      range.end ?? "",
    ].join(":");

    const payload = await getOrSetServerCache(cacheKey, 30_000, async () => {
      let queryRef = adminDb
        .collection("inspecoes")
        .where("maintainer.maintId", "==", maintId)
        .orderBy("finalizadaEm", "desc");

      if (range.start) {
        queryRef = queryRef.where("finalizadaEm", ">=", range.start);
      }
      if (range.end) {
        queryRef = queryRef.where("finalizadaEm", "<=", range.end);
      }

      if (cursorId) {
        const cursorSnap = await adminDb.collection("inspecoes").doc(cursorId).get();
        if (cursorSnap.exists) {
          queryRef = queryRef.startAfter(cursorSnap);
        }
      }

      const snapshot = await queryRef.limit(limitValue).get();
      const items = snapshot.docs.map(mapInspectionSummary);
      const hasMore = snapshot.size === limitValue;
      const nextCursor = hasMore ? snapshot.docs[snapshot.docs.length - 1]?.id ?? null : null;

      return { items, nextCursor };
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
