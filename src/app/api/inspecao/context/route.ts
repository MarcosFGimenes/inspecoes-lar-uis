import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { findMachineByTag } from "@/lib/db/machines";
import { requireMaint } from "@/lib/guards";
import { normalizeStoredImages } from "@/lib/storage/images";
import { sanitizeIsoHeaderConfig } from "@/lib/iso-header-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isTreatmentResolved(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const status = String((value as Record<string, unknown>).status ?? "").trim().toLowerCase();
  return status === "resolved" || status === "resolvida" || status === "concluida" || status === "concluída" || status === "closed";
}

function hasMaintainerResolution(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const resolution = value as Record<string, unknown>;
  return typeof resolution.resolvedAt === "string" && resolution.resolvedAt.trim().length > 0;
}

async function findSourceTreatment(issueData: Record<string, unknown>) {
  const inspectionId = typeof issueData.abertaEmInspecaoId === "string" ? issueData.abertaEmInspecaoId.trim() : "";
  const templateItemId = typeof issueData.templateItemId === "string" ? issueData.templateItemId.trim() : "";
  if (!inspectionId || !templateItemId) return null;

  const inspectionSnap = await adminDb.collection("inspecoes").doc(inspectionId).get();
  const treatments = Array.isArray(inspectionSnap.data()?.nonConformityTreatments)
    ? (inspectionSnap.data()?.nonConformityTreatments as Array<Record<string, unknown>>)
    : [];

  return treatments.find(treatment => treatment.questionId === templateItemId) ?? null;
}

async function reconcileIssueBeforeInspection(issueDoc: QueryDocumentSnapshot<DocumentData>, nowIso: string) {
  const data = issueDoc.data() ?? {};
  const rawStatus = String(data.status ?? "aberta").trim().toLowerCase();
  if (rawStatus === "resolvida") return "resolvida";

  const sourceTreatment = isTreatmentResolved(data.pcmTreatment) ? null : await findSourceTreatment(data);
  const pcmMarkedResolved = isTreatmentResolved(data.pcmTreatment) || isTreatmentResolved(sourceTreatment);
  const maintainerAlreadyConfirmed = hasMaintainerResolution(data.maintainerResolution);

  if (pcmMarkedResolved && maintainerAlreadyConfirmed) {
    await issueDoc.ref.update({
      status: "resolvida",
      resolvedAt: typeof data.resolvedAt === "string" ? data.resolvedAt : nowIso,
      reconciledAt: nowIso,
      reconciledReason: "pcm_treatment_and_maintainer_resolution",
      updatedAt: nowIso,
    });
    return "resolvida";
  }

  if (rawStatus === "aberta" && pcmMarkedResolved) {
    await issueDoc.ref.update({
      status: "concluida",
      concluidaEm: typeof data.concluidaEm === "string" ? data.concluidaEm : nowIso,
      concluidaPorTratativa: true,
      reconciledAt: nowIso,
      reconciledReason: "pcm_treatment_resolved",
      updatedAt: nowIso,
    });
    return "concluida";
  }

  if (rawStatus === "concluida" && maintainerAlreadyConfirmed) {
    await issueDoc.ref.update({
      status: "resolvida",
      resolvedAt: typeof data.resolvedAt === "string" ? data.resolvedAt : nowIso,
      reconciledAt: nowIso,
      reconciledReason: "concluded_with_maintainer_resolution",
      updatedAt: nowIso,
    });
    return "resolvida";
  }

  return rawStatus === "concluida" ? "concluida" : "aberta";
}

function extractMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export async function GET(req: NextRequest) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const tag = req.nextUrl.searchParams.get("tag")?.trim();
  if (!tag) {
    return NextResponse.json({ error: "TAG_REQUIRED" }, { status: 400 });
  }

  try {
    const machineRecord = await findMachineByTag(tag);

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
    const headerConfigSnap = await adminDb
      .collection("config_inspecao")
      .doc("cabecalho_iso_global")
      .get();
    const headerConfigData = headerConfigSnap.data() ?? {};

    const issuesSnap = await adminDb
      .collection("issues")
      .where("machineId", "==", machineRecord.id)
      .where("status", "in", ["aberta", "concluida"])
      .get();

    const nowIso = new Date().toISOString();
    const reconciledIssues = await Promise.all(
      issuesSnap.docs.map(async doc => ({
        doc,
        status: await reconcileIssueBeforeInspection(doc, nowIso),
      })),
    );

    const openIssues = reconciledIssues
      .filter(issue => issue.status !== "resolvida")
      .map(({ doc, status }) => {
        const data = doc.data() ?? {};
        const rawResolution = data.maintainerResolution ?? null;
        const maintainerResolution = rawResolution && typeof rawResolution === "object"
          ? {
              resolvedAt: rawResolution.resolvedAt ?? null,
              description: rawResolution.description ?? null,
              resolvedByName: rawResolution.resolvedByName ?? null,
            }
          : null;
        return {
          id: doc.id,
          templateItemId: data.templateItemId ?? null,
          descricao: data.descricao ?? null,
          osNumero: data.osNumero ?? null,
          fotos: normalizeStoredImages(data.fotos ?? []),
          createdAt: data.createdAt ?? null,
          status: status === "concluida" ? "concluida" : "aberta",
          maintainerResolution,
        };
      });

    return NextResponse.json({
      maintainer: {
        id: auth.store.id!,
        nome: auth.store.nome ?? null,
        matricula: auth.store.matricula ?? null,
      },
      machine: {
        id: machineRecord.id,
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
        imagemUrl: templateData.imagemUrl ?? null,
        itens: Array.isArray(templateData.itens) ? templateData.itens : [],
      },
      isoHeaderConfig: sanitizeIsoHeaderConfig(headerConfigData.isoHeaderConfig),
      openIssues,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: extractMessage(error, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}
