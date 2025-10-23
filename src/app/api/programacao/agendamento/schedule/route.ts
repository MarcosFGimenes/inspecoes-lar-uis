import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { normalizeName } from "@/lib/string-utils";
import { parseSeverityState } from "@/lib/adapters/dataAdapter";

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
  prazo: z.string().trim().min(1).optional(),
  responsavel: maintainerSchema.optional(),
  mantenedores: z.array(maintainerSchema).max(2).optional(),
});

function toIso(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function buildMaintainerPayload(entry: z.infer<typeof maintainerSchema> | undefined) {
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
  const prazoIso = toIso(payload.prazo ?? null);

  const issueRef = adminDb.collection("issues").doc(payload.issueId);
  const issueSnap = await issueRef.get();
  if (!issueSnap.exists) {
    return NextResponse.json({ error: "ISSUE_NOT_FOUND" }, { status: 404 });
  }
  const issueData = issueSnap.data() ?? {};

  let programacaoRef = payload.programacaoId
    ? adminDb.collection("programacoes_inspecao").doc(payload.programacaoId)
    : null;

  if (!programacaoRef) {
    const inspectionId = typeof issueData.abertaEmInspecaoId === "string" ? issueData.abertaEmInspecaoId : null;
    if (inspectionId) {
      const inspectionSnap = await adminDb.collection("inspecoes").doc(inspectionId).get();
      const inspectionData = inspectionSnap.data() ?? {};
      const programacaoId = typeof inspectionData.programacaoId === "string" ? inspectionData.programacaoId : null;
      if (programacaoId) {
        programacaoRef = adminDb.collection("programacoes_inspecao").doc(programacaoId);
      }
    }
  }

  if (!programacaoRef) {
    const osNumero =
      typeof issueData.osNumero === "string" ? issueData.osNumero.trim().toUpperCase() : null;
    if (osNumero) {
      const snapshot = await adminDb
        .collection("programacoes_inspecao")
        .where("osNumero", "==", osNumero)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        programacaoRef = snapshot.docs[0]!.ref;
      }
    }
  }

  if (!programacaoRef) {
    return NextResponse.json({ error: "PROGRAMACAO_NOT_FOUND" }, { status: 404 });
  }

  const programacaoSnap = await programacaoRef.get();
  if (!programacaoSnap.exists) {
    return NextResponse.json({ error: "PROGRAMACAO_NOT_FOUND" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const responsavelPayload = buildMaintainerPayload(payload.responsavel);
  const mantenedores = (payload.mantenedores ?? []).map(buildMaintainerPayload).filter(Boolean);

  const responsavelIds = [responsavelPayload?.maintId, ...mantenedores.map(item => item?.maintId ?? null)]
    .filter((value): value is string => Boolean(value));
  const responsavelNomesNormalizados = [
    responsavelPayload?.nomeNormalizado,
    ...mantenedores.map(item => item?.nomeNormalizado ?? null),
  ].filter((value): value is string => Boolean(value));

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    "datas.programada": programadaIso,
    agendamento: {
      status: "programado",
      programadoEm: nowIso,
      programadoPor: { tipo: "pcm" },
      programadoPara: programadaIso,
      prazo: prazoIso ?? null,
    },
  };

  if (prazoIso) {
    updates["datas.prazo"] = prazoIso;
  }
  if (responsavelPayload) {
    updates.responsavel = {
      nome: responsavelPayload.nome ?? null,
      nomeNormalizado: responsavelPayload.nomeNormalizado,
      maintId: responsavelPayload.maintId ?? null,
      matricula: responsavelPayload.matricula ?? null,
      origem: responsavelPayload.origem,
    };
  }
  if (payload.mantenedores !== undefined) {
    updates.responsaveis = mantenedores.map(entry => ({
      maintId: entry?.maintId ?? null,
      nome: entry?.nome ?? null,
      nomeNormalizado: entry?.nomeNormalizado ?? null,
      matricula: entry?.matricula ?? null,
      origem: entry?.origem ?? null,
    }));
  }
  if (payload.mantenedores !== undefined || typeof payload.responsavel !== "undefined") {
    updates.responsavelIds = responsavelIds;
    updates.responsavelNomesNormalizados = responsavelNomesNormalizados;
  }

  await programacaoRef.set(updates, { merge: true });

  await issueRef.set(
    {
      agendamento: {
        programacaoId: programacaoRef.id,
        atualizadoEm: nowIso,
        programadoPara: programadaIso,
        prazo: prazoIso ?? null,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return NextResponse.json({
    ok: true,
    programacaoId: programacaoRef.id,
    severity: parseSeverityState(issueData.severity),
  });
}
