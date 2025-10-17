import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { buildPcmProfileId } from "@/lib/signature-profiles";
import { normalizeName } from "@/lib/string-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  nome: z.string().trim().min(2),
  matricula: z.string().trim().min(1),
  assinaturaUrl: z.string().url().optional(),
  saveSignature: z.boolean().optional(),
});

type UpsertPayload = z.infer<typeof upsertSchema>;

function serializeProfile(docId: string, data: Record<string, unknown>) {
  return {
    id: docId,
    nome: typeof data.nome === "string" ? data.nome : null,
    matricula: typeof data.matricula === "string" ? data.matricula : null,
    assinaturaUrl: typeof data.assinaturaUrl === "string" ? data.assinaturaUrl : null,
  };
}

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const snapshot = await adminDb
      .collection("assinaturas")
      .where("type", "==", "pcm")
      .limit(200)
      .get();

    const profiles = snapshot.docs
      .map(doc => serializeProfile(doc.id, doc.data() ?? {}))
      .sort((a, b) => {
        if (!a.nome && !b.nome) return 0;
        if (!a.nome) return 1;
        if (!b.nome) return -1;
        return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
      });
    return NextResponse.json(profiles);
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let payload: UpsertPayload;
  try {
    payload = upsertSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message ?? "INVALID_PAYLOAD";
      return NextResponse.json({ error: message }, { status: 422 });
    }
    const message = error instanceof Error && error.message ? error.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const profileId = buildPcmProfileId(payload.nome);
  if (!profileId) {
    return NextResponse.json({ error: "INVALID_NAME" }, { status: 422 });
  }

  const now = new Date().toISOString();
  const saveSignature = payload.saveSignature === true;
  const assinaturaUrl = typeof payload.assinaturaUrl === "string" ? payload.assinaturaUrl : undefined;

  try {
    const docRef = adminDb.collection("assinaturas").doc(profileId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      const data = {
        type: "pcm" as const,
        nome: payload.nome,
        nomeNormalized: normalizeName(payload.nome),
        matricula: payload.matricula,
        assinaturaUrl: saveSignature && assinaturaUrl ? assinaturaUrl : null,
        createdAt: now,
        updatedAt: now,
      };
      await docRef.set(data);
      return NextResponse.json(serializeProfile(profileId, data));
    }

    const current = docSnap.data() ?? {};
    const currentMatricula = typeof current.matricula === "string" ? current.matricula : "";
    if (currentMatricula && currentMatricula !== payload.matricula) {
      return NextResponse.json({ error: "MATRICULA_CONFLICT" }, { status: 409 });
    }

    const updates: Record<string, unknown> = {
      nome: payload.nome,
      nomeNormalized: normalizeName(payload.nome),
      matricula: payload.matricula,
      updatedAt: now,
    };

    if (saveSignature && assinaturaUrl) {
      updates.assinaturaUrl = assinaturaUrl;
    }

    await docRef.set(updates, { merge: true });

    const merged = {
      ...current,
      ...updates,
    };
    if (saveSignature && assinaturaUrl) {
      merged.assinaturaUrl = assinaturaUrl;
    }

    return NextResponse.json(serializeProfile(profileId, merged));
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
