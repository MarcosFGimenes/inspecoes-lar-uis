import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";
import { uploadToImgbbFromDataUrl } from "@/lib/imgbb";
import { parseSeverityState } from "@/lib/adapters/dataAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  descricao: z.string().trim().max(4000).nullable().optional(),
  fotos: z.array(z.string().trim().min(1)).max(6).optional(),
});

type RouteContext = { params: Promise<{ id?: string } | undefined> };

function extractId(params: { id?: string } | undefined) {
  const id = params?.id;
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

function normalizeDescricao(value: string | null | undefined) {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ensureDataUrl(value: string) {
  const trimmed = value.trim();
  if (!/^data:[^;]+;base64,/i.test(trimmed)) {
    throw new Error("INVALID_DATA_URL");
  }
  return trimmed;
}

function toIso(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const params = await context.params;
  const programacaoId = extractId(params);
  if (!programacaoId) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    const programacaoRef = adminDb.collection("programacoes_inspecao").doc(programacaoId);
    const programacaoSnap = await programacaoRef.get();
    if (!programacaoSnap.exists) {
      return NextResponse.json({ error: "PROGRAMACAO_NOT_FOUND" }, { status: 404 });
    }
    const programacaoData = programacaoSnap.data() ?? {};

    const now = new Date();
    const nowIso = now.toISOString();
    const nowTimestamp = Timestamp.fromDate(now);

    const descricaoNormalized = normalizeDescricao(payload.descricao ?? undefined);

    let photoUrls: string[] | undefined;
    if (Array.isArray(payload.fotos)) {
      photoUrls = [];
      for (let index = 0; index < payload.fotos.length; index += 1) {
        const dataUrl = ensureDataUrl(payload.fotos[index]!);
        const upload = await uploadToImgbbFromDataUrl(
          dataUrl,
          `programacao-${programacaoId}-execucao-${index + 1}`,
        );
        photoUrls.push(upload.url);
      }
    }

    const updates: Record<string, unknown> = {
      status: "CONCLUIDA",
      concluidaEm: nowIso,
      concluidaEmTimestamp: nowTimestamp,
      updatedAt: FieldValue.serverTimestamp(),
      "execucao.status": "concluida",
      "execucao.concluidaEm": nowIso,
      "execucao.concluidaPor": {
        maintId: auth.store.id ?? null,
        nome: auth.store.nome ?? null,
        matricula: auth.store.matricula ?? null,
      },
      "datas.fechamento": nowIso,
    };

    if (descricaoNormalized !== undefined) {
      updates["execucao.descricao"] = descricaoNormalized;
    }
    if (photoUrls !== undefined) {
      updates["execucao.fotos"] = photoUrls;
    }

    const prazoIso = toIso(programacaoData?.datas?.prazo);
    if (prazoIso) {
      const prazoDate = new Date(prazoIso);
      if (!Number.isNaN(prazoDate.getTime())) {
        updates.finalizadaNoPrazo = now.getTime() <= prazoDate.getTime();
        updates.prazoProgramado = prazoIso;
        updates.prazoProgramadoTimestamp = Timestamp.fromDate(prazoDate);
      }
    }

    await programacaoRef.set(updates, { merge: true });

    const issueId = typeof programacaoData.issueId === "string" ? programacaoData.issueId : null;
    if (issueId) {
      const issueRef = adminDb.collection("issues").doc(issueId);
      const issueUpdates: Record<string, unknown> = {
        status: "resolvida",
        resolvedAt: nowIso,
        updatedAt: FieldValue.serverTimestamp(),
        "execucao.atualizadoEm": nowIso,
        "execucao.origem": "programacao",
        "execucao.programacaoId": programacaoId,
        "execucao.atualizadoPor": {
          role: "maint",
          maintId: auth.store.id ?? null,
          nome: auth.store.nome ?? null,
          matricula: auth.store.matricula ?? null,
        },
      };
      if (descricaoNormalized !== undefined) {
        issueUpdates["execucao.descricao"] = descricaoNormalized;
      }
      if (photoUrls !== undefined) {
        issueUpdates["execucao.fotos"] = photoUrls;
      }
      await issueRef.set(issueUpdates, { merge: true });
    }

    const execucaoState: Record<string, unknown> = {
      status: "concluida",
      concluidaEm: nowIso,
      concluidaPor: {
        maintId: auth.store.id ?? null,
        nome: auth.store.nome ?? null,
        matricula: auth.store.matricula ?? null,
      },
    };
    if (descricaoNormalized !== undefined) {
      execucaoState.descricao = descricaoNormalized;
    }
    if (photoUrls !== undefined) {
      execucaoState.fotos = photoUrls;
    }

    const severityState = programacaoData?.manutencao?.severity
      ? parseSeverityState(programacaoData.manutencao.severity)
      : null;

    return NextResponse.json({
      ok: true,
      programacaoId,
      execucao: execucaoState,
      severity: severityState,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("IMGBB_UPLOAD_FAILED")) {
      return NextResponse.json(
        { error: "Falha ao enviar as fotos. Tente novamente em instantes." },
        { status: 429 },
      );
    }
    if (message === "INVALID_DATA_URL") {
      return NextResponse.json({ error: "FOTO_INVALIDA" }, { status: 422 });
    }
    console.error("Erro ao concluir programação", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
