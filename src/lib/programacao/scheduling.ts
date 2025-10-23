import { FieldPath } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { getMachinesByIdsChunked } from "@/lib/db/machines";
import { parseSeverityState, getEffectiveSeverity } from "@/lib/adapters/dataAdapter";
import type { Severity, SeverityState } from "@/types/severity";

import { inferArea, severityWithinRange } from "./scheduling-helpers";
import type { AreaFilter, ScheduleRecord } from "./scheduling-helpers";

export type { AreaFilter, ScheduleRecord } from "./scheduling-helpers";
export { groupScheduleByDate, inferArea, severityWithinRange } from "./scheduling-helpers";

export interface SchedulingFilters {
  area?: AreaFilter;
  minSeverity?: Severity;
  maxSeverity?: Severity;
  from?: string;
  to?: string;
  search?: string;
}

export interface SchedulingNCRecord {
  id: string;
  templateItemId: string | null;
  descricao: string | null;
  status: string;
  createdAt: string | null;
  machine: {
    id: string | null;
    tag: string | null;
    nome: string | null;
    setor: string | null;
    unidade: string | null;
    area: AreaFilter;
  };
  osNumero: string | null;
  severity: SeverityState;
  effectiveSeverity: Severity | null;
  inspection?: {
    id: string | null;
    createdAt: string | null;
    maintainerNome: string | null;
  } | null;
  programacao?: {
    id: string | null;
    osNumero: string | null;
    status: string | null;
    manutencao: {
      tipo: string | null;
      criticidade: string | null;
      severity?: SeverityState | null;
    };
    datas: {
      emissao: string | null;
      vencimento: string | null;
      programada: string | null;
      prazo: string | null;
    };
    responsavel?: {
      maintId: string | null;
      nome: string | null;
      matricula: string | null;
    } | null;
    responsaveis?: Array<{
      maintId: string | null;
      nome: string | null;
      matricula: string | null;
    }>;
  } | null;
}

export interface ScheduleFilters {
  from?: string;
  to?: string;
  area?: AreaFilter;
  minSeverity?: Severity;
  responsavelId?: string;
  search?: string;
}

function normalizeIso(value: unknown): string | null {
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

async function fetchProgramacoesByIds(ids: string[]): Promise<Map<string, FirebaseFirestore.DocumentData>> {
  if (!ids.length) return new Map();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) {
    chunks.push(ids.slice(i, i + 10));
  }
  const results = new Map<string, FirebaseFirestore.DocumentData>();
  for (const chunk of chunks) {
    const snapshot = await adminDb.collection("programacoes_inspecao").where(FieldPath.documentId(), "in", chunk).get();
    snapshot.forEach(doc => {
      results.set(doc.id, doc.data() ?? {});
    });
  }
  return results;
}

async function fetchProgramacoesByOs(
  osNumbers: string[],
): Promise<Map<string, { id: string; data: FirebaseFirestore.DocumentData }>> {
  if (!osNumbers.length) return new Map();
  const chunks: string[][] = [];
  for (let i = 0; i < osNumbers.length; i += 10) {
    chunks.push(osNumbers.slice(i, i + 10));
  }
  const results = new Map<string, { id: string; data: FirebaseFirestore.DocumentData }>();
  for (const chunk of chunks) {
    const snapshot = await adminDb.collection("programacoes_inspecao").where("osNumero", "in", chunk).get();
    snapshot.forEach(doc => {
      const data = doc.data() ?? {};
      const os = typeof data.osNumero === "string" ? data.osNumero.trim().toUpperCase() : null;
      if (os) {
        results.set(os, { id: doc.id, data });
      }
    });
  }
  return results;
}

async function fetchInspectionsByIds(ids: string[]): Promise<Map<string, FirebaseFirestore.DocumentData>> {
  if (!ids.length) return new Map();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) {
    chunks.push(ids.slice(i, i + 10));
  }
  const results = new Map<string, FirebaseFirestore.DocumentData>();
  for (const chunk of chunks) {
    const snapshot = await adminDb.collection("inspecoes").where(FieldPath.documentId(), "in", chunk).get();
    snapshot.forEach(doc => {
      results.set(doc.id, doc.data() ?? {});
    });
  }
  return results;
}

function parseDateFilter(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function matchesSearch(record: SchedulingNCRecord, search: string | undefined) {
  if (!search) return true;
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    record.machine.nome,
    record.machine.tag,
    record.descricao,
    record.osNumero,
    record.programacao?.osNumero ?? null,
    record.programacao?.manutencao.tipo ?? null,
  ]
    .filter(Boolean)
    .map(value => value!.toLowerCase());
  return haystack.some(text => text.includes(normalized));
}

export async function getNCsForScheduling(filters: SchedulingFilters = {}): Promise<SchedulingNCRecord[]> {
  const issuesSnap = await adminDb.collection("issues").where("status", "==", "aberta").get();
  if (issuesSnap.empty) {
    return [];
  }

  const issueDocs = issuesSnap.docs.map(doc => ({ id: doc.id, data: doc.data() ?? {} }));
  const machineIds = Array.from(
    new Set(
      issueDocs
        .map(issue => (typeof issue.data.machineId === "string" ? issue.data.machineId : null))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const inspectionIds = Array.from(
    new Set(
      issueDocs
        .map(issue => (typeof issue.data.abertaEmInspecaoId === "string" ? issue.data.abertaEmInspecaoId : null))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [machines, inspectionsMap] = await Promise.all([
    getMachinesByIdsChunked(machineIds),
    fetchInspectionsByIds(inspectionIds),
  ]);

  const machineMap = new Map<string, (typeof machines)[number]>();
  machines.forEach(machine => {
    machineMap.set(machine.id, machine);
  });

  const inspectionMap = inspectionsMap;

  const programacaoIds = new Set<string>();
  const osNumbersNeeded = new Set<string>();
  issueDocs.forEach(issue => {
    const inspectionData = issue.data.abertaEmInspecaoId
      ? inspectionMap.get(String(issue.data.abertaEmInspecaoId))
      : undefined;
    const programacaoId = typeof inspectionData?.programacaoId === "string" ? inspectionData.programacaoId : null;
    if (programacaoId) {
      programacaoIds.add(programacaoId);
    } else {
      const osNumero =
        typeof issue.data.osNumero === "string"
          ? issue.data.osNumero.trim().toUpperCase()
          : typeof inspectionData?.osNumero === "string"
            ? inspectionData.osNumero.trim().toUpperCase()
            : null;
      if (osNumero) {
        osNumbersNeeded.add(osNumero);
      }
    }
  });

  const [programacaoById, programacaoByOs] = await Promise.all([
    fetchProgramacoesByIds(Array.from(programacaoIds)),
    fetchProgramacoesByOs(Array.from(osNumbersNeeded)),
  ]);

  const fromDate = parseDateFilter(filters.from);
  const toDate = parseDateFilter(filters.to);
  const areaFilter = filters.area ?? "todas";

  const records: SchedulingNCRecord[] = [];
  for (const issue of issueDocs) {
    const machine = typeof issue.data.machineId === "string" ? machineMap.get(issue.data.machineId) : undefined;
    const inspectionData = issue.data.abertaEmInspecaoId
      ? inspectionMap.get(String(issue.data.abertaEmInspecaoId))
      : undefined;
    const programacaoId = typeof inspectionData?.programacaoId === "string" ? inspectionData.programacaoId : null;
    const osNumero =
      typeof issue.data.osNumero === "string"
        ? issue.data.osNumero.trim().toUpperCase()
        : typeof inspectionData?.osNumero === "string"
          ? inspectionData.osNumero.trim().toUpperCase()
          : null;

    let programacaoData: FirebaseFirestore.DocumentData | undefined;
    let programacaoDocId: string | null = null;
    if (programacaoId && programacaoById.has(programacaoId)) {
      programacaoData = programacaoById.get(programacaoId);
      programacaoDocId = programacaoId;
    } else if (osNumero && programacaoByOs.has(osNumero)) {
      const resolved = programacaoByOs.get(osNumero)!;
      programacaoDocId = resolved.id;
      programacaoData = resolved.data;
    }

    const severity = parseSeverityState(issue.data.severity);
    const effectiveSeverity = getEffectiveSeverity(severity) ?? null;

    if (!severityWithinRange(effectiveSeverity, filters.minSeverity, filters.maxSeverity)) {
      continue;
    }

    const createdAt = normalizeIso(issue.data.createdAt);
    if (fromDate && createdAt) {
      const createdDate = new Date(createdAt);
      if (!Number.isNaN(createdDate.getTime()) && createdDate < fromDate) {
        continue;
      }
    }
    if (toDate && createdAt) {
      const createdDate = new Date(createdAt);
      if (!Number.isNaN(createdDate.getTime()) && createdDate > toDate) {
        continue;
      }
    }

    const area = inferArea(programacaoData?.manutencao?.tipo, machine?.setor);
    if (areaFilter !== "todas" && area !== areaFilter) {
      continue;
    }

    const responsavelRecord =
      programacaoData?.responsavel && typeof programacaoData.responsavel === "object"
        ? {
            maintId:
              typeof programacaoData.responsavel.maintId === "string"
                ? programacaoData.responsavel.maintId
                : null,
            nome:
              typeof programacaoData.responsavel.nome === "string"
                ? programacaoData.responsavel.nome
                : null,
            matricula:
              typeof programacaoData.responsavel.matricula === "string"
                ? programacaoData.responsavel.matricula
                : null,
          }
        : null;

    const responsaveisRecords = Array.isArray(programacaoData?.responsaveis)
      ? (programacaoData?.responsaveis as unknown[]).map(entry => {
          if (!entry || typeof entry !== "object") {
            return { maintId: null, nome: null, matricula: null };
          }
          const payload = entry as Record<string, unknown>;
          return {
            maintId: typeof payload.maintId === "string" ? payload.maintId : null,
            nome: typeof payload.nome === "string" ? payload.nome : null,
            matricula: typeof payload.matricula === "string" ? payload.matricula : null,
          };
        })
      : [];

    const record: SchedulingNCRecord = {
      id: issue.id,
      templateItemId: typeof issue.data.templateItemId === "string" ? issue.data.templateItemId : null,
      descricao: typeof issue.data.descricao === "string" ? issue.data.descricao : null,
      status: typeof issue.data.status === "string" ? issue.data.status : "aberta",
      createdAt,
      machine: {
        id: machine?.id ?? null,
        tag: typeof issue.data.tag === "string" ? issue.data.tag : machine?.tag ?? null,
        nome: machine?.nome ?? null,
        setor: machine?.setor ?? null,
        unidade: machine?.unidade ?? null,
        area,
      },
      osNumero,
      severity,
      effectiveSeverity,
      inspection: inspectionData
        ? {
            id: issue.data.abertaEmInspecaoId ? String(issue.data.abertaEmInspecaoId) : null,
            createdAt: normalizeIso(inspectionData.createdAt),
            maintainerNome:
              typeof inspectionData?.maintainer?.nome === "string" ? inspectionData.maintainer.nome : null,
          }
        : null,
      programacao: programacaoData
        ? {
            id: programacaoDocId,
            osNumero: typeof programacaoData.osNumero === "string" ? programacaoData.osNumero : null,
            status: typeof programacaoData.status === "string" ? programacaoData.status : null,
            manutencao: {
              tipo: typeof programacaoData.manutencao?.tipo === "string" ? programacaoData.manutencao.tipo : null,
              criticidade:
                typeof programacaoData.manutencao?.criticidade === "string"
                  ? programacaoData.manutencao.criticidade
                  : null,
              severity: programacaoData.manutencao?.severity
                ? parseSeverityState(programacaoData.manutencao.severity)
                : null,
            },
            datas: {
              emissao: normalizeIso(programacaoData.datas?.emissao),
              vencimento: normalizeIso(programacaoData.datas?.vencimento),
              programada: normalizeIso(programacaoData.datas?.programada),
              prazo: normalizeIso(programacaoData.datas?.prazo),
            },
            responsavel: responsavelRecord,
            responsaveis: responsaveisRecords,
          }
        : null,
    };

    if (!matchesSearch(record, filters.search)) {
      continue;
    }

    records.push(record);
  }

  records.sort((a, b) => {
    const severityA = a.effectiveSeverity ?? 0;
    const severityB = b.effectiveSeverity ?? 0;
    if (severityA !== severityB) {
      return severityB - severityA;
    }
    const dateA = a.createdAt ?? "";
    const dateB = b.createdAt ?? "";
    return dateB.localeCompare(dateA);
  });

  return records;
}

export async function getScheduleView(filters: ScheduleFilters = {}): Promise<ScheduleRecord[]> {
  const snapshot = await adminDb.collection("programacoes_inspecao").where("agendamento.status", "==", "programado").get();
  if (snapshot.empty) {
    return [];
  }

  const fromDate = parseDateFilter(filters.from);
  const toDate = parseDateFilter(filters.to);
  const minSeverity = filters.minSeverity;
  const areaFilter = filters.area ?? "todas";
  const responsavelId = filters.responsavelId?.trim();
  const searchTerm = filters.search?.trim().toLowerCase() ?? "";

  const records: ScheduleRecord[] = [];
  snapshot.forEach(doc => {
    const data = doc.data() ?? {};
    const programada = normalizeIso(data.datas?.programada);
    if (fromDate && programada) {
      const programadaDate = new Date(programada);
      if (!Number.isNaN(programadaDate.getTime()) && programadaDate < fromDate) {
        return;
      }
    }
    if (toDate && programada) {
      const programadaDate = new Date(programada);
      if (!Number.isNaN(programadaDate.getTime()) && programadaDate > toDate) {
        return;
      }
    }

    const severityState = data.manutencao?.severity ? parseSeverityState(data.manutencao.severity) : {};
    const effectiveSeverity = getEffectiveSeverity(severityState) ?? null;
    if (typeof minSeverity === "number" && effectiveSeverity !== null && effectiveSeverity < minSeverity) {
      return;
    }

    const area = inferArea(data.manutencao?.tipo, data.machine?.setor);
    if (areaFilter !== "todas" && area !== areaFilter) {
      return;
    }

    const responsavelMaintId = typeof data.responsavel?.maintId === "string" ? data.responsavel.maintId : null;
    const responsavelIds = Array.isArray(data.responsavelIds)
      ? (data.responsavelIds as unknown[]).filter((value): value is string => typeof value === "string")
      : [];
    if (responsavelId) {
      const matchesResponsavel =
        responsavelMaintId === responsavelId || responsavelIds.includes(responsavelId);
      if (!matchesResponsavel) {
        return;
      }
    }

    if (searchTerm) {
      const haystack = [
        typeof data.machine?.nome === "string" ? data.machine.nome : null,
        typeof data.machine?.tag === "string" ? data.machine.tag : null,
        typeof data.osNumero === "string" ? data.osNumero : null,
        typeof data.manutencao?.tipo === "string" ? data.manutencao.tipo : null,
      ]
        .filter(Boolean)
        .map(value => value!.toLowerCase());
      if (!haystack.some(entry => entry.includes(searchTerm))) {
        return;
      }
    }

    const responsaveisArray = Array.isArray(data.responsaveis)
      ? (data.responsaveis as Array<Record<string, unknown>>).map(item => ({
          nome: typeof item.nome === "string" ? item.nome : null,
          maintId: typeof item.maintId === "string" ? item.maintId : null,
          matricula: typeof item.matricula === "string" ? item.matricula : null,
        }))
      : [];

    records.push({
      id: doc.id,
      osNumero: typeof data.osNumero === "string" ? data.osNumero : null,
      status: typeof data.status === "string" ? data.status : null,
      machine: {
        tag: typeof data.machine?.tag === "string" ? data.machine.tag : null,
        nome: typeof data.machine?.nome === "string" ? data.machine.nome : null,
        setor: typeof data.machine?.setor === "string" ? data.machine.setor : null,
        unidade: typeof data.machine?.unidade === "string" ? data.machine.unidade : null,
        area,
      },
      manutencao: {
        tipo: typeof data.manutencao?.tipo === "string" ? data.manutencao.tipo : null,
        criticidade:
          typeof data.manutencao?.criticidade === "string" ? data.manutencao.criticidade : null,
        severity: data.manutencao?.severity ? parseSeverityState(data.manutencao.severity) : null,
      },
      datas: {
        programada,
        prazo: normalizeIso(data.datas?.prazo ?? data.datas?.prazoProgramado),
        vencimento: normalizeIso(data.datas?.vencimento),
      },
      responsavel: {
        nome: typeof data.responsavel?.nome === "string" ? data.responsavel.nome : null,
        maintId: responsavelMaintId,
        matricula: typeof data.responsavel?.matricula === "string" ? data.responsavel.matricula : null,
      },
      responsaveis: responsaveisArray,
      effectiveSeverity,
    });
  });

  records.sort((a, b) => {
    const severityA = a.effectiveSeverity ?? 0;
    const severityB = b.effectiveSeverity ?? 0;
    if (severityA !== severityB) {
      return severityB - severityA;
    }
    const dateA = a.datas.programada ?? "";
    const dateB = b.datas.programada ?? "";
    return dateA.localeCompare(dateB);
  });

  return records;
}

