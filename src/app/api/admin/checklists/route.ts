import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/guards";
import { adminDb } from "@/lib/firebase-admin";

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

function ensureString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function ensureNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function computeNcCount(data: Record<string, unknown>) {
  const qtdNc = ensureNumber(data.qtdNC);
  if (typeof qtdNc === "number" && !Number.isNaN(qtdNc)) {
    return qtdNc;
  }
  const answers = Array.isArray(data.answers) ? (data.answers as Array<Record<string, unknown>>) : [];
  if (answers.length > 0) {
    return answers.filter(answer => String(answer?.response ?? "").toLowerCase() === "nc").length;
  }
  const itensRaw = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
  return itensRaw.filter(item => String(item.resultado ?? item.response ?? "c").toLowerCase() === "nc").length;
}

export async function GET(req: NextRequest) {
  const isAdmin = await requireAdminFromRequest(req);
  if (!isAdmin) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const queryParams = req.nextUrl.searchParams;
  const includeAll = queryParams.get("all") === "1";
  const limit = parsePositiveInt(queryParams.get("limit"), 30, 1000);
  const offset = parseOffset(queryParams.get("offset"));
  const machineQuery = queryParams.get("machine_q")?.trim().toLowerCase() ?? "";
  const maintainerId = queryParams.get("maintainer_id")?.trim() ?? "";
  const templateId = queryParams.get("template_id")?.trim() ?? "";
  const hasNc = queryParams.get("has_nc")?.trim() ?? "all";
  const matricula = queryParams.get("matricula")?.trim().toLowerCase() ?? "";
  const from = queryParams.get("from")?.trim() ?? "";
  const to = queryParams.get("to")?.trim() ?? "";
  const hasFilters = Boolean(
    machineQuery ||
      maintainerId ||
      templateId ||
      (hasNc && hasNc !== "all") ||
      matricula ||
      from ||
      to
  );

  const baseQuery = adminDb.collection("inspecoes").orderBy("createdAt", "desc");
  if (!hasFilters) {
    const [countSnap, docsSnap] = await Promise.all([
      adminDb.collection("inspecoes").count().get(),
      includeAll ? baseQuery.get() : baseQuery.offset(offset).limit(limit).get(),
    ]);

    const total = countSnap.data().count;
    const returnedCount = includeAll ? total : docsSnap.docs.length;
    const nextOffset = includeAll ? total : offset + returnedCount;

    return NextResponse.json({
      items: docsSnap.docs.map(docSnap => ({
        id: docSnap.id,
        data: docSnap.data(),
      })),
      total,
      hasMore: nextOffset < total,
      nextOffset,
    });
  }

  const filteredDocs = (await baseQuery.get()).docs.filter(docSnap => {
    const data = docSnap.data() ?? {};
    const machine = (data.machine ?? {}) as Record<string, unknown>;
    const maintainer = (data.maintainer ?? {}) as Record<string, unknown>;
    const template = (data.template ?? {}) as Record<string, unknown>;

    if (machineQuery) {
      const tag = (ensureString(machine.tag) ?? "").toLowerCase();
      const name = (ensureString(machine.nome) ?? "").toLowerCase();
      const setor = (ensureString(machine.setor) ?? "").toLowerCase();
      if (!tag.includes(machineQuery) && !name.includes(machineQuery) && !setor.includes(machineQuery)) {
        return false;
      }
    }
    if (maintainerId) {
      const docMaintainerId = ensureString(maintainer.maintId) ?? ensureString(maintainer.id);
      if (docMaintainerId !== maintainerId) return false;
    }
    if (templateId) {
      const docTemplateId = ensureString(template.id);
      if (docTemplateId !== templateId) return false;
    }
    if (hasNc === "yes" || hasNc === "no") {
      const hasDocNc = computeNcCount(data) > 0;
      if (hasNc === "yes" && !hasDocNc) return false;
      if (hasNc === "no" && hasDocNc) return false;
    }
    if (matricula) {
      const maintainerMatricula = (ensureString(maintainer.matricula) ?? "").toLowerCase();
      if (!maintainerMatricula.includes(matricula)) return false;
    }
    const createdAtRaw = ensureString(data.createdAt) ?? ensureString(data.finalizadaEm) ?? ensureString(data.iniciadaEm);
    const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;
    if (from) {
      const fromDate = new Date(`${from}T00:00:00`);
      if (!createdAt || createdAt < fromDate) return false;
    }
    if (to) {
      const toDate = new Date(`${to}T23:59:59`);
      if (!createdAt || createdAt > toDate) return false;
    }
    return true;
  });

  const total = filteredDocs.length;
  const slicedDocs = includeAll ? filteredDocs : filteredDocs.slice(offset, offset + limit);
  const returnedCount = slicedDocs.length;
  const nextOffset = includeAll ? total : offset + returnedCount;

  return NextResponse.json({
    items: slicedDocs.map(docSnap => ({
      id: docSnap.id,
      data: docSnap.data(),
    })),
    total,
    hasMore: nextOffset < total,
    nextOffset,
  });
}
