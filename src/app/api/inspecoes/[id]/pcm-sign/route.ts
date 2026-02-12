import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { fromDataUrl } from "@/lib/storage/dataUrl";
import { r2Provider } from "@/lib/storage/r2Provider";
import { isPcmProfileId } from "@/lib/signature-profiles";
import { sanitizeIsoHeaderConfig } from "@/lib/iso-header-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type RequestBody = {
  nome?: string;
  cargo?: string;
  matricula?: string;
  assinaturaDataUrl?: string;
  assinaturaProfileId?: string;
  isoHeaderConfig?: unknown;
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
    const matricula = typeof body?.matricula === "string" ? body.matricula.trim() : "";
    const assinaturaDataUrl =
      typeof body?.assinaturaDataUrl === "string" ? body.assinaturaDataUrl.trim() : "";
    const assinaturaProfileId =
      typeof body?.assinaturaProfileId === "string" ? body.assinaturaProfileId.trim() : "";
    const hasIsoHeaderConfig =
      body !== null &&
      typeof body === "object" &&
      Object.prototype.hasOwnProperty.call(body, "isoHeaderConfig");

    if (!nome || !matricula || (!assinaturaDataUrl && !assinaturaProfileId)) {
      return NextResponse.json({ error: "Missing nome, matricula or assinatura" }, { status: 400 });
    }

    const docRef = adminDb.collection("inspecoes").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    let assinaturaUrl: string | null = null;
    let profileIsoHeaderConfig: unknown = null;
    if (assinaturaProfileId) {
      if (!isPcmProfileId(assinaturaProfileId)) {
        return NextResponse.json({ error: "INVALID_PROFILE" }, { status: 400 });
      }
      const profileSnap = await adminDb.collection("assinaturas").doc(assinaturaProfileId).get();
      if (!profileSnap.exists) {
        return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
      }
      const profileData = profileSnap.data() ?? {};
      const profileUrl = typeof profileData.assinaturaUrl === "string" ? profileData.assinaturaUrl : null;
      if (!profileUrl) {
        return NextResponse.json({ error: "PROFILE_SIGNATURE_MISSING" }, { status: 400 });
      }
      profileIsoHeaderConfig = profileData.isoHeaderConfig;
      assinaturaUrl = profileUrl;
    } else {
      const { buffer, mime } = fromDataUrl(assinaturaDataUrl);
      const upload = await r2Provider.upload(buffer, mime, `pcm-sign-${id}`, `inspecoes/${id}`);
      assinaturaUrl = upload.url;
    }

    const isoHeaderConfig = sanitizeIsoHeaderConfig(
      hasIsoHeaderConfig ? body?.isoHeaderConfig : profileIsoHeaderConfig
    );
    const signedAt = new Date().toISOString();
    const pcmSign = {
      nome,
      cargo: cargo || null,
      matricula,
      assinaturaUrl,
      signedAt,
      isoHeaderConfig,
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
