import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";

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

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const cfgSnap = await adminDb.collection("config_programacao").doc("activeBatch").get();
  const cfgData = cfgSnap.data() ?? {};
  const batchIdAtual = typeof cfgData.batchIdAtual === "string" ? cfgData.batchIdAtual : null;

  const summary = {
    total: 0,
    pendentes: 0,
    concluidas: 0,
    atrasadas: 0,
    semMantenedor: 0,
    semMaquina: 0,
  };

  if (!batchIdAtual) {
    return NextResponse.json({ summary, programacoes: [] });
  }

  const snap = await adminDb.collection("programacoes_inspecao").where("batchId", "==", batchIdAtual).get();
  const today = new Date();
  const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const programacoes = snap.docs.map(doc => {
    const data = doc.data() ?? {};
    summary.total += 1;

    const status = typeof data.status === "string" ? data.status : "PENDENTE";
    if (status === "CONCLUIDA") {
      summary.concluidas += 1;
    } else {
      summary.pendentes += 1;
    }

    const machine = data.machine ?? {};
    if (machine.machineNotFound) {
      summary.semMaquina += 1;
    }

    const responsavelIds = Array.isArray(data.responsavelIds)
      ? data.responsavelIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    if (responsavelIds.length === 0) {
      summary.semMantenedor += 1;
    }

    const responsaveisRaw = Array.isArray(data.responsaveis) ? data.responsaveis : [];
    const responsaveis = responsaveisRaw
      .map(item => ({
        maintId: typeof item?.maintId === "string" ? item.maintId : null,
        nome: typeof item?.nome === "string" ? item.nome : null,
        matricula: typeof item?.matricula === "string" ? item.matricula : null,
        origem: typeof item?.origem === "string" ? item.origem : null,
      }))
      .filter((item, index, array) => {
        const key = `${item.maintId ?? ""}-${item.nome ?? ""}-${item.matricula ?? ""}`;
        return (
          array.findIndex(other => `${other.maintId ?? ""}-${other.nome ?? ""}-${other.matricula ?? ""}` === key) === index
        );
      });

    const responsavelPrincipalRaw = data.responsavel ?? {};
    const responsavelPrincipal = {
      maintId: typeof responsavelPrincipalRaw?.maintId === "string" ? responsavelPrincipalRaw.maintId : null,
      nome: typeof responsavelPrincipalRaw?.nome === "string" ? responsavelPrincipalRaw.nome : null,
      matricula: typeof responsavelPrincipalRaw?.matricula === "string" ? responsavelPrincipalRaw.matricula : null,
      origem: typeof responsavelPrincipalRaw?.origem === "string" ? responsavelPrincipalRaw.origem : null,
    };

    const vencimentoIso = toIso(data?.datas?.vencimento);
    const vencimentoDate = vencimentoIso ? new Date(vencimentoIso) : null;
    const atrasada = Boolean(
      status === "PENDENTE" &&
        vencimentoDate &&
        !Number.isNaN(vencimentoDate.getTime()) &&
        vencimentoDate.getTime() < startOfToday.getTime(),
    );

    if (atrasada) {
      summary.atrasadas += 1;
    }

    const responsavelNomesNormalizados = Array.isArray(data.responsavelNomesNormalizados)
      ? data.responsavelNomesNormalizados.filter(
          (item: unknown): item is string => typeof item === "string" && item.trim().length > 0,
        )
      : [];

    return {
      id: doc.id,
      osNumero: typeof data.osNumero === "string" ? data.osNumero : null,
      status,
      atrasada,
      machine: {
        tag: typeof machine.tag === "string" ? machine.tag : null,
        nome: typeof machine.nome === "string" ? machine.nome : null,
        machineId: typeof machine.machineId === "string" ? machine.machineId : null,
        machineNotFound: Boolean(machine.machineNotFound),
      },
      manutencao: {
        tipo: typeof data?.manutencao?.tipo === "string" ? data.manutencao.tipo : null,
        criticidade: typeof data?.manutencao?.criticidade === "string" ? data.manutencao.criticidade : null,
      },
      datas: {
        emissao: toIso(data?.datas?.emissao),
        vencimento: vencimentoIso,
        fechamento: toIso(data?.datas?.fechamento),
      },
      responsavelPrincipal,
      responsaveis,
      responsavelIds,
      responsavelNomesNormalizados,
    };
  });

  return NextResponse.json({ summary, programacoes });
}
