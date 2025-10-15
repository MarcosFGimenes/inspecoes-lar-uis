import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIso(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    try {
      return new Date(value).toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const cfgSnap = await adminDb.collection("config_programacao").doc("activeBatch").get();
  const cfgData = cfgSnap.data() ?? {};
  const batchIdAtual = typeof cfgData.batchIdAtual === "string" ? cfgData.batchIdAtual : null;

  let totalAtual = 0;
  if (batchIdAtual) {
    const snapAtual = await adminDb.collection("programacoes_inspecao").where("batchId", "==", batchIdAtual).get();
    totalAtual = snapAtual.size;
  }

  const pendentesSnap = await adminDb.collection("programacoes_inspecao").where("status", "==", "PENDENTE").get();
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let atrasadas = 0;
  let semMaquina = 0;

  pendentesSnap.forEach(doc => {
    const data = doc.data() ?? {};
    const machine = data.machine ?? {};
    if (machine.machineNotFound) {
      semMaquina += 1;
    }
    const vencimentoIso = data?.datas?.vencimento;
    if (typeof vencimentoIso === "string") {
      const vencDate = new Date(vencimentoIso);
      if (!Number.isNaN(vencDate.getTime()) && vencDate.getTime() < today.getTime()) {
        atrasadas += 1;
      }
    }
  });

  return NextResponse.json({
    activeBatch: {
      batchIdAtual,
      uploadedAt: toIso(cfgData.uploadedAt),
      uploadedBy: cfgData.uploadedBy ?? null,
    },
    totals: {
      pendentes: pendentesSnap.size,
      atrasadas,
      semMaquina,
      totalBatchAtual: totalAtual,
    },
  });
}
