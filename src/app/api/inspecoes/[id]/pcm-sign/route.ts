import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { uploadToImgbbFromDataUrl } from "@/lib/imgbb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type RequestBody = {
  nome?: string;
  cargo?: string;
  assinaturaDataUrl?: string;
};

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
    const cargo = typeof body?.cargo === "string" ? body.cargo.trim() : "";
    const assinaturaDataUrl =
      typeof body?.assinaturaDataUrl === "string" ? body.assinaturaDataUrl.trim() : "";

    if (!nome || !assinaturaDataUrl) {
      return NextResponse.json({ error: "Missing nome or assinaturaDataUrl" }, { status: 400 });
    }

    const docRef = adminDb.collection("inspecoes").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const upload = await uploadToImgbbFromDataUrl(assinaturaDataUrl, `pcm-sign-${id}`);
    const signedAt = new Date().toISOString();
    const pcmSign = {
      nome,
      cargo: cargo || null,
      assinaturaUrl: upload.url,
      signedAt,
    };

    await docRef.update({
      pcmSign,
      updatedAt: signedAt,
    });

    return NextResponse.json({ ok: true, pcmSign }, { status: 200 });
  } catch (error) {
    console.error("[pcm-sign] ERROR:", error);
    const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
