import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = (await context.params) ?? {};
  const idValue = params.id;
  const id = Array.isArray(idValue) ? idValue[0] ?? null : idValue ?? null;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const doc = await adminDb.collection("mantenedores").doc(id).get();
  if (!doc.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ id: doc.id, ...doc.data() });
}
