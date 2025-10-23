import type { Severity, SeverityState } from "@/types/severity";

export type AreaFilter = "mecanica" | "eletrica" | "todas";

export interface ScheduleRecord {
  id: string;
  osNumero: string | null;
  status: string | null;
  machine: {
    tag: string | null;
    nome: string | null;
    setor: string | null;
    unidade: string | null;
    area: AreaFilter;
  };
  manutencao: {
    tipo: string | null;
    criticidade: string | null;
    severity?: SeverityState | null;
  };
  datas: {
    programada: string | null;
    prazo: string | null;
    vencimento: string | null;
  };
  responsavel: {
    nome: string | null;
    maintId: string | null;
    matricula: string | null;
  };
  responsaveis: Array<{
    nome: string | null;
    maintId: string | null;
    matricula: string | null;
  }>;
  effectiveSeverity: Severity | null;
}

export function inferArea(tipo: unknown, setor: unknown): AreaFilter {
  const candidates = [typeof tipo === "string" ? tipo : null, typeof setor === "string" ? setor : null]
    .filter(Boolean)
    .map(value => value!.toLowerCase());

  for (const text of candidates) {
    if (!text) continue;
    if (text.includes("eletr") || text.includes("elétr")) {
      return "eletrica";
    }
    if (text.includes("mec") || text.includes("manut")) {
      return "mecanica";
    }
  }
  return "todas";
}

export function severityWithinRange(severity: Severity | null, min?: Severity, max?: Severity) {
  if (!severity) return true;
  if (typeof min === "number" && severity < min) {
    return false;
  }
  if (typeof max === "number" && severity > max) {
    return false;
  }
  return true;
}

export function groupScheduleByDate(records: ScheduleRecord[]): Array<{ date: string; list: ScheduleRecord[] }> {
  const map = new Map<string, ScheduleRecord[]>();
  records.forEach(record => {
    const dateKey = record.datas.programada ? record.datas.programada.slice(0, 10) : "Sem data";
    const list = map.get(dateKey) ?? [];
    list.push(record);
    map.set(dateKey, list);
  });
  return Array.from(map.entries())
    .map(([date, list]) => ({ date, list }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
