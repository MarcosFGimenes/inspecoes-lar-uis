import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { normalizeStoredImages } from "@/lib/storage/images";
import type { ChecklistAnswer } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

type DraftFoto = { dataUrl: string; name: string | null };

function resolveId(params: Record<string, string | string[] | undefined>) {
  const value = params.id;
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function coerceString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeResult(value: unknown): "C" | "NC" | "NA" | "" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "nc") return "NC";
  if (raw === "na") return "NA";
  if (raw === "c") return "C";
  return "";
}

function normalizeDraftFotos(value: unknown): DraftFoto[] {
  return normalizeStoredImages(value)
    .map(image => ({ dataUrl: image.url, name: image.key ?? null }))
    .filter(photo => photo.dataUrl.trim().length > 0)
    .slice(0, 3);
}

function buildDraftItems(data: Record<string, unknown>) {
  const answers = Array.isArray(data.answers) ? (data.answers as ChecklistAnswer[]) : [];
  if (answers.length > 0) {
    return Object.fromEntries(
      answers
        .filter(answer => answer?.questionId)
        .map(answer => [
          answer.questionId,
          {
            resultado: normalizeResult(answer.response),
            observacao: coerceString(answer.observation),
            osNumero: coerceString(answer.itemOsNumero)?.toUpperCase() ?? null,
            fotos: normalizeDraftFotos(answer.photoUrls),
          },
        ])
    );
  }

  const itens = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
  return Object.fromEntries(
    itens
      .filter(item => coerceString(item.templateItemId))
      .map(item => [
        coerceString(item.templateItemId)!,
        {
          resultado: normalizeResult(item.resultado ?? item.response),
          observacao: coerceString(item.observacaoItem ?? item.observacao),
          osNumero: coerceString(item.osNumeroItem ?? item.osNumero)?.toUpperCase() ?? null,
          fotos: normalizeDraftFotos(item.fotos ?? item.photoUrls),
        },
      ])
  );
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const params = (await context.params) ?? {};
  const id = resolveId(params);
  if (!id) {
    return NextResponse.json({ error: "INSPECTION_ID_REQUIRED" }, { status: 400 });
  }

  const inspectionRef = adminDb.collection("inspecoes").doc(id);
  const inspectionSnap = await inspectionRef.get();
  if (!inspectionSnap.exists) {
    return NextResponse.json({ error: "INSPECTION_NOT_FOUND" }, { status: 404 });
  }

  const data = inspectionSnap.data() ?? {};
  const maintainer = (data.maintainer ?? {}) as Record<string, unknown>;
  const machine = (data.machine ?? {}) as Record<string, unknown>;
  const template = (data.template ?? {}) as Record<string, unknown>;
  const maintainerId = coerceString(maintainer.maintId) ?? coerceString(maintainer.id);
  const machineId = coerceString(machine.machineId) ?? coerceString(machine.id);

  if (!maintainerId || !machineId) {
    return NextResponse.json({ error: "INSPECTION_MAINTAINER_OR_MACHINE_MISSING" }, { status: 422 });
  }

  const itens = buildDraftItems(data);
  const totalItens = Object.keys(itens).length;
  const answeredItens = Object.values(itens).filter(item => item.resultado === "C" || item.resultado === "NC" || item.resultado === "NA").length;
  const nowIso = new Date().toISOString();
  const draftId = `${maintainerId}__${machineId}`;

  const batch = adminDb.batch();
  batch.set(
    adminDb.collection("inspectionDrafts").doc(draftId),
    {
      returnedInspectionId: id,
      returnedByAdmin: true,
      maintainerId,
      machineId,
      machineTag: coerceString(machine.tag),
      machineNome: coerceString(machine.nome),
      machineSetor: coerceString(machine.setor),
      machineUnidade: coerceString(machine.unidade),
      templateId: coerceString(template.id) ?? coerceString(machine.templateId),
      templateNome: coerceString(template.nome),
      osNumero: coerceString(data.osNumero)?.toUpperCase() ?? null,
      observacoes: coerceString(data.observacoes),
      assinaturaDataUrl: coerceString(data.assinaturaDataUrl),
      itens,
      totalItens,
      answeredItens,
      progressPercent: totalItens > 0 ? Math.round((answeredItens / totalItens) * 100) : 0,
      createdAt: coerceString(data.createdAt) ?? nowIso,
      updatedAt: nowIso,
    },
    { merge: false }
  );
  batch.update(inspectionRef, {
    status: "rascunho",
    returnedToMaintainer: true,
    returnedAt: nowIso,
    updatedAt: nowIso,
    finalizadaEm: FieldValue.delete(),
    finalizadaEmTimestamp: FieldValue.delete(),
    pcmSign: FieldValue.delete(),
    submittedAt: FieldValue.delete(),
    signatures: FieldValue.delete(),
  });
  await batch.commit();

  return NextResponse.json({ ok: true, draftId });
}
