import type { DocumentData, DocumentSnapshot } from "firebase-admin/firestore";

import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";
import { normalizeName } from "@/lib/string-utils";

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
      const snap = await adminDb
        .collection("programacoes_inspecao")
        .where("responsavel.maintId", "==", maintId)
        .get();
      snap.forEach(doc => {
        docsMap.set(doc.id, doc);
      });
    }

    if (normalizedName) {
      const snap = await adminDb
        .collection("programacoes_inspecao")
        .where("responsavel.nomeNormalizado", "==", normalizedName)
        .get();
      snap.forEach(doc => {
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

    const results = records.map(record => {
      const data = record.data;
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
        },
        responsavel: {
          nome: typeof data.responsavel?.nome === "string" ? data.responsavel.nome : null,
          maintId: typeof data.responsavel?.maintId === "string" ? data.responsavel.maintId : null,
        },
        datas: {
          emissao: toIso(data?.datas?.emissao),
          vencimento: vencimentoIso,
          fechamento: toIso(data?.datas?.fechamento),
        },
        atrasada,
        status: data.status ?? null,
      };
    });

    return NextResponse.json(results);
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
