import { FieldPath } from "firebase-admin/firestore";
import type { DocumentData, DocumentSnapshot } from "firebase-admin/firestore";

import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";
import { normalizeName } from "@/lib/string-utils";
import { parseSeverityState, getEffectiveSeverity } from "@/lib/adapters/dataAdapter";
import { ensureStoredPhotos, photosToUrls } from "@/lib/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIso(value: unknown) {
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value &&
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

function readStringArray(value: unknown): string[] {
  return photosToUrls(ensureStoredPhotos(value));
}

function readNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value === null) {
    return null;
  }
  return null;
}

export async function GET() {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  try {
    const maintId = auth.store.id ?? null;
    const maintName = auth.store.nome ?? null;
    const normalizedName = normalizeName(typeof maintName === "string" ? maintName : null);

    const docsMap = new Map<string, DocumentSnapshot<DocumentData>>();

    if (maintId) {
      const [principalSnap, idsSnap] = await Promise.all([
        adminDb.collection("programacoes_inspecao").where("responsavel.maintId", "==", maintId).get(),
        adminDb.collection("programacoes_inspecao").where("responsavelIds", "array-contains", maintId).get(),
      ]);
      principalSnap.forEach(doc => {
        docsMap.set(doc.id, doc);
      });
      idsSnap.forEach(doc => {
        docsMap.set(doc.id, doc);
      });
    }

    if (normalizedName) {
      const [principalNameSnap, namesSnap] = await Promise.all([
        adminDb.collection("programacoes_inspecao").where("responsavel.nomeNormalizado", "==", normalizedName).get(),
        adminDb
          .collection("programacoes_inspecao")
          .where("responsavelNomesNormalizados", "array-contains", normalizedName)
          .get(),
      ]);
      principalNameSnap.forEach(doc => {
        docsMap.set(doc.id, doc);
      });
      namesSnap.forEach(doc => {
        docsMap.set(doc.id, doc);
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const records = Array.from(docsMap.values())
      .map(doc => {
        const data = doc.data() ?? {};
        return { id: doc.id, data };
      })
      .filter(record => record.data.status === "PENDENTE");

    records.sort((a, b) => {
      const vencA = toIso(a.data?.datas?.vencimento);
      const vencB = toIso(b.data?.datas?.vencimento);
      if (vencA && vencB) return vencA.localeCompare(vencB);
      if (vencA) return -1;
      if (vencB) return 1;
      return a.id.localeCompare(b.id);
    });

    const issueIds = Array.from(
      new Set(
        records
          .map(record => (typeof record.data.issueId === "string" ? record.data.issueId.trim() : null))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const issuesById = new Map<string, DocumentData>();
    for (let index = 0; index < issueIds.length; index += 10) {
      const chunk = issueIds.slice(index, index + 10);
      if (chunk.length === 0) continue;
      const snapshot = await adminDb
        .collection("issues")
        .where(FieldPath.documentId(), "in", chunk)
        .get()
        .catch(() => null);
      snapshot?.forEach(doc => {
        issuesById.set(doc.id, doc.data() ?? {});
      });
    }

    const results = records.map(record => {
      const data = record.data;
      const issueId = typeof data.issueId === "string" ? data.issueId : null;
      const issueData = issueId ? issuesById.get(issueId) ?? {} : undefined;
      const vencimentoIso = toIso(data?.datas?.vencimento);
      const vencimentoDate = vencimentoIso ? new Date(vencimentoIso) : null;
      const atrasada = Boolean(
        vencimentoDate && !Number.isNaN(vencimentoDate.getTime()) && vencimentoDate.getTime() < today.getTime(),
      );
      return {
        id: record.id,
        batchId: typeof data.batchId === "string" ? data.batchId : null,
        osNumero: typeof data.osNumero === "string" ? data.osNumero : null,
        machine: {
          tag: typeof data.machine?.tag === "string" ? data.machine.tag : null,
          nome: typeof data.machine?.nome === "string" ? data.machine.nome : null,
          machineId: typeof data.machine?.machineId === "string" ? data.machine.machineId : null,
          machineNotFound: Boolean(data.machine?.machineNotFound),
        },
        manutencao: {
          tipo: typeof data.manutencao?.tipo === "string" ? data.manutencao.tipo : null,
          criticidade: typeof data.manutencao?.criticidade === "string" ? data.manutencao.criticidade : null,
          severity: data.manutencao?.severity ? parseSeverityState(data.manutencao.severity) : undefined,
          effectiveSeverity: data.manutencao?.severity
            ? getEffectiveSeverity(parseSeverityState(data.manutencao.severity))
            : undefined,
        },
        responsavel: {
          nome: typeof data.responsavel?.nome === "string" ? data.responsavel.nome : null,
          maintId: typeof data.responsavel?.maintId === "string" ? data.responsavel.maintId : null,
          matricula: typeof data.responsavel?.matricula === "string" ? data.responsavel.matricula : null,
          origem: typeof data.responsavel?.origem === "string" ? data.responsavel.origem : null,
        },
        datas: {
          emissao: toIso(data?.datas?.emissao),
          vencimento: vencimentoIso,
          fechamento: toIso(data?.datas?.fechamento),
          programada: toIso(data?.datas?.programada),
          prazo: toIso(data?.datas?.prazo),
        },
        atrasada,
        status: data.status ?? null,
        mantenedores: Array.isArray(data.responsaveis)
          ? (data.responsaveis as Array<Record<string, unknown>>).map(entry => ({
              nome: typeof entry?.nome === "string" ? entry.nome : null,
              maintId: typeof entry?.maintId === "string" ? entry.maintId : null,
              matricula: typeof entry?.matricula === "string" ? entry.matricula : null,
              origem: typeof entry?.origem === "string" ? entry.origem : null,
            }))
          : [],
        issue: issueId
          ? {
              id: issueId,
              descricao: typeof issueData?.descricao === "string" ? issueData.descricao : null,
              fotos: readStringArray(issueData?.fotos),
              osNumero: typeof issueData?.osNumero === "string" ? issueData.osNumero : null,
              severity: issueData?.severity ? parseSeverityState(issueData.severity) : undefined,
              effectiveSeverity: issueData?.severity
                ? getEffectiveSeverity(parseSeverityState(issueData.severity))
                : undefined,
            }
          : null,
        execucao: (() => {
          const raw = data.execucao as Record<string, unknown> | undefined;
          if (!raw) {
            return null;
          }
          const concluidaPorRaw = raw.concluidaPor as Record<string, unknown> | undefined;
          const fotos = readStringArray(raw.fotos);
          return {
            status: typeof raw.status === "string" ? raw.status : null,
            descricao: readNullableString(raw.descricao),
            fotos,
            concluidaEm: toIso(raw.concluidaEm ?? raw.concluidaEmIso),
            concluidaPor: concluidaPorRaw
              ? {
                  maintId: typeof concluidaPorRaw.maintId === "string" ? concluidaPorRaw.maintId : null,
                  nome: typeof concluidaPorRaw.nome === "string" ? concluidaPorRaw.nome : null,
                  matricula: typeof concluidaPorRaw.matricula === "string" ? concluidaPorRaw.matricula : null,
                }
              : null,
          };
        })(),
      };
    });

    return NextResponse.json(results);
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
