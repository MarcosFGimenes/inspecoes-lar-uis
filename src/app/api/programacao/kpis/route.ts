import { NextRequest, NextResponse } from "next/server";

import type { DocumentData } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { normalizeName } from "@/lib/string-utils";
import { requireAdminFromRequest } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MaintStats = {
  maintId: string | null;
  nome: string;
  programadas: number;
  realizadas: number;
  pendentes: number;
  atrasadas: number;
  realizadasNoPrazo: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function diffInDays(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / MS_PER_DAY;
}

function getMaintainerKey(maintId: string | null | undefined, nome: string | null | undefined) {
  if (maintId) return `id:${maintId}`;
  const normalized = normalizeName(nome ?? "");
  return normalized ? `nome:${normalized}` : "nome:indefinido";
}

function ensureMaintStats(
  map: Map<string, MaintStats>,
  maintId: string | null | undefined,
  nome: string | null | undefined,
): MaintStats {
  const key = getMaintainerKey(maintId ?? null, nome ?? null);
  if (!map.has(key)) {
    map.set(key, {
      maintId: maintId ?? null,
      nome: nome?.trim() && nome.trim().length > 0 ? nome.trim() : "Sem responsável",
      programadas: 0,
      realizadas: 0,
      pendentes: 0,
      atrasadas: 0,
      realizadasNoPrazo: 0,
    });
  }
  return map.get(key)!;
}

function safeDate(value: unknown) {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      const converted = (value as { toDate: () => Date }).toDate();
      if (!Number.isNaN(converted.getTime())) {
        return converted;
      }
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

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Math.max(1, Math.min(180, Number(daysParam) || 30));

  const now = new Date();
  const start = new Date(now.getTime() - (days - 1) * MS_PER_DAY);
  start.setHours(0, 0, 0, 0);
  const end = new Date();

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [programacoesSnap, inspecoesSnap, pendentesSnap] = await Promise.all([
    adminDb
      .collection("programacoes_inspecao")
      .where("datas.vencimento", ">=", startIso)
      .where("datas.vencimento", "<=", endIso)
      .get(),
    adminDb
      .collection("inspecoes")
      .where("finalizadaEm", ">=", startIso)
      .where("finalizadaEm", "<=", endIso)
      .get(),
    adminDb.collection("programacoes_inspecao").where("status", "==", "PENDENTE").get(),
  ]);

  const programacoesById = new Map<string, DocumentData>();
  const maintStatsMap = new Map<string, MaintStats>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  programacoesSnap.forEach(doc => {
    const data = doc.data() ?? {};
    const responsavel = data.responsavel ?? {};
    const maintId = typeof responsavel.maintId === "string" ? responsavel.maintId : null;
    const nome = typeof responsavel.nome === "string" ? responsavel.nome : null;

    const stats = ensureMaintStats(maintStatsMap, maintId, nome);
    stats.programadas += 1;

    if (data.status === "PENDENTE") {
      stats.pendentes += 1;
      const vencimentoIso = typeof data?.datas?.vencimento === "string" ? data.datas.vencimento : null;
      if (vencimentoIso) {
        const vencDate = new Date(vencimentoIso);
        if (!Number.isNaN(vencDate.getTime()) && vencDate.getTime() < today.getTime()) {
          stats.atrasadas += 1;
        }
      }
    }

    programacoesById.set(doc.id, data);
  });

  const totalProgramadas = programacoesById.size;
  let totalRealizadas = 0;
  let noPrazo = 0;
  let atrasoDiasTotal = 0;
  let atrasoCount = 0;

  inspecoesSnap.forEach(doc => {
    const data = doc.data() ?? {};
    const programacaoId = typeof data.programacaoId === "string" ? data.programacaoId : null;
    if (!programacaoId) return;
    const programacao = programacoesById.get(programacaoId);
    if (!programacao) return;

    totalRealizadas += 1;

    const maintainer = data.maintainer ?? {};
    const maintId = typeof maintainer.maintId === "string" ? maintainer.maintId : null;
    const nome = typeof maintainer.nome === "string" ? maintainer.nome : null;
    const stats = ensureMaintStats(maintStatsMap, maintId ?? (programacao.responsavel?.maintId ?? null), nome ?? programacao.responsavel?.nome);
    stats.realizadas += 1;

    const finalizadaEmDate = safeDate(data.finalizadaEm) ?? safeDate(data.finalizadaEmTimestamp);
    const prazoProgramado =
      safeDate(data.prazoProgramado) ?? safeDate(programacao?.datas?.vencimento) ?? safeDate(programacao?.datas?.vencimentoDate);

    if (finalizadaEmDate && prazoProgramado) {
      if (finalizadaEmDate.getTime() <= prazoProgramado.getTime()) {
        noPrazo += 1;
        stats.realizadasNoPrazo += 1;
      } else {
        atrasoCount += 1;
        atrasoDiasTotal += Math.max(0, diffInDays(finalizadaEmDate, prazoProgramado));
      }
    }
  });

  const atrasoMedioDias = atrasoCount > 0 ? atrasoDiasTotal / atrasoCount : 0;

  const desempenhoPorMantenedor = Array.from(maintStatsMap.values())
    .map(item => ({
      maintId: item.maintId,
      nome: item.nome,
      programadas: item.programadas,
      realizadas: item.realizadas,
      pendentes: item.pendentes,
      atrasadas: item.atrasadas,
      percentualNoPrazo: item.realizadas > 0 ? (item.realizadasNoPrazo / item.realizadas) * 100 : 0,
    }))
    .sort((a, b) => b.programadas - a.programadas || b.realizadas - a.realizadas);

  const atrasadasAbertasData = { atrasadas: 0, criticidadeAlta: 0 };
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  pendentesSnap.forEach(doc => {
    const data = doc.data() ?? {};
    const vencimento = typeof data?.datas?.vencimento === "string" ? new Date(data.datas.vencimento) : null;
    if (vencimento && !Number.isNaN(vencimento.getTime()) && vencimento.getTime() < todayStart.getTime()) {
      atrasadasAbertasData.atrasadas += 1;
      const criticidade = typeof data?.manutencao?.criticidade === "string" ? data.manutencao.criticidade.toUpperCase() : "";
      if (criticidade === "A") {
        atrasadasAbertasData.criticidadeAlta += 1;
      }
    }
  });

  return NextResponse.json({
    periodo: {
      inicio: startIso,
      fim: endIso,
      dias: days,
    },
    indicadores: {
      cumprimentoPrazo: totalProgramadas > 0 ? (noPrazo / totalProgramadas) * 100 : 0,
      totalProgramadas,
      totalRealizadas,
      noPrazo,
      inspecoesAtrasadasAbertas: atrasadasAbertasData.atrasadas,
      tempoMedioAtrasoDias: atrasoMedioDias,
      programadasVsRealizadas: {
        programadas: totalProgramadas,
        realizadas: totalRealizadas,
      },
      desempenhoPorMantenedor,
      backlogPreventivo: pendentesSnap.size,
      criticidadeAltaAtrasada: atrasadasAbertasData.criticidadeAlta,
    },
  });
}
