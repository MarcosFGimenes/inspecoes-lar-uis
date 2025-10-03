import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { uploadToImgbbFromDataUrl } from "@/lib/imgbb";

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  nome: z.string().trim().min(1),
  cargo: z.string().trim().optional(),
  assinaturaDataUrl: z.string().trim().min(1),
});

function resolveId(params: Record<string, string | string[] | undefined>) {
  const idValue = params.id;
  if (Array.isArray(idValue)) return idValue[0] ?? null;
  return idValue ?? null;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const params = (await context.params) ?? {};
  const id = resolveId(params);
  if (!id) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    const docRef = adminDb.collection("inspecoes").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const upload = await uploadToImgbbFromDataUrl(payload.assinaturaDataUrl, `pcm-sign-${id}`);
    const nowIso = new Date().toISOString();

    await docRef.update({
      pcmSign: {
        nome: payload.nome,
        cargo: payload.cargo ?? null,
        assinaturaUrl: upload.url,
        signedAt: nowIso,
      },
      updatedAt: nowIso,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
