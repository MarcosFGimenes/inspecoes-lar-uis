import { FieldValue, type DocumentData, type DocumentReference } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { normalizeName } from "@/lib/string-utils";
import { parseSeverityState } from "@/lib/adapters/dataAdapter";
import { resolveMachineDocumentById } from "@/lib/db/machines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maintainerSchema = z.object({
  maintId: z.string().trim().min(1).optional(),
  nome: z.string().trim().min(1).optional(),
  matricula: z.string().trim().min(1).optional(),
});

const payloadSchema = z.object({
  issueId: z.string().trim().min(1),
  programacaoId: z.string().trim().min(1).optional(),
  dataProgramada: z.string().trim().min(1),
  prazo: z.union([z.string(), z.null()]).optional(),
  responsavel: z.union([maintainerSchema, z.null()]).optional(),
  mantenedores: z.array(maintainerSchema).max(2).optional(),
  descricao: z.union([z.string(), z.null()]).optional(),
});

function toIso(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function buildMaintainerPayload(entry: z.infer<typeof maintainerSchema> | null | undefined) {
  if (!entry) return null;
  const maintId = entry.maintId?.trim() ?? null;
  const nome = entry.nome?.trim() ?? null;
  const matricula = entry.matricula?.trim() ?? null;
  if (!maintId && !nome && !matricula) {
    return null;
  }
  return {
    maintId,
    nome,
    matricula,
    nomeNormalizado: nome ? normalizeName(nome) : null,
    origem: maintId ? "id" : nome ? "nome" : "manual",
  };
}

function readNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value === null) {
    return null;
  }
  return null;
}

async function resolveInspection(issueData: DocumentData): Promise<{
  ref: DocumentReference | null;
  data: DocumentData | null;
}> {
  const inspectionId =
    typeof issueData.abertaEmInspecaoId === "string" ? issueData.abertaEmInspecaoId.trim() : null;
  if (!inspectionId) {
    return { ref: null, data: null };
  }

  const ref = adminDb.collection("inspecoes").doc(inspectionId);
  const snapshot = await ref.get().catch(() => null);
  if (!snapshot?.exists) {
    return { ref: null, data: null };
  }
  return { ref, data: snapshot.data() ?? {} };
}

export async function POST(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const programadaIso = toIso(payload.dataProgramada);
  if (!programadaIso) {
    return NextResponse.json({ error: "INVALID_SCHEDULE_DATE" }, { status: 422 });
  }

  let prazoIso: string | null = null;
  let prazoProvided = false;
  if (typeof payload.prazo !== "undefined") {
    prazoProvided = true;
    if (payload.prazo === null) {
      prazoIso = null;
    } else {
      const trimmedPrazo = payload.prazo.trim();
      if (!trimmedPrazo) {
        prazoIso = null;
      } else {
        const parsedPrazo = toIso(trimmedPrazo);
        if (!parsedPrazo) {
          return NextResponse.json({ error: "INVALID_DEADLINE_DATE" }, { status: 422 });
        }
        prazoIso = parsedPrazo;
      }
    }
  }

  const issueRef = adminDb.collection("issues").doc(payload.issueId);
  const issueSnap = await issueRef.get();
  if (!issueSnap.exists) {
    return NextResponse.json({ error: "ISSUE_NOT_FOUND" }, { status: 404 });
  }
  const issueData = issueSnap.data() ?? {};

  const osNumeroFromIssue =
    typeof issueData.osNumero === "string" ? issueData.osNumero.trim().toUpperCase() : null;

  let programacaoRef: DocumentReference | null = payload.programacaoId
    ? adminDb.collection("programacoes_inspecao").doc(payload.programacaoId)
    : null;

  const { ref: inspectionRef, data: inspectionData } = await resolveInspection(issueData);
  if (!programacaoRef) {
    const inspectionProgramacaoId =
      typeof inspectionData?.programacaoId === "string" ? inspectionData.programacaoId : null;
    if (inspectionProgramacaoId) {
      programacaoRef = adminDb.collection("programacoes_inspecao").doc(inspectionProgramacaoId);
    }
  }

  const osNumeroFromInspection =
    typeof inspectionData?.osNumero === "string" ? inspectionData.osNumero.trim().toUpperCase() : null;
  const osNumeroLookup = osNumeroFromIssue ?? osNumeroFromInspection;

  if (!programacaoRef && osNumeroLookup) {
    const snapshot = await adminDb
      .collection("programacoes_inspecao")
      .where("osNumero", "==", osNumeroLookup)
      .limit(1)
      .get();
    if (!snapshot.empty) {
      programacaoRef = snapshot.docs[0]!.ref;
    }
  }

  if (!programacaoRef) {
    programacaoRef = adminDb.collection("programacoes_inspecao").doc();
  }

  const programacaoSnap = await programacaoRef.get();
  const existingProgramacaoData = programacaoSnap.exists ? programacaoSnap.data() ?? {} : {};
  const existingProgramacaoPrazo = readNullableString(
    (existingProgramacaoData?.agendamento as { prazo?: unknown } | undefined)?.prazo,
  );
  const isNewProgramacao = !programacaoSnap.exists;

  const nowIso = new Date().toISOString();
  const resolvedResponsavel =
    typeof payload.responsavel === "undefined"
      ? undefined
      : buildMaintainerPayload(payload.responsavel);
  const resolvedMantenedores =
    typeof payload.mantenedores === "undefined"
      ? undefined
      : payload.mantenedores.map(entry => buildMaintainerPayload(entry)).filter(Boolean);

  const combinedMaintainers =
    typeof payload.responsavel === "undefined" && typeof payload.mantenedores === "undefined"
      ? undefined
      : [
          ...(resolvedResponsavel && resolvedResponsavel !== null ? [resolvedResponsavel] : []),
          ...(Array.isArray(resolvedMantenedores) ? resolvedMantenedores : []),
        ];

  const allMaintainers = combinedMaintainers ?? [];
  const responsavelIds = allMaintainers
    .map(entry => entry?.maintId ?? null)
    .filter((value): value is string => Boolean(value));
  const responsavelNomesNormalizados = allMaintainers
    .map(entry => entry?.nomeNormalizado ?? null)
    .filter((value): value is string => Boolean(value));

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    "datas.programada": programadaIso,
    agendamento: {
      status: "programado",
      programadoEm: nowIso,
      programadoPor: { tipo: "pcm" },
      programadoPara: programadaIso,
      prazo: prazoProvided ? prazoIso ?? null : existingProgramacaoPrazo,
    },
  };

  if (prazoProvided) {
    updates["datas.prazo"] = prazoIso ?? null;
  }

  if (typeof payload.responsavel !== "undefined") {
    updates.responsavel = resolvedResponsavel
      ? {
          nome: resolvedResponsavel.nome ?? null,
          nomeNormalizado: resolvedResponsavel.nomeNormalizado,
          maintId: resolvedResponsavel.maintId ?? null,
          matricula: resolvedResponsavel.matricula ?? null,
          origem: resolvedResponsavel.origem,
        }
      : null;
  }

  if (typeof payload.mantenedores !== "undefined") {
    updates.responsaveis = (resolvedMantenedores ?? []).map(entry => ({
      maintId: entry?.maintId ?? null,
      nome: entry?.nome ?? null,
      nomeNormalizado: entry?.nomeNormalizado ?? null,
      matricula: entry?.matricula ?? null,
      origem: entry?.origem ?? null,
    }));
  }

  if (typeof payload.responsavel !== "undefined" || typeof payload.mantenedores !== "undefined") {
    updates.responsavelIds = responsavelIds;
    updates.responsavelNomesNormalizados = responsavelNomesNormalizados;
  }

  if (isNewProgramacao) {
    const machineId = typeof issueData.machineId === "string" ? issueData.machineId : null;
    let machinePayload: Record<string, unknown> | null = null;
    if (machineId) {
      const machineHandle = await resolveMachineDocumentById(machineId).catch(() => null);
      if (machineHandle) {
        const machineData = machineHandle.data;
        machinePayload = {
          tag: machineData.tag ?? (typeof issueData.tag === "string" ? issueData.tag : null),
          nome: machineData.nome ?? null,
          machineId: machineData.id,
          templateId: machineData.templateId ?? null,
          codTarefaConfigurado: machineData.codTarefa ?? null,
          machineNotFound: false,
          setor: machineData.setor ?? null,
          unidade: machineData.unidade ?? null,
          localUnidade: machineData.localUnidade ?? null,
        };
      }
    }

    if (!machinePayload) {
      machinePayload = {
        tag: typeof issueData.tag === "string" ? issueData.tag : null,
        machineId: typeof issueData.machineId === "string" ? issueData.machineId : null,
        machineNotFound: true,
      };
    }

    const manutencaoPayload: Record<string, unknown> = {};
    if (issueData.severity && typeof issueData.severity === "object") {
      manutencaoPayload.severity = issueData.severity;
    }

    const creationPayload: Record<string, unknown> = {
      osNumero: osNumeroLookup,
      machine: machinePayload,
      manutencao: manutencaoPayload,
      datas: {
        programada: programadaIso,
        ...(prazoProvided ? { prazo: prazoIso ?? null } : {}),
      },
      agendamento: updates.agendamento,
      status: "PENDENTE",
      atrasada: false,
      issueId: payload.issueId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      responsavelIds,
      responsavelNomesNormalizados,
    };

    const creationResponsavel = resolvedResponsavel
      ? {
          nome: resolvedResponsavel.nome ?? null,
          nomeNormalizado: resolvedResponsavel.nomeNormalizado,
          maintId: resolvedResponsavel.maintId ?? null,
          matricula: resolvedResponsavel.matricula ?? null,
          origem: resolvedResponsavel.origem,
        }
      : null;

    creationPayload.responsavel = creationResponsavel;
    creationPayload.responsaveis = (resolvedMantenedores ?? []).map(entry => ({
      maintId: entry?.maintId ?? null,
      nome: entry?.nome ?? null,
      nomeNormalizado: entry?.nomeNormalizado ?? null,
      matricula: entry?.matricula ?? null,
      origem: entry?.origem ?? null,
    }));

    await programacaoRef.set(creationPayload, { merge: true });
  }

  await programacaoRef.set(updates, { merge: true });

  if (isNewProgramacao && inspectionRef && inspectionData?.programacaoId == null) {
    await inspectionRef.set(
      {
        programacaoId: programacaoRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  const descricaoPayload = (() => {
    if (typeof payload.descricao === "undefined") {
      return undefined;
    }
    if (payload.descricao === null) {
      return null;
    }
    const trimmed = payload.descricao.trim();
    return trimmed.length > 0 ? trimmed : null;
  })();

  const issueAgendamento =
    typeof issueData.agendamento === "object" && issueData.agendamento
      ? (issueData.agendamento as Record<string, unknown>)
      : undefined;
  const existingIssuePrazo = readNullableString((issueAgendamento as { prazo?: unknown } | undefined)?.prazo);

  const issueUpdates: Record<string, unknown> = {
    agendamento: {
      programacaoId: programacaoRef.id,
      atualizadoEm: nowIso,
      programadoPara: programadaIso,
      prazo: prazoProvided ? prazoIso ?? null : existingIssuePrazo,
    },
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (descricaoPayload !== undefined && descricaoPayload !== (issueData.descricao ?? null)) {
    issueUpdates.descricao = descricaoPayload;
  }

  await issueRef.set(issueUpdates, { merge: true });

  return NextResponse.json({
    ok: true,
    programacaoId: programacaoRef.id,
    severity: parseSeverityState(issueData.severity),
  });
}
