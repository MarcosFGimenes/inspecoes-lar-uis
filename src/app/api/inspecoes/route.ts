import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { QueryDocumentSnapshot, DocumentData, DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { saveCorrectiveNonConformity } from "@/lib/db/corrective";
import { findMachineByTag } from "@/lib/db/machines";
import { requireMaint } from "@/lib/guards";
import { randomUUID } from "crypto";
import type { ChecklistAnswer, ChecklistNonConformityTreatment } from "@/types";
import type { Severity6 } from "@/types/severity";
import { isMaintainerProfileId } from "@/lib/signature-profiles";
import { fromDataUrl } from "@/lib/storage/dataUrl";
import { r2Provider } from "@/lib/storage/r2Provider";
import type { StoredImage } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_UPLOAD_DELAY_MS = 60;

function wait(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}

const severity6Schema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

const payloadSchema = z.object({
  tag: z.string().trim().min(1),
  osNumero: z.string().trim().min(1).optional(),
  observacoes: z.string().trim().optional(),
  assinaturaDataUrl: z.string().trim().optional(),
  assinaturaProfileId: z.string().trim().min(1).optional(),
  programacaoId: z.string().trim().min(1).optional(),
  programacaoBatchId: z.string().trim().min(1).optional(),
  prazoProgramado: z.string().trim().min(1).optional(),
  itens: z
    .array(
      z.object({
        templateItemId: z.string().trim().min(1),
        resultado: z.enum(["C", "NC", "NA"]),
        observacaoItem: z.string().trim().optional(),
        fotos: z.array(z.string().trim().min(1)).max(3).optional(),
        osNumeroItem: z.string().trim().min(1).optional(),
        severity: severity6Schema.nullable().optional(),
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

function ensureDataUrl(value: string | null | undefined, context: string) {
  const trimmed = (value ?? "").trim();
  if (!/^data:[^;]+;base64,/i.test(trimmed)) {
    throw new Error(`${context}_INVALID_DATA_URL`);
  }
  return trimmed;
}

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

function normalizeIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
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
    if (!payload.assinaturaDataUrl && !payload.assinaturaProfileId) {
      return NextResponse.json({ error: "ASSINATURA_REQUIRED" }, { status: 422 });
    }

    const machineRecord = await findMachineByTag(payload.tag);

    if (!machineRecord) {
      return NextResponse.json({ error: "MACHINE_NOT_FOUND" }, { status: 404 });
    }

    if (machineRecord.ativo === false) {
      return NextResponse.json({ error: "MACHINE_INACTIVE" }, { status: 403 });
    }

    const maintDoc = await adminDb.collection("mantenedores").doc(auth.store.id!).get();
    if (!maintDoc.exists) {
      return NextResponse.json({ error: "MAINTAINER_NOT_FOUND" }, { status: 403 });
    }

    const maintMachines = Array.isArray(maintDoc.data()?.machines)
      ? (maintDoc.data()?.machines as string[])
      : [];

    if (!maintMachines.includes(machineRecord.id)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const templateId = String(machineRecord.templateId ?? "").trim();
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

    let programacaoDoc: DocumentSnapshot<DocumentData> | null = null;
    let programacaoBatchId = payload.programacaoBatchId?.trim() || null;
    let programacaoPrazoIso = normalizeIsoDate(payload.prazoProgramado);
    let osNumeroFromProgramacao: string | null = null;

    if (payload.programacaoId) {
      programacaoDoc = await adminDb.collection("programacoes_inspecao").doc(payload.programacaoId).get();
      if (!programacaoDoc.exists) {
        return NextResponse.json({ error: "PROGRAMACAO_NOT_FOUND" }, { status: 404 });
      }
      const programacaoData = programacaoDoc.data() ?? {};
      if (!programacaoBatchId && typeof programacaoData.batchId === "string") {
        programacaoBatchId = programacaoData.batchId;
      }
      const programacaoTag =
        typeof programacaoData?.machine?.tag === "string" ? String(programacaoData.machine.tag).trim() : null;
      if (programacaoTag && programacaoTag !== payload.tag) {
        return NextResponse.json({ error: "PROGRAMACAO_MACHINE_MISMATCH" }, { status: 409 });
      }
      osNumeroFromProgramacao =
        typeof programacaoData?.osNumero === "string" ? programacaoData.osNumero.trim().toUpperCase() : null;
      if (!programacaoPrazoIso) {
        programacaoPrazoIso = normalizeIsoDate(programacaoData?.datas?.vencimento ?? null);
      }
    }

    const osNumeroPayload = payload.osNumero ? payload.osNumero.trim().toUpperCase() : null;
    if (osNumeroFromProgramacao && osNumeroPayload && osNumeroPayload !== osNumeroFromProgramacao) {
      return NextResponse.json({ error: "PROGRAMACAO_OS_MISMATCH" }, { status: 409 });
    }

    const osNumeroFinal = osNumeroFromProgramacao ?? osNumeroPayload ?? null;

    if (payload.programacaoId && !osNumeroFinal) {
      return NextResponse.json({ error: "PROGRAMACAO_OS_REQUIRED" }, { status: 422 });
    }

    const inspectionRef = adminDb.collection("inspecoes").doc();
    const inspectionId = inspectionRef.id;
    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const nowTimestamp = Timestamp.fromDate(nowDate);

    let assinaturaUrl: string | null = null;
    if (payload.assinaturaProfileId) {
      const profileId = payload.assinaturaProfileId.trim();
      if (!isMaintainerProfileId(profileId)) {
        return NextResponse.json({ error: "SIGNATURE_PROFILE_INVALID" }, { status: 400 });
      }
      const profileSnap = await adminDb.collection("assinaturas").doc(profileId).get();
      if (!profileSnap.exists) {
        return NextResponse.json({ error: "SIGNATURE_PROFILE_NOT_FOUND" }, { status: 404 });
      }
      const profileData = profileSnap.data() ?? {};
      const ownerId = typeof profileData.maintainerId === "string" ? profileData.maintainerId : null;
      if (ownerId && ownerId !== auth.store.id) {
        return NextResponse.json({ error: "SIGNATURE_PROFILE_FORBIDDEN" }, { status: 403 });
      }
      const storedUrl = typeof profileData.assinaturaUrl === "string" ? profileData.assinaturaUrl : null;
      if (!storedUrl) {
        return NextResponse.json({ error: "SIGNATURE_PROFILE_EMPTY" }, { status: 400 });
      }
      assinaturaUrl = storedUrl;
    } else if (payload.assinaturaDataUrl) {
      const assinaturaDataUrl = ensureDataUrl(payload.assinaturaDataUrl, "ASSINATURA");
      const assinaturaName = buildUploadName(["sign", inspectionId]);
      const { buffer, mime } = fromDataUrl(assinaturaDataUrl);
      const upload = await r2Provider.upload(buffer, mime, assinaturaName, `inspecoes/${inspectionId}`);
      assinaturaUrl = upload.url;
    }

    const itensPayload: Array<{
      templateItemId: string;
      resultado: "C" | "NC" | "NA";
      observacaoItem: string | null;
      fotos: StoredImage[];
      osNumeroItem: string | null;
      severity: Severity6 | null;
    }> = [];
    const answersPayload: ChecklistAnswer[] = [];
    const treatmentsPayload: ChecklistNonConformityTreatment[] = [];

    const fallbackOsNumero = osNumeroFinal;
    const machineAreaRaw =
      typeof (machineRecord as Record<string, unknown>)?.area === "string"
        ? String((machineRecord as Record<string, unknown>).area)
        : null;
    const machineArea = (() => {
      if (!machineAreaRaw) return null;
      const trimmed = machineAreaRaw.trim();
      if (!trimmed) return null;
      const lowered = trimmed.toLowerCase();
      if (["mechanical", "mecanico", "mecânico", "mecanica", "mecânica", "mec"].some(term => lowered.includes(term))) {
        return "mechanical";
      }
      if (["electrical", "eletrico", "elétrico", "eletrica", "elétrica", "eletr"].some(term => lowered.includes(term))) {
        return "electrical";
      }
      return trimmed;
    })();

    for (const item of payload.itens) {
      const osNumeroItem = item.osNumeroItem?.trim()
        ? item.osNumeroItem.trim().toUpperCase()
        : fallbackOsNumero;
      if (item.resultado === "NC" && !osNumeroItem) {
        return NextResponse.json({ error: "ITEM_OS_REQUIRED" }, { status: 422 });
      }
      const severityValue =
        typeof item.severity === "number" && [1, 2, 3, 4, 5, 6].includes(item.severity)
          ? (item.severity as Severity6)
          : null;
      if (item.resultado === "NC" && !severityValue) {
        return NextResponse.json({ error: "ITEM_SEVERITY_REQUIRED" }, { status: 422 });
      }
      const fotosBase64 = item.fotos ? item.fotos.slice(0, 3) : [];
      const fotoAttachments: StoredImage[] = [];
      for (let index = 0; index < fotosBase64.length; index += 1) {
        const dataUrl = ensureDataUrl(fotosBase64[index]!, `ITEM_FOTO_${index + 1}`);
        const uploadName = buildUploadName([
          "inspecao",
          inspectionId,
          item.templateItemId,
          `foto-${index + 1}`,
        ]);
        const { buffer, mime } = fromDataUrl(dataUrl);
        const upload = await r2Provider.upload(
          buffer,
          mime,
          uploadName,
          `inspecoes/${inspectionId}/${item.templateItemId}`
        );
        fotoAttachments.push(upload);
        if (index < fotosBase64.length - 1) {
          await wait(PHOTO_UPLOAD_DELAY_MS);
        }
      }
      itensPayload.push({
        templateItemId: item.templateItemId,
        resultado: item.resultado,
        observacaoItem: item.observacaoItem?.trim() ? item.observacaoItem.trim() : null,
        fotos: fotoAttachments,
        osNumeroItem,
        severity: severityValue,
      });

      const templateItem = templateMap.get(item.templateItemId) ?? {};
      const response = item.resultado === "NC" ? "nc" : item.resultado === "NA" ? "na" : "c";
      answersPayload.push({
        questionId: item.templateItemId,
        questionText: templateItem.oQueChecar ?? templateItem.criterio ?? templateItem.componente ?? null,
        response,
        observation: item.observacaoItem?.trim() ? item.observacaoItem.trim() : null,
        photoUrls: fotoAttachments,
        itemOsNumero: osNumeroItem,
        severity: severityValue,
      });

      if (response === "nc") {
        treatmentsPayload.push({
          questionId: item.templateItemId,
          status: "open",
          createdAt: nowIso,
          severity: severityValue,
        });
      }
    }

    const openIssuesSnap = await adminDb
      .collection("issues")
      .where("machineId", "==", machineRecord.id)
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

    const osNumero = osNumeroFinal;
    const observacoes = payload.observacoes?.trim() ? payload.observacoes.trim() : null;

    for (const item of itensPayload) {
      if (item.resultado !== "NC") {
        continue;
      }
      const templateItem = templateMap.get(item.templateItemId) ?? {};
      const existingIssue = openIssuesByTemplate.get(item.templateItemId);
      if (existingIssue) {
        const issueUpdates: Record<string, unknown> = {};
        if (item.osNumeroItem && existingIssue.data()?.osNumero !== item.osNumeroItem) {
          issueUpdates.osNumero = item.osNumeroItem;
        }
        if (item.fotos.length > 0) {
          issueUpdates.fotos = item.fotos;
        }
        const novaDescricao = item.observacaoItem?.trim();
        if (novaDescricao && existingIssue.data()?.descricao !== novaDescricao) {
          issueUpdates.descricao = novaDescricao;
        }
        if (item.severity && existingIssue.data()?.severity !== item.severity) {
          issueUpdates.severity = item.severity;
        }
        if (Object.keys(issueUpdates).length > 0) {
          await existingIssue.ref.update(issueUpdates);
        }
        const issueDescricao =
          (issueUpdates.descricao as string | undefined) ??
          (existingIssue.data()?.descricao as string | undefined) ??
          item.observacaoItem ?? null;
        await saveCorrectiveNonConformity(existingIssue.id, {
          description: issueDescricao,
          area: machineArea,
          severity: item.severity ? { maintainer: item.severity } : null,
          status: "open",
          updatedAt: nowIso,
          inspectionId: inspectionId,
          source: "inspection",
          scheduledDate: null,
          linkedCorrectiveOsId: null,
          machineId: machineRecord.id,
          machineTag: machineRecord.tag ?? null,
          machineName: machineRecord.nome ?? null,
          photos: item.fotos,
          osNumero: item.osNumeroItem ?? null,
          questionId: item.templateItemId,
          questionLabel:
            templateItem.oQueChecar ?? templateItem.criterio ?? templateItem.componente ?? null,
          inspectionResponseId: inspectionId,
          templateId,
        });
        continue;
      }

      const descricao = item.observacaoItem || buildIssueDescription(templateItem, "NC identificada na inspeção");
      const issueRef = adminDb.collection("issues").doc();
      await issueRef.set({
        machineId: machineRecord.id,
        tag: machineRecord.tag ?? null,
        templateItemId: item.templateItemId,
        descricao,
        osNumero: item.osNumeroItem ?? null,
        fotos: item.fotos,
        status: "aberta",
        abertaEmInspecaoId: inspectionId,
        createdAt: nowIso,
        severity: item.severity ?? null,
      });
      issuesCriadas.push(issueRef.id);
      await saveCorrectiveNonConformity(issueRef.id, {
        description: descricao,
        area: machineArea,
        severity: item.severity ? { maintainer: item.severity } : null,
        status: "open",
        updatedAt: nowIso,
        inspectionId: inspectionId,
        source: "inspection",
        scheduledDate: null,
        linkedCorrectiveOsId: null,
        machineId: machineRecord.id,
        machineTag: machineRecord.tag ?? null,
        machineName: machineRecord.nome ?? null,
        photos: item.fotos,
        osNumero: item.osNumeroItem ?? null,
        questionId: item.templateItemId,
        questionLabel:
          templateItem.oQueChecar ?? templateItem.criterio ?? templateItem.componente ?? null,
        inspectionResponseId: inspectionId,
        templateId,
      });
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
          if (data.machineId !== machineRecord.id || data.status === "resolvida") {
            continue;
          }
          await doc.ref.update({
            status: "resolvida",
            resolvedAt: nowIso,
            resolvidaEmInspecaoId: inspectionId,
          });
          issuesResolvidas.push(doc.id);
          await saveCorrectiveNonConformity(doc.id, {
            status: "closed",
            updatedAt: nowIso,
          });
        }
      }
    }

    const qtdNC = itensPayload.filter(item => item.resultado === "NC").length;

    await inspectionRef.set({
      machine: {
        machineId: machineRecord.id,
        tag: machineRecord.tag ?? null,
        nome: machineRecord.nome ?? null,
        setor: machineRecord.setor ?? null,
        unidade: machineRecord.unidade ?? null,
        localUnidade: machineRecord.localUnidade ?? null,
        lac: machineRecord.lac ?? null,
        fotoUrl: machineRecord.fotoUrl ?? null,
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
      programacaoId: payload.programacaoId ?? null,
      programacaoBatchId: programacaoBatchId ?? null,
      prazoProgramado: programacaoPrazoIso ?? null,
      prazoProgramadoTimestamp: programacaoPrazoIso ? Timestamp.fromDate(new Date(programacaoPrazoIso)) : null,
      observacoes,
      assinaturaUrl,
      itens: itensPayload,
      answers: answersPayload,
      nonConformityTreatments: treatmentsPayload,
      qtdNC,
      createdAt: nowIso,
      createdAtTimestamp: nowTimestamp,
      iniciadaEm: nowIso,
      iniciadaEmTimestamp: nowTimestamp,
      finalizadaEm: nowIso,
      finalizadaEmTimestamp: nowTimestamp,
      issuesCriadas,
      issuesResolvidas,
    });

    if (programacaoDoc) {
      const prazoDate = programacaoPrazoIso ? new Date(programacaoPrazoIso) : null;
      const updates: Record<string, unknown> = {
        status: "CONCLUIDA",
        concluidaEm: nowIso,
        concluidaEmTimestamp: nowTimestamp,
        inspecaoId: inspectionId,
        atrasada: false,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (prazoDate && !Number.isNaN(prazoDate.getTime())) {
        updates.prazoProgramado = programacaoPrazoIso;
        updates.prazoProgramadoTimestamp = Timestamp.fromDate(prazoDate);
        updates.finalizadaNoPrazo = nowDate.getTime() <= prazoDate.getTime();
      }
      if (programacaoBatchId) {
        updates.batchId = programacaoBatchId;
      }
      if (osNumeroFinal) {
        updates.osNumero = osNumeroFinal;
      }
      await programacaoDoc.ref.set(updates, { merge: true });
    }

    return NextResponse.json({ id: inspectionId, assinaturaUrl });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}
