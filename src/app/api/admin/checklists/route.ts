import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/guards";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CursorPayload = {
  createdAt: string;
  id: string;
};

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function toIsoStart(dateInput: string | null) {
  if (!dateInput || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return null;
  return new Date(`${dateInput}T00:00:00.000Z`).toISOString();
}

function toIsoEnd(dateInput: string | null) {
  if (!dateInput || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return null;
  return new Date(`${dateInput}T23:59:59.999Z`).toISOString();
}

function decodeCursor(raw: string | null): CursorPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.createdAt !== "string" || typeof parsed?.id !== "string") return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(payload: CursorPayload | null) {
  if (!payload) return null;
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function computeNcCount(data: Record<string, unknown>) {
  if (typeof data.qtdNC === "number") return data.qtdNC;
  const answers = Array.isArray(data.answers) ? data.answers : [];
  if (answers.length > 0) {
    return answers.filter(item => String((item as Record<string, unknown>)?.response ?? "").toLowerCase() === "nc").length;
  }
  const itens = Array.isArray(data.itens) ? data.itens : [];
  return itens.filter(item => String((item as Record<string, unknown>)?.resultado ?? "c").toLowerCase() === "nc").length;
}

export async function GET(req: NextRequest) {
  const isAdmin = await requireAdminFromRequest(req);
  if (!isAdmin) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const queryParams = req.nextUrl.searchParams;
  const limit = parsePositiveInt(queryParams.get("limit"), 30, 100);
  const machineQuery = (queryParams.get("machine_query") ?? "").trim().toLowerCase();
  const maintainerId = (queryParams.get("maintainer_id") ?? "").trim();
  const templateId = (queryParams.get("template_id") ?? "").trim();
  const hasNc = (queryParams.get("has_nc") ?? "all") as "all" | "yes" | "no";
  const matriculaQuery = (queryParams.get("matricula") ?? "").trim().toLowerCase();
  const fromIso = toIsoStart(queryParams.get("from"));
  const toIso = toIsoEnd(queryParams.get("to"));
  const cursor = decodeCursor(queryParams.get("cursor"));

  let queryRef: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb
    .collection("inspecoes")
    .orderBy("createdAt", "desc")
    .orderBy("__name__", "desc");

  if (cursor) {
    queryRef = queryRef.startAfter(cursor.createdAt, cursor.id);
  }

  const chunkSize = Math.max(60, limit * 3);
  const scanLimit = 1200;
  const matched: Array<{ id: string; data: Record<string, unknown> }> = [];
  let scanned = 0;
  let hasMoreFromQuery = true;
  let localCursorQuery = queryRef;

  while (matched.length < limit + 1 && hasMoreFromQuery && scanned < scanLimit) {
    const snap = await localCursorQuery.limit(chunkSize).get();
    if (snap.empty) {
      hasMoreFromQuery = false;
      break;
    }

    const docs = snap.docs;
    scanned += docs.length;

    docs.forEach(docSnap => {
      if (matched.length >= limit + 1) return;
      const data = (docSnap.data() ?? {}) as Record<string, unknown>;
      const machine = (data.machine ?? {}) as Record<string, unknown>;
      const maintainer = (data.maintainer ?? {}) as Record<string, unknown>;
      const template = (data.template ?? {}) as Record<string, unknown>;

      const createdAt =
        (typeof data.createdAt === "string" ? data.createdAt : null) ??
        (typeof data.finalizadaEm === "string" ? data.finalizadaEm : null) ??
        (typeof data.iniciadaEm === "string" ? data.iniciadaEm : null);

      if (fromIso && createdAt && createdAt < fromIso) return;
      if (toIso && createdAt && createdAt > toIso) return;

      const rowMaintainerId =
        (typeof maintainer.maintId === "string" ? maintainer.maintId : null) ??
        (typeof maintainer.id === "string" ? maintainer.id : null);
      if (maintainerId && rowMaintainerId !== maintainerId) return;

      const rowTemplateId = typeof template.id === "string" ? template.id : null;
      if (templateId && rowTemplateId !== templateId) return;

      const rowMatricula = (typeof maintainer.matricula === "string" ? maintainer.matricula : "").trim().toLowerCase();
      if (matriculaQuery && rowMatricula !== matriculaQuery) return;

      const machineTag = (typeof machine.tag === "string" ? machine.tag : "").trim().toLowerCase();
      const machineNome = (typeof machine.nome === "string" ? machine.nome : "").trim().toLowerCase();
      if (machineQuery && !machineTag.includes(machineQuery) && !machineNome.includes(machineQuery)) return;

      const ncCount = computeNcCount(data);
      const rowHasNc = ncCount > 0;
      if (hasNc === "yes" && !rowHasNc) return;
      if (hasNc === "no" && rowHasNc) return;

      matched.push({ id: docSnap.id, data });
    });

    const last = docs[docs.length - 1];
    if (docs.length < chunkSize || !last) {
      hasMoreFromQuery = false;
      break;
    }
    const lastCreatedAt = String(last.data()?.createdAt ?? "");
    localCursorQuery = adminDb
      .collection("inspecoes")
      .orderBy("createdAt", "desc")
      .orderBy("__name__", "desc")
      .startAfter(lastCreatedAt, last.id);
  }

  const docs = matched.slice(0, limit);
  const hasMore = matched.length > limit || hasMoreFromQuery;
  const lastDoc = docs[docs.length - 1];
  const lastCreatedAt =
    lastDoc &&
    ((typeof lastDoc.data.createdAt === "string" ? lastDoc.data.createdAt : null) ??
      (typeof lastDoc.data.finalizadaEm === "string" ? lastDoc.data.finalizadaEm : null) ??
      "");

  const nextCursor = hasMore && lastDoc
    ? encodeCursor({ createdAt: String(lastCreatedAt), id: lastDoc.id })
    : null;

  const items = docs.map(docSnap => {
    const data = docSnap.data;
    const machine = (data.machine ?? {}) as Record<string, unknown>;
    const maintainer = (data.maintainer ?? {}) as Record<string, unknown>;
    const template = (data.template ?? {}) as Record<string, unknown>;

    return {
      id: docSnap.id,
      data: {
        createdAt:
          (typeof data.createdAt === "string" ? data.createdAt : null) ??
          (typeof data.finalizadaEm === "string" ? data.finalizadaEm : null) ??
          (typeof data.iniciadaEm === "string" ? data.iniciadaEm : null),
        machine: {
          machineId:
            (typeof machine.machineId === "string" ? machine.machineId : null) ??
            (typeof machine.id === "string" ? machine.id : null),
          nome: typeof machine.nome === "string" ? machine.nome : null,
          tag: typeof machine.tag === "string" ? machine.tag : null,
          setor: typeof machine.setor === "string" ? machine.setor : null,
        },
        maintainer: {
          maintId:
            (typeof maintainer.maintId === "string" ? maintainer.maintId : null) ??
            (typeof maintainer.id === "string" ? maintainer.id : null),
          nome: typeof maintainer.nome === "string" ? maintainer.nome : null,
          matricula: typeof maintainer.matricula === "string" ? maintainer.matricula : null,
        },
        template: {
          id: typeof template.id === "string" ? template.id : null,
          nome:
            (typeof template.nome === "string" ? template.nome : null) ??
            (typeof template.title === "string" ? template.title : null),
          versao:
            (typeof template.versao === "string" ? template.versao : null) ??
            (typeof template.version === "string" ? template.version : null),
        },
        osNumero: typeof data.osNumero === "string" ? data.osNumero : null,
        qtdNC: computeNcCount(data),
        hasNc: computeNcCount(data) > 0,
      },
    };
  });

  return NextResponse.json({
    items,
    hasMore,
    nextCursor,
  });
}
