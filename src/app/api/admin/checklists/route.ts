import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/guards";
import { adminDb } from "@/lib/firebase-admin";
import type { ChecklistAnswer } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function parseOffset(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function toIsoStart(dateInput: string | null) {
  if (!dateInput || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return null;
  return new Date(`${dateInput}T00:00:00.000Z`).toISOString();
}

function toIsoEnd(dateInput: string | null) {
  if (!dateInput || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return null;
  return new Date(`${dateInput}T23:59:59.999Z`).toISOString();
}

function computeNcCount(data: Record<string, unknown>): number {
  const qtdNc = data.qtdNC;
  if (typeof qtdNc === "number" && Number.isFinite(qtdNc)) {
    return qtdNc;
  }

  const answers = Array.isArray(data.answers) ? (data.answers as ChecklistAnswer[]) : [];
  if (answers.length > 0) {
    return answers.filter(answer => answer?.response?.toLowerCase() === "nc").length;
  }

  const itensRaw = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
  if (itensRaw.length === 0) return 0;
  return itensRaw.filter(item => String(item.resultado ?? item.response ?? "c").toLowerCase() === "nc").length;
}

function matchesChecklistFilters(data: Record<string, unknown>, filters: {
  machineQuery: string;
  maintainerId: string;
  templateId: string;
  hasNc: "all" | "yes" | "no";
  matriculaQuery: string;
}) {
  const machine = (data.machine ?? {}) as Record<string, unknown>;
  const maintainer = (data.maintainer ?? {}) as Record<string, unknown>;
  const template = (data.template ?? {}) as Record<string, unknown>;

  const machineId = typeof machine.machineId === "string" ? machine.machineId : typeof machine.id === "string" ? machine.id : "";
  const machineTag = typeof machine.tag === "string" ? machine.tag : "";
  const machineNome = typeof machine.nome === "string" ? machine.nome : "";
  const machineSetor = typeof machine.setor === "string" ? machine.setor : "";

  if (filters.machineQuery) {
    const haystack = [machineId, machineTag, machineNome, machineSetor].join(" ").toLowerCase();
    if (!haystack.includes(filters.machineQuery)) return false;
  }

  if (filters.maintainerId) {
    const maintainerId =
      typeof maintainer.maintId === "string"
        ? maintainer.maintId
        : typeof maintainer.id === "string"
          ? maintainer.id
          : "";
    if (maintainerId !== filters.maintainerId) return false;
  }

  if (filters.templateId) {
    const currentTemplateId = typeof template.id === "string" ? template.id : "";
    if (currentTemplateId !== filters.templateId) return false;
  }

  if (filters.matriculaQuery) {
    const matricula = typeof maintainer.matricula === "string" ? maintainer.matricula.toLowerCase() : "";
    if (!matricula.includes(filters.matriculaQuery)) return false;
  }

  if (filters.hasNc !== "all") {
    const ncCount = computeNcCount(data);
    if (filters.hasNc === "yes" && ncCount <= 0) return false;
    if (filters.hasNc === "no" && ncCount > 0) return false;
  }

  return true;
}

export async function GET(req: NextRequest) {
  const isAdmin = await requireAdminFromRequest(req);
  if (!isAdmin) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const queryParams = req.nextUrl.searchParams;
  const includeAll = queryParams.get("all") === "1";
  const limit = parsePositiveInt(queryParams.get("limit"), 30, 200);
  const offset = parseOffset(queryParams.get("offset"));

  const machineQuery = (queryParams.get("machine_query") ?? "").trim().toLowerCase();
  const maintainerId = (queryParams.get("maintainer_id") ?? "").trim();
  const templateId = (queryParams.get("template_id") ?? "").trim();
  const hasNc = (queryParams.get("has_nc") ?? "all") as "all" | "yes" | "no";
  const matriculaQuery = (queryParams.get("matricula") ?? "").trim().toLowerCase();
  const fromIso = toIsoStart(queryParams.get("from"));
  const toIso = toIsoEnd(queryParams.get("to"));

  let queryRef: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb
    .collection("inspecoes")
    .orderBy("createdAt", "desc");

  if (fromIso) {
    queryRef = queryRef.where("createdAt", ">=", fromIso);
  }
  if (toIso) {
    queryRef = queryRef.where("createdAt", "<=", toIso);
  }

  // filtros com igualdade exata são aplicados no backend para reduzir leituras
  if (maintainerId) {
    queryRef = queryRef.where("maintainer.maintId", "==", maintainerId);
  }
  if (templateId) {
    queryRef = queryRef.where("template.id", "==", templateId);
  }

  const batchSize = includeAll ? 400 : Math.max(limit * 3, 120);
  let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;
  let matched = 0;
  const items: Array<{ id: string; data: FirebaseFirestore.DocumentData }> = [];
  let hasMore = false;

  while (true) {
    let pageQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;
    if (cursor) {
      pageQuery = queryRef.startAfter(cursor).limit(batchSize);
    } else {
      pageQuery = queryRef.limit(batchSize);
    }
    const pageSnap = await pageQuery.get();
    if (pageSnap.empty) break;

    for (const docSnap of pageSnap.docs) {
      const data = docSnap.data() ?? {};
      if (
        !matchesChecklistFilters(data, {
          machineQuery,
          maintainerId,
          templateId,
          hasNc,
          matriculaQuery,
        })
      ) {
        continue;
      }

      if (!includeAll && matched < offset) {
        matched += 1;
        continue;
      }

      items.push({ id: docSnap.id, data });
      matched += 1;

      if (!includeAll && items.length >= limit) {
        hasMore = true;
        break;
      }
    }

    if (hasMore) break;
    cursor = pageSnap.docs[pageSnap.docs.length - 1] ?? null;
    if (!cursor || pageSnap.size < batchSize) break;
  }

  const returnedCount = items.length;
  const nextOffset = includeAll ? returnedCount : offset + returnedCount;

  return NextResponse.json({
    items,
    total: includeAll ? returnedCount : offset + returnedCount + (hasMore ? 1 : 0),
    hasMore,
    nextOffset,
  });
}
