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
    .collection("inspecoes_resumo")
    .orderBy("createdAt", "desc")
    .orderBy("inspectionId", "desc");

  if (fromIso) queryRef = queryRef.where("createdAt", ">=", fromIso);
  if (toIso) queryRef = queryRef.where("createdAt", "<=", toIso);
  if (maintainerId) queryRef = queryRef.where("maintainerId", "==", maintainerId);
  if (templateId) queryRef = queryRef.where("templateId", "==", templateId);
  if (hasNc === "yes") queryRef = queryRef.where("hasNc", "==", true);
  if (hasNc === "no") queryRef = queryRef.where("hasNc", "==", false);
  if (matriculaQuery) queryRef = queryRef.where("maintainerMatriculaLower", "==", matriculaQuery);

  if (machineQuery) {
    queryRef = queryRef.where("machineSearchTokens", "array-contains", machineQuery);
  }

  if (cursor) {
    queryRef = queryRef.startAfter(cursor.createdAt, cursor.id);
  }

  const snap = await queryRef.limit(limit + 1).get();
  const docs = snap.docs.slice(0, limit);
  const hasMore = snap.docs.length > limit;
  const nextCursor = hasMore
    ? encodeCursor({
        createdAt: String(docs[docs.length - 1]?.data()?.createdAt ?? ""),
        id: String(docs[docs.length - 1]?.data()?.inspectionId ?? docs[docs.length - 1]?.id ?? ""),
      })
    : null;

  const items = docs.map(docSnap => {
    const data = docSnap.data() ?? {};
    return {
      id: String(data.inspectionId ?? docSnap.id),
      data: {
        createdAt: data.createdAt ?? null,
        machine: {
          machineId: data.machineId ?? null,
          nome: data.machineNome ?? null,
          tag: data.machineTag ?? null,
          setor: data.machineSetor ?? null,
        },
        maintainer: {
          maintId: data.maintainerId ?? null,
          nome: data.maintainerNome ?? null,
          matricula: data.maintainerMatricula ?? null,
        },
        template: {
          id: data.templateId ?? null,
          nome: data.templateNome ?? null,
          versao: data.templateVersao ?? null,
        },
        osNumero: data.osNumero ?? null,
        qtdNC: typeof data.qtdNc === "number" ? data.qtdNc : 0,
        hasNc: Boolean(data.hasNc),
      },
    };
  });

  return NextResponse.json({
    items,
    hasMore,
    nextCursor,
  });
}
