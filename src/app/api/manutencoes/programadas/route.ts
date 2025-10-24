import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { normalizeName } from "@/lib/string-utils";

export const createSchema = z.object({
  pendencia: z.string().trim().min(1, "Descreva a pendência"),
  detalhes: z.string().trim().max(2000).optional(),
  responsavelId: z.string().trim().min(1, "Selecione um mantenedor"),
  responsavelNome: z.string().trim().optional(),
  responsavelMatricula: z.string().trim().optional(),
  prazo: z.string().trim().optional(),
  origem: z.enum(["NC", "MANUAL"]).optional(),
  nc: z
    .object({
      responseId: z.string().trim().min(1),
      questionId: z.string().trim().min(1),
      summary: z.string().trim().optional(),
      questionText: z.string().trim().optional(),
      machineId: z.string().trim().optional(),
      machineTag: z.string().trim().optional(),
      machineName: z.string().trim().optional(),
      checklistDate: z.string().trim().optional(),
    })
    .optional(),
});

export const STATUS_VALUES = ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA"] as const;

type StatusValue = (typeof STATUS_VALUES)[number];

const updateSchema = z
  .object({
    status: z.enum(STATUS_VALUES).optional(),
    prazo: z.string().trim().nullable().optional(),
    detalhes: z.string().trim().nullable().optional(),
  })
  .refine(value => value.status || "prazo" in value || typeof value.detalhes === "string", {
    message: "Nenhuma alteração informada.",
  });

function toIso(value: unknown) {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function mapDoc(doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>) {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    pendencia: typeof data.pendencia === "string" ? data.pendencia : "",
    detalhes: typeof data.detalhes === "string" && data.detalhes.trim() ? data.detalhes.trim() : null,
    origem: data.origem === "NC" ? "NC" : "MANUAL",
    status: STATUS_VALUES.includes(data.status) ? (data.status as StatusValue) : "PENDENTE",
    responsavel: {
      id: typeof data.responsavel?.id === "string" ? data.responsavel.id : null,
      nome: typeof data.responsavel?.nome === "string" ? data.responsavel.nome : null,
      matricula: typeof data.responsavel?.matricula === "string" ? data.responsavel.matricula : null,
    },
    prazo: toIso(data.prazoIso) ?? toIso(data.prazoTimestamp) ?? null,
    createdAt: toIso(data.createdAt) ?? null,
    updatedAt: toIso(data.updatedAt) ?? null,
    nc: data.nc && typeof data.nc === "object"
      ? {
          responseId: typeof data.nc.responseId === "string" ? data.nc.responseId : null,
          questionId: typeof data.nc.questionId === "string" ? data.nc.questionId : null,
          summary: typeof data.nc.summary === "string" ? data.nc.summary : null,
          questionText: typeof data.nc.questionText === "string" ? data.nc.questionText : null,
          machineId: typeof data.nc.machineId === "string" ? data.nc.machineId : null,
          machineTag: typeof data.nc.machineTag === "string" ? data.nc.machineTag : null,
          machineName: typeof data.nc.machineName === "string" ? data.nc.machineName : null,
          checklistDate: toIso(data.nc.checklistDate) ?? null,
        }
      : null,
  };
}

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const snapshot = await adminDb
    .collection("programacoes_manutencao")
    .orderBy("createdAt", "desc")
    .limit(300)
    .get();

  const items = snapshot.docs.map(mapDoc);
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD", details: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;

  const prazoIso = normalizeIsoDate(data.prazo ?? null);
  const prazoDate = prazoIso ? new Date(prazoIso) : null;
  const prazoTimestamp = prazoDate ? Timestamp.fromDate(prazoDate) : null;

  const responsavelNomeNormalizado = normalizeName(data.responsavelNome ?? null);
  const responsavelIds = new Set<string>();
  responsavelIds.add(data.responsavelId);
  if (data.responsavelMatricula) {
    responsavelIds.add(data.responsavelMatricula);
  }

  const now = Timestamp.now();
  const origem = data.origem ?? (data.nc ? "NC" : "MANUAL");

  const docRef = await adminDb.collection("programacoes_manutencao").add({
    pendencia: data.pendencia,
    detalhes: data.detalhes ?? null,
    origem,
    status: "PENDENTE" as StatusValue,
    responsavel: {
      id: data.responsavelId,
      nome: data.responsavelNome ?? null,
      matricula: data.responsavelMatricula ?? null,
    },
    responsavelId: data.responsavelId,
    responsavelMatricula: data.responsavelMatricula ?? null,
    responsavelIds: Array.from(responsavelIds),
    responsavelNomesNormalizados: responsavelNomeNormalizado ? [responsavelNomeNormalizado] : [],
    prazoIso,
    prazoTimestamp,
    createdAt: now,
    updatedAt: now,
    nc: data.nc
      ? {
          responseId: data.nc.responseId,
          questionId: data.nc.questionId,
          summary: data.nc.summary ?? null,
          questionText: data.nc.questionText ?? null,
          machineId: data.nc.machineId ?? null,
          machineTag: data.nc.machineTag ?? null,
          machineName: data.nc.machineName ?? null,
          checklistDate: data.nc.checklistDate ?? null,
        }
      : null,
  });

  const saved = await docRef.get();
  return NextResponse.json(mapDoc(saved), { status: 201 });
}

export { updateSchema };
