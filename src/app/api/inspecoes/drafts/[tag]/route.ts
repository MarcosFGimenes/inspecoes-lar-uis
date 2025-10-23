import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminDb } from "@/lib/firebase-admin";
import { findMachineByTag } from "@/lib/db/machines";
import { requireMaint } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemPhotoSchema = z.union([
  z.string().trim().min(1),
  z.object({
    dataUrl: z.string().trim().min(1),
    name: z.string().trim().max(200).optional(),
  }),
]);

const itemSchema = z.object({
  templateItemId: z.string().trim().min(1),
  resultado: z.enum(["", "C", "NC", "NA"]).default(""),
  observacao: z.string().trim().max(4000).optional(),
  fotos: z.array(itemPhotoSchema).max(3).optional(),
  osNumero: z.string().trim().max(120).optional(),
  criticidade: z.number().int().min(1).max(5).optional(),
});

const payloadSchema = z.object({
  osNumero: z.string().trim().max(120).optional(),
  observacoes: z.string().trim().max(4000).optional(),
  assinaturaDataUrl: z.string().trim().max(200_000).nullable().optional(),
  itens: z.array(itemSchema).optional(),
  resolveIssues: z.array(z.string().trim().min(1)).optional(),
});

function ensureDataUrl(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!/^data:[^;]+;base64,/i.test(trimmed)) {
    throw new Error("INVALID_DATA_URL");
  }
  return trimmed;
}

function coerceString(value: unknown) {
  return typeof value === "string" ? value : null;
}

type DraftFoto = { dataUrl: string; name: string | null };

function normalizeFotosPayload(value: unknown): DraftFoto[] {
  if (!Array.isArray(value)) return [];
  const result: DraftFoto[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      try {
        const dataUrl = ensureDataUrl(entry);
        if (dataUrl) {
          result.push({ dataUrl, name: null });
        }
      } catch {
        // ignore invalid data URL
      }
      continue;
    }
    if (entry && typeof entry === "object" && "dataUrl" in entry) {
      try {
        const dataUrl = ensureDataUrl((entry as { dataUrl?: string }).dataUrl ?? null);
        if (!dataUrl) {
          continue;
        }
        const rawName = (entry as { name?: string }).name;
        const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim().slice(0, 200) : null;
        result.push({ dataUrl, name });
      } catch {
        // ignore invalid photo entries
      }
    }
  }
  return result.slice(0, 3);
}

function extractFotosFromData(value: unknown): DraftFoto[] {
  if (!Array.isArray(value)) return [];
  const result: DraftFoto[] = [];
  for (const entry of value) {
    if (entry && typeof entry === "object") {
      const dataUrl = coerceString((entry as Record<string, unknown>).dataUrl);
      if (dataUrl && dataUrl.trim()) {
        const nameValue = coerceString((entry as Record<string, unknown>).name);
        result.push({ dataUrl, name: nameValue?.trim() ? nameValue.trim() : null });
      }
      continue;
    }
    if (typeof entry === "string" && entry.trim()) {
      result.push({ dataUrl: entry, name: null });
    }
  }
  return result.slice(0, 3);
}

function buildDraftId(maintainerId: string, machineId: string) {
  return `${maintainerId}__${machineId}`;
}

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

function extractTag(params: Record<string, string | string[] | undefined>) {
  const tagValue = params.tag;
  return Array.isArray(tagValue) ? tagValue[0] ?? "" : tagValue ?? "";
}

async function resolveContext(tagParam: string, maintainerId: string) {
  const tag = tagParam.trim();
  if (!tag) {
    return { ok: false as const, status: 400, error: "TAG_REQUIRED" };
  }

  const machineRecord = await findMachineByTag(tag);
  if (!machineRecord) {
    return { ok: false as const, status: 404, error: "MACHINE_NOT_FOUND" };
  }

  if (machineRecord.ativo === false) {
    return { ok: false as const, status: 403, error: "MACHINE_INACTIVE" };
  }

  const maintDoc = await adminDb.collection("mantenedores").doc(maintainerId).get();
  if (!maintDoc.exists) {
    return { ok: false as const, status: 403, error: "MAINTAINER_NOT_FOUND" };
  }

  const maintMachines = Array.isArray(maintDoc.data()?.machines)
    ? (maintDoc.data()?.machines as string[])
    : [];
  if (!maintMachines.includes(machineRecord.id)) {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  const templateId = String(machineRecord.templateId ?? "").trim();
  if (!templateId) {
    return { ok: false as const, status: 400, error: "TEMPLATE_NOT_DEFINED" };
  }

  const templateSnap = await adminDb.collection("templates").doc(templateId).get();
  if (!templateSnap.exists) {
    return { ok: false as const, status: 404, error: "TEMPLATE_NOT_FOUND" };
  }

  const templateData = templateSnap.data() ?? {};
  const templateItems = Array.isArray(templateData.itens) ? templateData.itens : [];

  return {
    ok: true as const,
    machineRecord,
    templateId,
    templateNome: templateData.nome ?? null,
    templateItems,
  };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const params = (await context.params) ?? {};
  const tagParam = extractTag(params);

  const resolved = await resolveContext(tagParam, auth.store.id!);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const draftId = buildDraftId(auth.store.id!, resolved.machineRecord.id);
  const draftSnap = await adminDb.collection("inspectionDrafts").doc(draftId).get();
  if (!draftSnap.exists) {
    return NextResponse.json({ draft: null });
  }

  const data = draftSnap.data() ?? {};
  if (coerceString(data.templateId) !== resolved.templateId) {
    await draftSnap.ref.delete().catch(() => undefined);
    return NextResponse.json({ draft: null });
  }

  const itensData = typeof data.itens === "object" && data.itens ? (data.itens as Record<string, unknown>) : {};
  const resolveIssues = Array.isArray(data.resolveIssues)
    ? (data.resolveIssues as unknown[]).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const itens = resolved.templateItems
    .filter(item => item?.id)
    .map(item => {
      const entry = itensData[item.id as string] as Record<string, unknown> | undefined;
      const resultado = coerceString(entry?.resultado) ?? "";
      const observacao = coerceString(entry?.observacao) ?? "";
      const fotos = extractFotosFromData(entry?.fotos);
      const osNumero = coerceString(entry?.osNumero) ?? "";
      const criticidadeValue = entry?.criticidade;
      const criticidade =
        typeof criticidadeValue === "number" && Number.isInteger(criticidadeValue) && criticidadeValue >= 1 && criticidadeValue <= 5
          ? criticidadeValue
          : null;
      return {
        templateItemId: item.id as string,
        resultado,
        observacao,
        osNumero,
        fotos,
        criticidade,
      };
    });

  const total = typeof data.totalItens === "number" ? data.totalItens : itens.length;
  const answered = typeof data.answeredItens === "number" ? data.answeredItens : itens.filter(item => item.resultado).length;
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((answered / total) * 100))) : 0;

  return NextResponse.json({
    draft: {
      osNumero: coerceString(data.osNumero) ?? "",
      observacoes: coerceString(data.observacoes) ?? "",
      assinaturaDataUrl: coerceString(data.assinaturaDataUrl),
      itens,
      totalItens: total,
      answeredItens: answered,
      progressPercent: percent,
      updatedAt: coerceString(data.updatedAt),
      resolveIssues,
    },
  });
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const params = (await context.params) ?? {};
  const tagParam = extractTag(params);

  const resolved = await resolveContext(tagParam, auth.store.id!);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch (err: unknown) {
    const message = err instanceof Error && err.message ? err.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  let assinaturaDataUrl: string | null = null;
  try {
    assinaturaDataUrl = ensureDataUrl(payload.assinaturaDataUrl ?? null);
  } catch {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 422 });
  }

  const itens = (payload.itens ?? []).filter(item => resolved.templateItems.some(templateItem => templateItem?.id === item.templateItemId));
  const resolveIssuesIds = Array.isArray(payload.resolveIssues)
    ? payload.resolveIssues.filter(id => typeof id === "string" && id.trim().length > 0)
    : [];
  const itensMap: Record<
    string,
    { resultado: string; observacao: string | null; osNumero: string | null; fotos: DraftFoto[]; criticidade: number | null }
  > = {};

  let answered = 0;
  for (const item of itens) {
    const resultado = item.resultado ?? "";
    const observacao = item.observacao?.trim() ? item.observacao.trim() : null;
    const fotos = normalizeFotosPayload(item.fotos);
    const osNumero = item.osNumero?.trim() ? item.osNumero.trim().toUpperCase() : null;
    const criticidade =
      typeof item.criticidade === "number" && Number.isFinite(item.criticidade)
        ? Math.max(1, Math.min(5, Math.trunc(item.criticidade)))
        : null;
    itensMap[item.templateItemId] = { resultado, observacao, osNumero, fotos, criticidade };
    if (resultado === "C" || resultado === "NC" || resultado === "NA") {
      answered += 1;
    }
  }

  const total = resolved.templateItems.filter(item => item?.id).length;
  const osNumero = payload.osNumero?.trim() ? payload.osNumero.trim().toUpperCase() : null;
  const observacoes = payload.observacoes?.trim() ? payload.observacoes.trim() : null;
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((answered / total) * 100))) : 0;
  const nowIso = new Date().toISOString();

  const draftId = buildDraftId(auth.store.id!, resolved.machineRecord.id);
  const draftRef = adminDb.collection("inspectionDrafts").doc(draftId);
  const existingSnap = await draftRef.get();
  const createdAt = existingSnap.exists && typeof existingSnap.data()?.createdAt === "string" ? existingSnap.data()!.createdAt : nowIso;

  const payloadToSave = {
    maintainerId: auth.store.id!,
    machineId: resolved.machineRecord.id,
    machineTag: resolved.machineRecord.tag ?? null,
    machineNome: resolved.machineRecord.nome ?? null,
    machineSetor: resolved.machineRecord.setor ?? null,
    machineUnidade: resolved.machineRecord.unidade ?? null,
    templateId: resolved.templateId,
    templateNome: resolved.templateNome ?? null,
    osNumero,
    observacoes,
    assinaturaDataUrl,
    itens: itensMap,
    totalItens: total,
    answeredItens: answered,
    progressPercent: percent,
    updatedAt: nowIso,
    createdAt,
    resolveIssues: resolveIssuesIds,
  };

  await draftRef.set(payloadToSave, { merge: false });

  return NextResponse.json({
    draft: {
      osNumero: osNumero ?? "",
      observacoes: observacoes ?? "",
      assinaturaDataUrl,
      itens: Object.entries(itensMap).map(([templateItemId, value]) => ({
        templateItemId,
        resultado: value.resultado,
        observacao: value.observacao ?? "",
        osNumero: value.osNumero ?? undefined,
        fotos: value.fotos,
        criticidade: value.criticidade ?? undefined,
      })),
      totalItens: total,
      answeredItens: answered,
      progressPercent: percent,
      updatedAt: nowIso,
      resolveIssues: resolveIssuesIds,
    },
  });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const params = (await context.params) ?? {};
  const tagParam = extractTag(params);

  const resolved = await resolveContext(tagParam, auth.store.id!);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const draftId = buildDraftId(auth.store.id!, resolved.machineRecord.id);
  await adminDb.collection("inspectionDrafts").doc(draftId).delete().catch(() => undefined);
  return NextResponse.json({ ok: true });
}
