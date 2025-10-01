import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: {
    id: string;
  };
}

export async function GET(req: NextRequest, { params }: Params) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const doc = await adminDb.collection("mantenedores").doc(params.id).get();
  if (!doc.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ id: doc.id, ...doc.data() });
}
