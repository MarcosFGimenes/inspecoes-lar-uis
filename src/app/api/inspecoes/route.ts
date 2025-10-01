import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldPath } from "firebase-admin/firestore";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  tag: z.string().trim().min(1),
  osNumero: z.string().trim().min(1).optional(),
  observacoes: z.string().trim().optional(),
  assinaturaDataUrl: z.string().trim().optional(),
  itens: z
    .array(
      z.object({
        templateItemId: z.string().trim().min(1),
        resultado: z.enum(["C", "NC", "NA"]),
        observacaoItem: z.string().trim().optional(),
        fotos: z.array(z.string().trim().min(1)).max(3).optional(),
      })
    )
    .min(1),
  resolveIssues: z.array(z.string().trim().min(1)).optional(),
});

type Payload = z.infer<typeof payloadSchema>;

type TemplateItem = {
  id?: string;
  componente?: string;
  criterio?: string;
  oQueChecar?: string;
  oQueFazer?: string;
};

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!match) {
    throw new Error("INVALID_DATA_URL");
  }
  const [, mime, base64] = match;
  return {
    buffer: Buffer.from(base64, "base64"),
    mime,
  };
}

function resolveExtension(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return "bin";
}

async function uploadDataUrl(path: string, dataUrl: string) {
  const { buffer, mime } = dataUrlToBuffer(dataUrl);
  const extension = resolveExtension(mime);
  const contentType = mime || "application/octet-stream";
  const finalPath = path.endsWith(`.${extension}`) ? path : `${path}.${extension}`;
  const bucket = adminStorage.bucket();
  const file = bucket.file(finalPath);
  await file.save(buffer, {
    resumable: false,
    contentType,
  });
  await file.makePublic();
  await file.setMetadata({
    contentType,
    cacheControl: "public, max-age=31536000",
  });
  return `https://storage.googleapis.com/${bucket.name}/${finalPath}`;
}

function buildIssueDescription(item: TemplateItem, fallback: string) {
  const componente = item.componente?.trim();
  const criterio = item.criterio?.trim();
  if (componente && criterio) {
    return `NC no item ${componente} — ${criterio}`;
  }
  if (componente) {
    return `NC no item ${componente}`;
  }
  return fallback;
}

function extractMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function POST(req: NextRequest) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  let payload: Payload;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INVALID_PAYLOAD") },
      { status: 422 }
    );
  }

  try {
    const machineQuery = await adminDb
      .collection("maquinas")
      .where("tag", "==", payload.tag)
      .limit(1)
      .get();

    if (machineQuery.empty) {
      return NextResponse.json({ error: "MACHINE_NOT_FOUND" }, { status: 404 });
    }

    const machineDoc = machineQuery.docs[0]!;
    const machineData = machineDoc.data();

    const maintDoc = await adminDb.collection("mantenedores").doc(auth.store.id!).get();
    if (!maintDoc.exists) {
      return NextResponse.json({ error: "MAINTAINER_NOT_FOUND" }, { status: 403 });
    }

    const maintMachines = Array.isArray(maintDoc.data()?.machines)
      ? (maintDoc.data()?.machines as string[])
      : [];

    if (!maintMachines.includes(machineDoc.id)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const templateId = String(machineData.templateId ?? "").trim();
    if (!templateId) {
      return NextResponse.json({ error: "TEMPLATE_NOT_DEFINED" }, { status: 400 });
    }

    const templateSnap = await adminDb.collection("templates").doc(templateId).get();
    if (!templateSnap.exists) {
      return NextResponse.json({ error: "TEMPLATE_NOT_FOUND" }, { status: 404 });
    }

    const templateData = templateSnap.data() ?? {};
    const templateItems: TemplateItem[] = Array.isArray(templateData.itens) ? templateData.itens : [];
    const templateMap = new Map<string, TemplateItem>();
    templateItems.forEach(item => {
      if (item.id) {
        templateMap.set(item.id, item);
      }
    });

    const uniqueItemIds = new Set<string>();
    for (const item of payload.itens) {
      if (!templateMap.has(item.templateItemId)) {
        return NextResponse.json({ error: "INVALID_TEMPLATE_ITEM" }, { status: 422 });
      }
      if (uniqueItemIds.has(item.templateItemId)) {
        return NextResponse.json({ error: "DUPLICATE_TEMPLATE_ITEM" }, { status: 422 });
      }
      uniqueItemIds.add(item.templateItemId);
    }

    const inspectionRef = adminDb.collection("inspecoes").doc();
    const inspectionId = inspectionRef.id;

    let assinaturaUrl: string | null = null;
    if (payload.assinaturaDataUrl) {
      assinaturaUrl = await uploadDataUrl(`public/signatures/${inspectionId}`, payload.assinaturaDataUrl);
    }

    const itensPayload: Array<{
      templateItemId: string;
      resultado: "C" | "NC" | "NA";
      observacaoItem: string | null;
      fotos: string[];
    }> = [];

    for (const item of payload.itens) {
      const fotosBase64 = item.fotos ? item.fotos.slice(0, 3) : [];
      const fotoUrls: string[] = [];
      for (let index = 0; index < fotosBase64.length; index += 1) {
        const dataUrl = fotosBase64[index]!;
        const path = `public/inspections/${inspectionId}/${item.templateItemId}-${index + 1}`;
        const url = await uploadDataUrl(path, dataUrl);
        fotoUrls.push(url);
      }
      itensPayload.push({
        templateItemId: item.templateItemId,
        resultado: item.resultado,
        observacaoItem: item.observacaoItem?.trim() ? item.observacaoItem.trim() : null,
        fotos: fotoUrls,
      });
    }

    const nowIso = new Date().toISOString();

    const openIssuesSnap = await adminDb
      .collection("issues")
      .where("machineId", "==", machineDoc.id)
      .where("status", "==", "aberta")
      .get();

    const openIssuesByTemplate = new Map<string, QueryDocumentSnapshot<DocumentData>>();

    openIssuesSnap.docs.forEach(doc => {
      const data = doc.data() ?? {};
      if (data.templateItemId) {
        openIssuesByTemplate.set(String(data.templateItemId), doc);
      }
    });

    const issuesCriadas: string[] = [];
    const issuesResolvidas: string[] = [];

    const osNumero = payload.osNumero?.trim() ? payload.osNumero.trim() : null;
    const observacoes = payload.observacoes?.trim() ? payload.observacoes.trim() : null;

    for (const item of itensPayload) {
      if (item.resultado !== "NC") {
        continue;
      }
      const existingIssue = openIssuesByTemplate.get(item.templateItemId);
      if (existingIssue) {
        if (osNumero && existingIssue.data()?.osNumero !== osNumero) {
          await existingIssue.ref.update({ osNumero });
        }
        continue;
      }

      const templateItem = templateMap.get(item.templateItemId) ?? {};
      const descricao = item.observacaoItem || buildIssueDescription(templateItem, "NC identificada na inspeção");
      const issueRef = adminDb.collection("issues").doc();
      await issueRef.set({
        machineId: machineDoc.id,
        tag: machineData.tag ?? null,
        templateItemId: item.templateItemId,
        descricao,
        osNumero: osNumero ?? null,
        status: "aberta",
        abertaEmInspecaoId: inspectionId,
        createdAt: nowIso,
      });
      issuesCriadas.push(issueRef.id);
    }

    const resolveIssuesIds = payload.resolveIssues ?? [];
    if (resolveIssuesIds.length > 0) {
      const chunks: string[][] = [];
      for (let i = 0; i < resolveIssuesIds.length; i += 10) {
        chunks.push(resolveIssuesIds.slice(i, i + 10));
      }
      for (const chunk of chunks) {
        const snap = await adminDb
          .collection("issues")
          .where(FieldPath.documentId(), "in", chunk)
          .get();
        for (const doc of snap.docs) {
          const data = doc.data() ?? {};
          if (data.machineId !== machineDoc.id || data.status === "resolvida") {
            continue;
          }
          await doc.ref.update({
            status: "resolvida",
            resolvedAt: nowIso,
            resolvidaEmInspecaoId: inspectionId,
          });
          issuesResolvidas.push(doc.id);
        }
      }
    }

    const qtdNC = itensPayload.filter(item => item.resultado === "NC").length;

    await inspectionRef.set({
      machine: {
        machineId: machineDoc.id,
        tag: machineData.tag ?? null,
        nome: machineData.nome ?? null,
        setor: machineData.setor ?? null,
        unidade: machineData.unidade ?? null,
        localUnidade: machineData.localUnidade ?? null,
        lac: machineData.lac ?? null,
        fotoUrl: machineData.fotoUrl ?? null,
        templateId,
      },
      template: {
        id: templateSnap.id,
        nome: templateData.nome ?? null,
      },
      maintainer: {
        maintId: auth.store.id!,
        nome: auth.store.nome ?? null,
        matricula: auth.store.matricula ?? null,
      },
      osNumero,
      observacoes,
      assinaturaUrl,
      itens: itensPayload,
      qtdNC,
      createdAt: nowIso,
      iniciadaEm: nowIso,
      finalizadaEm: nowIso,
      issuesCriadas,
      issuesResolvidas,
    });

    return NextResponse.json({ id: inspectionId });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}
