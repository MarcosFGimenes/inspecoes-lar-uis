import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";

import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";
import { fromDataUrl } from "@/lib/storage/dataUrl";
import { normalizeStoredImages } from "@/lib/storage/images";
import { r2Provider } from "@/lib/storage/r2Provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  templateItemId: z.string().trim().min(1),
  dataUrl: z.string().trim().min(1),
  fileName: z.string().trim().optional(),
});

function sanitizeSegment(segment: string) {
  return segment
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildUploadName(prefixes: Array<string | null | undefined>) {
  const parts = prefixes
    .map(part => (part ? sanitizeSegment(String(part)) : ""))
    .filter(Boolean);
  const base = parts.join("-") || "inspecao";
  return `${base}-${randomUUID()}`.slice(0, 100);
}

type RouteContext = { params: Promise<{ id?: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const { id: rawId } = (await context.params) ?? {};
  const inspectionId = typeof rawId === "string" && rawId.trim() ? rawId.trim() : null;
  if (!inspectionId) {
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
    const docRef = adminDb.collection("inspecoes").doc(inspectionId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const data = docSnap.data() ?? {};
    const { buffer, mime } = fromDataUrl(payload.dataUrl);
    const uploadName = buildUploadName([
      "inspecao",
      inspectionId,
      payload.templateItemId,
      payload.fileName ?? "foto",
    ]);
    const upload = await r2Provider.upload(
      buffer,
      mime,
      uploadName,
      `inspecoes/${inspectionId}/${payload.templateItemId}`
    );

    const storedImage = {
      url: upload.url,
      provider: upload.provider,
      mime: upload.mime,
    } as const;

    const itensArray = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
    const updatedItens = itensArray.map(item => {
      if (item.templateItemId !== payload.templateItemId) return item;
      const fotos = normalizeStoredImages(item.fotos ?? []);
      const nextFotos = [...fotos, storedImage].slice(0, 3);
      return { ...item, fotos: nextFotos };
    });

    const answersArray = Array.isArray(data.answers)
      ? (data.answers as Array<Record<string, unknown>>)
      : [];
    const updatedAnswers = answersArray.map(answer => {
      if (answer.questionId !== payload.templateItemId) return answer;
      const photoUrls = normalizeStoredImages(answer.photoUrls ?? []);
      const nextPhotoUrls = [...photoUrls, storedImage].slice(0, 3);
      return { ...answer, photoUrls: nextPhotoUrls };
    });

    await docRef.update({ itens: updatedItens, answers: updatedAnswers });

    const machineId = (data.machine as { machineId?: string } | undefined)?.machineId;
    if (machineId) {
      const openIssuesSnap = await adminDb
        .collection("issues")
        .where("machineId", "==", machineId)
        .where("templateItemId", "==", payload.templateItemId)
        .where("status", "==", "aberta")
        .get();

      await Promise.all(
        openIssuesSnap.docs.map(async doc => {
          const issueData = doc.data() ?? {};
          const fotos = normalizeStoredImages(issueData.fotos ?? []);
          const nextFotos = [...fotos, storedImage].slice(0, 3);
          await doc.ref.update({ fotos: nextFotos });
        })
      );
    }

    return NextResponse.json(storedImage, { status: 201 });
  } catch (error) {
    console.error("[inspection-photo-upload]", error);
    const message = error instanceof Error ? error.message : "UPLOAD_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

