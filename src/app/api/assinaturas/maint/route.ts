import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";
import { buildMaintainerProfileId } from "@/lib/signature-profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveSchema = z.object({
  assinaturaUrl: z.string().url().nullable().optional(),
});

function serializeProfile(docId: string, data: Record<string, unknown>) {
  return {
    id: docId,
    assinaturaUrl: typeof data.assinaturaUrl === "string" ? data.assinaturaUrl : null,
  };
}

export async function GET() {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const profileId = buildMaintainerProfileId(auth.store.id);
  if (!profileId) {
    return NextResponse.json({ error: "INVALID_PROFILE" }, { status: 400 });
  }

  try {
    const docRef = adminDb.collection("assinaturas").doc(profileId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ id: profileId, assinaturaUrl: null });
    }
    return NextResponse.json(serializeProfile(docSnap.id, docSnap.data() ?? {}));
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  let payload: z.infer<typeof saveSchema>;
  try {
    payload = saveSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message ?? "INVALID_PAYLOAD";
      return NextResponse.json({ error: message }, { status: 422 });
    }
    const message = error instanceof Error && error.message ? error.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const profileId = buildMaintainerProfileId(auth.store.id);
  if (!profileId) {
    return NextResponse.json({ error: "INVALID_PROFILE" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const assinaturaUrl = typeof payload.assinaturaUrl === "string" ? payload.assinaturaUrl : null;

  try {
    const docRef = adminDb.collection("assinaturas").doc(profileId);
    const docSnap = await docRef.get();

    const data: Record<string, unknown> = {
      type: "maintainer",
      maintainerId: auth.store.id,
      nome: auth.store.nome ?? null,
      assinaturaUrl,
      updatedAt: now,
    };

    if (!docSnap.exists) {
      data.createdAt = now;
    }

    await docRef.set(data, { merge: true });

    return NextResponse.json({ id: profileId, assinaturaUrl });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
