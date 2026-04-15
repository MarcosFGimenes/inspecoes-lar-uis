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

export async function GET(req: NextRequest) {
  const isAdmin = await requireAdminFromRequest(req);
  if (!isAdmin) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const queryParams = req.nextUrl.searchParams;
  const includeAll = queryParams.get("all") === "1";
  const limit = parsePositiveInt(queryParams.get("limit"), 30, 1000);
  const offset = parseOffset(queryParams.get("offset"));

  const baseQuery = adminDb.collection("inspecoes").orderBy("createdAt", "desc");
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
