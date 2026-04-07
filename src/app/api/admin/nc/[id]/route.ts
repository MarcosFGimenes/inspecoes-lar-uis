import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const isAdmin = await requireAdminFromRequest(req);
  if (!isAdmin) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const issueRef = adminDb.collection("issues").doc(id);
  const issueSnap = await issueRef.get();
  if (!issueSnap.exists) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await issueRef.delete();
  return NextResponse.json({ ok: true });
}
