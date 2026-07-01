import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { parse as parseDate, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { parseCsv } from "@/lib/csv";
import { normalizeName, normalizeWhitespace } from "@/lib/string-utils";
import { DEFAULT_MACHINE_TASK_CODE } from "@/lib/machines-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawRow = {
  [key: string]: string | undefined;
  NR_OS?: string;
  NR_MAQ?: string;
  "DESCRIÇÃO"?: string;
  CRITICIDADE?: string;
  COD_TAREFA?: string;
  DESC_TAREFA?: string;
  DT_EMISSÃO?: string;
  DT_VENCIMENTO?: string;
  PERIODICIDADE?: string;
  TIPO_O_S?: string;
  HO_ELÉTRICA?: string;
  HO_MECÂNICA?: string;
  HO_OUTRAS?: string;
  OFICINA_DESTINO?: string;
  TEMPO_PREV?: string;
  GUT?: string;
  SOLICITANTE?: string;
  LOCAL?: string;
  DT_FECHAMENTO?: string;
  "SITUAÇÃO_DA_O_S"?: string;
  SITUACAO_DA_O_S?: string;
  "TP_MANUT__PR__PD__CO__OU"?: string;
};

type MachineIndexRecord = {
  id: string;
  tag: string;
  nome?: string | null;
  templateId?: string | null;
  codTarefa?: string | null;
};

type MachinesIndex = {
  byTag: Map<string, MachineIndexRecord>;
  byId: Map<string, MachineIndexRecord>;
};

type MaintainerIndexRecord = {
  id: string;
  nome?: string | null;
  matricula?: string | null;
  normalizedName: string | null;
  machineIds: string[];
  machineTags: string[];
};

type MaintainersIndex = {
  byName: Map<string, MaintainerIndexRecord>;
  byMachineId: Map<string, MaintainerIndexRecord[]>;
  byMachineTag: Map<string, MaintainerIndexRecord[]>;
};

const REQUIRED_COLUMNS = [
  "NR_OS",
  "NR_MAQ",
  "DESCRIÇÃO",
  "DT_VENCIMENTO",
];

function parseCsvDate(value?: string) {
  if (!value) return { iso: undefined, timestamp: undefined };
  const trimmed = value.trim();
  if (!trimmed) return { iso: undefined, timestamp: undefined };
  const parsed = parseDate(trimmed, "dd/MM/yyyy", new Date(), { locale: ptBR });
  if (!isValid(parsed)) return { iso: undefined, timestamp: undefined };
  const utcDate = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  return { iso: utcDate.toISOString(), timestamp: Timestamp.fromDate(utcDate) };
}

function parseNumber(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/\./g, "").replace(/,/g, ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
}

function parseInteger(value?: string) {
  const num = parseNumber(value);
  if (typeof num !== "number") return undefined;
  return Number.isFinite(num) ? Math.round(num) : undefined;
}

function ensureNumber(value: number | undefined | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function fetchMachinesIndex(): Promise<MachinesIndex> {
  const collections = ["machines", "maquinas"] as const;
  const byTag = new Map<string, MachineIndexRecord>();
  const byId = new Map<string, MachineIndexRecord>();

  for (const collection of collections) {
    const snapshot = await adminDb.collection(collection).get();
    snapshot.forEach(doc => {
      const data = doc.data() ?? {};
      const rawTag = data.tag ?? data.TAG ?? doc.get("tag");
      const tag = rawTag != null ? String(rawTag).trim() : "";
      if (!tag) return;
      if (collection === "maquinas" && byTag.has(tag)) return;
      const rawCodTarefa = data.codTarefa ?? doc.get("codTarefa");
      const codTarefa = rawCodTarefa != null ? normalizeWhitespace(String(rawCodTarefa)) : "";
      const record: MachineIndexRecord = {
        id: doc.id,
        tag,
        nome: typeof data.nome === "string" ? data.nome : undefined,
        templateId: typeof data.templateId === "string" ? data.templateId : undefined,
        codTarefa: codTarefa || null,
      };
      byTag.set(tag, record);
      byId.set(doc.id, record);
    });
  }

  return { byTag, byId };
}

function sanitizeMaintainerMachines(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map(item => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  );
}

function addMaintainerToMap(
  map: Map<string, MaintainerIndexRecord[]>,
  key: string,
  record: MaintainerIndexRecord,
) {
  const list = map.get(key) ?? [];
  if (!list.some(existing => existing.id === record.id)) {
    list.push(record);
    map.set(key, list);
  }
}

async function fetchMaintainersIndex(machinesIndex: MachinesIndex): Promise<MaintainersIndex> {
  const snapshot = await adminDb.collection("mantenedores").get();
  const byName = new Map<string, MaintainerIndexRecord>();
  const byMachineId = new Map<string, MaintainerIndexRecord[]>();
  const byMachineTag = new Map<string, MaintainerIndexRecord[]>();

  snapshot.forEach(doc => {
    const data = doc.data() ?? {};
    const nome = typeof data.nome === "string" ? data.nome : undefined;
    const matricula = typeof data.matricula === "string" ? data.matricula : undefined;
    const normalized = normalizeName(nome ?? undefined) || null;
    const rawMachineRefs = sanitizeMaintainerMachines(data.machines);

    const resolvedMachineIds = new Set<string>();
    const resolvedMachineTags = new Set<string>();

    rawMachineRefs.forEach(ref => {
      if (!ref) return;
      const byIdRecord = machinesIndex.byId.get(ref);
      const byTagRecord = machinesIndex.byTag.get(ref);
      let matched = false;

      if (byIdRecord) {
        resolvedMachineIds.add(byIdRecord.id);
        if (byIdRecord.tag) {
          resolvedMachineTags.add(byIdRecord.tag);
        }
        matched = true;
      }

      if (byTagRecord) {
        resolvedMachineIds.add(byTagRecord.id);
        if (byTagRecord.tag) {
          resolvedMachineTags.add(byTagRecord.tag);
        }
        matched = true;
      }

      if (!matched) {
        resolvedMachineIds.add(ref);
        resolvedMachineTags.add(ref);
      }
    });

    const record: MaintainerIndexRecord = {
      id: doc.id,
      nome,
      matricula,
      normalizedName: normalized,
      machineIds: Array.from(resolvedMachineIds),
      machineTags: Array.from(resolvedMachineTags),
    };

    if (normalized && !byName.has(normalized)) {
      byName.set(normalized, record);
    }

    record.machineIds.forEach(machineId => {
      if (!machineId) return;
      addMaintainerToMap(byMachineId, machineId, record);
    });

    record.machineTags.forEach(machineTag => {
      if (!machineTag) return;
      addMaintainerToMap(byMachineTag, machineTag, record);
    });
  });

  return { byName, byMachineId, byMachineTag };
}

async function deletePreviousBatch(previousBatchId: string) {
  const snap = await adminDb
    .collection("programacoes_inspecao")
    .where("batchId", "==", previousBatchId)
    .get();
  if (snap.empty) return;
  let batch = adminDb.batch();
  let count = 0;
  const commits: Array<Promise<unknown>> = [];

  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count += 1;
    if (count >= 400) {
      commits.push(batch.commit());
      batch = adminDb.batch();
      count = 0;
    }
  }

  if (count > 0) {
    commits.push(batch.commit());
  }

  await Promise.all(commits);
}

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("adminSess")?.value;
  if (!cookie) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let uploaderUid: string | null = null;
  let uploaderName: string | null = null;

  try {
    const decoded = await adminAuth.verifySessionCookie(cookie, true);
    uploaderUid = decoded.uid;
    try {
      const userRecord = await adminAuth.getUser(decoded.uid);
      uploaderName = userRecord.displayName ?? userRecord.email ?? userRecord.phoneNumber ?? null;
    } catch {
      uploaderName = null;
    }
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseCsv(buffer, { skipEmptyLines: true }) as RawRow[];

    if (!rows.length) {
      return NextResponse.json({ error: "EMPTY_CSV" }, { status: 400 });
    }

    const columns = Object.keys(rows[0] ?? {});
    const missingColumns = REQUIRED_COLUMNS.filter(column => !columns.includes(column));
    if (missingColumns.length) {
      return NextResponse.json(
        { error: "MISSING_COLUMNS", missingColumns },
        { status: 400 },
      );
    }

    const machinesIndex = await fetchMachinesIndex();
    const maintainersIndex = await fetchMaintainersIndex(machinesIndex);

    const batchId = new Date().toISOString();
    const cfgRef = adminDb.collection("config_programacao").doc("activeBatch");
    const previousConfig = await cfgRef.get();
    const previousBatchId = previousConfig.exists ? (previousConfig.data()?.batchIdAtual as string | undefined) : undefined;

    if (previousBatchId) {
      await deletePreviousBatch(previousBatchId);
    }

    const seenDocIds = new Set<string>();
    const validationErrors: string[] = [];
    let imported = 0;

    let writeBatch = adminDb.batch();
    let batchCount = 0;
    const batchCommits: Array<Promise<unknown>> = [];
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const rawOs = row.NR_OS?.trim();
      const rawTag = row.NR_MAQ?.trim();
      const descricao = row["DESCRIÇÃO"]?.trim();
      const vencimento = row.DT_VENCIMENTO?.trim();

      if (!rawOs || !rawTag || !descricao || !vencimento) {
        validationErrors.push(`Linha ${rowNumber}: NR_OS, NR_MAQ, DESCRIÇÃO e DT_VENCIMENTO são obrigatórios.`);
        return;
      }

      const vencimentoInfo = parseCsvDate(vencimento);
      if (!vencimentoInfo.iso) {
        validationErrors.push(`Linha ${rowNumber}: data de vencimento inválida.`);
        return;
      }

      const emissaoInfo = parseCsvDate(row.DT_EMISSÃO);
      const fechamentoInfo = parseCsvDate(row.DT_FECHAMENTO);

      const docId = `${batchId}__${rawOs}`;
      if (seenDocIds.has(docId)) {
        validationErrors.push(`Linha ${rowNumber}: duplicada para OS ${rawOs}.`);
        return;
      }
      seenDocIds.add(docId);

      const tag = rawTag.trim();
      const machineRecord = machinesIndex.byTag.get(tag);

      const csvResponsavelNomeRaw = normalizeWhitespace(row.SOLICITANTE);
      const csvResponsavelNome = csvResponsavelNomeRaw || undefined;
      const csvResponsavelNormalized = normalizeName(csvResponsavelNome ?? undefined) || null;

      const maintainerCandidatesMap = new Map<string, MaintainerIndexRecord>();

      if (machineRecord?.id) {
        (maintainersIndex.byMachineId.get(machineRecord.id) ?? []).forEach(maint => {
          maintainerCandidatesMap.set(maint.id, maint);
        });
      }

      if (tag) {
        (maintainersIndex.byMachineTag.get(tag) ?? []).forEach(maint => {
          maintainerCandidatesMap.set(maint.id, maint);
        });
      }

      const machineMaintainers = Array.from(maintainerCandidatesMap.values());

      const maintainerCandidates = new Map<string, MaintainerIndexRecord>();
      machineMaintainers.forEach(maint => {
        maintainerCandidates.set(maint.id, maint);
      });

      let maintainerMatchedByName: MaintainerIndexRecord | undefined;
      if (csvResponsavelNormalized) {
        maintainerMatchedByName = maintainersIndex.byName.get(csvResponsavelNormalized) ?? undefined;
        if (maintainerMatchedByName) {
          maintainerCandidates.set(maintainerMatchedByName.id, maintainerMatchedByName);
        }
      }

      const orderedMaintainers = Array.from(maintainerCandidates.values()).sort((a, b) => {
        const aMatchesMachine =
          (machineRecord?.id && a.machineIds.includes(machineRecord.id)) ||
          (tag ? a.machineTags.includes(tag) : false);
        const bMatchesMachine =
          (machineRecord?.id && b.machineIds.includes(machineRecord.id)) ||
          (tag ? b.machineTags.includes(tag) : false);

        if (aMatchesMachine && !bMatchesMachine) return -1;
        if (!aMatchesMachine && bMatchesMachine) return 1;

        const aName = a.nome?.toLocaleLowerCase("pt-BR") ?? "";
        const bName = b.nome?.toLocaleLowerCase("pt-BR") ?? "";
        if (aName && bName) return aName.localeCompare(bName);
        if (aName) return -1;
        if (bName) return 1;
        return a.id.localeCompare(b.id);
      });
      const primaryMaintainer = orderedMaintainers[0] ?? maintainerMatchedByName ?? machineMaintainers[0];

      const resolvedResponsavelNome = primaryMaintainer?.nome && primaryMaintainer.nome.trim().length > 0
        ? primaryMaintainer.nome
        : csvResponsavelNome ?? null;

      const responsavelNormalizedRaw = normalizeName(resolvedResponsavelNome ?? undefined);
      const responsavelNormalized = responsavelNormalizedRaw || null;

      let responsaveis = orderedMaintainers.map(maint => ({
        maintId: maint.id,
        nome: maint.nome ?? null,
        matricula: maint.matricula ?? null,
        origem:
          (machineRecord?.id && maint.machineIds.includes(machineRecord.id)) ||
          (tag ? maint.machineTags.includes(tag) : false)
            ? "machine"
            : "nome",
      }));

      if (responsaveis.length === 0 && primaryMaintainer) {
        responsaveis = [
          {
            maintId: primaryMaintainer.id,
            nome: primaryMaintainer.nome ?? null,
            matricula: primaryMaintainer.matricula ?? null,
            origem:
              (machineRecord?.id && primaryMaintainer.machineIds.includes(machineRecord.id)) ||
              (tag ? primaryMaintainer.machineTags.includes(tag) : false)
                ? "machine"
                : "nome",
          },
        ];
      }

      const responsavelIds = Array.from(new Set(responsaveis.map(resp => resp.maintId).filter(Boolean))) as string[];
      const responsavelNomesNormalizados = new Set<string>();
      orderedMaintainers.forEach(maint => {
        const normalized = normalizeName(maint.nome ?? undefined);
        if (normalized) {
          responsavelNomesNormalizados.add(normalized);
        }
      });
      if (!orderedMaintainers.length && primaryMaintainer) {
        const normalizedPrimary = normalizeName(primaryMaintainer.nome ?? undefined);
        if (normalizedPrimary) {
          responsavelNomesNormalizados.add(normalizedPrimary);
        }
      }
      if (csvResponsavelNormalized) {
        responsavelNomesNormalizados.add(csvResponsavelNormalized);
      }

      const periodicidade = parseInteger(row.PERIODICIDADE);
      const tempoPrevisto = parseNumber(row.TEMPO_PREV);

      const horasEletrica = parseNumber(row.HO_ELÉTRICA);
      const horasMecanica = parseNumber(row.HO_MECÂNICA);
      const horasOutras = parseNumber(row.HO_OUTRAS);

      const gut = ensureNumber(parseNumber(row.GUT));

      const isLate = startOfToday.getTime() > new Date(vencimentoInfo.iso).getTime();

      const csvCodTarefa = normalizeWhitespace(row.COD_TAREFA);
      const configuredCodTarefa = machineRecord?.codTarefa || "";
      const expectedCodTarefa = configuredCodTarefa || DEFAULT_MACHINE_TASK_CODE;

      if (!csvCodTarefa) {
        validationErrors.push(
          `Linha ${rowNumber}: COD_TAREFA vazio. Informe ${expectedCodTarefa} para importar a programação de rota.`,
        );
        return;
      }

      if (csvCodTarefa !== expectedCodTarefa) {
        validationErrors.push(
          machineRecord
            ? `Linha ${rowNumber}: COD_TAREFA ${csvCodTarefa} difere do código configurado (${expectedCodTarefa}) para a máquina ${tag}.`
            : `Linha ${rowNumber}: COD_TAREFA ${csvCodTarefa} diferente do código padrão (${expectedCodTarefa}) utilizado para inspeções de rota.`,
        );
        return;
      }

      const data = {
        batchId,
        osNumero: rawOs,
        machine: {
          tag,
          nome: descricao,
          machineId: machineRecord?.id ?? null,
          templateId: machineRecord?.templateId ?? null,
          codTarefaConfigurado: configuredCodTarefa || null,
          machineNotFound: !machineRecord,
        },
        manutencao: {
          tipo: normalizeWhitespace(row["TP_MANUT__PR__PD__CO__OU"] ?? ""),
          criticidade: normalizeWhitespace(row.CRITICIDADE ?? ""),
          descricaoTarefa: normalizeWhitespace(row.DESC_TAREFA ?? ""),
          codTarefa: csvCodTarefa,
          periodicidade: periodicidade ?? null,
        },
        datas: {
          emissao: emissaoInfo.iso ?? null,
          emissaoDate: emissaoInfo.timestamp ?? null,
          vencimento: vencimentoInfo.iso,
          vencimentoDate: vencimentoInfo.timestamp,
          fechamento: fechamentoInfo.iso ?? null,
          fechamentoDate: fechamentoInfo.timestamp ?? null,
        },
        responsavel: {
          nome: resolvedResponsavelNome,
          nomeNormalizado: responsavelNormalized,
          maintId: primaryMaintainer?.id ?? null,
          matricula: primaryMaintainer?.matricula ?? null,
          origem: primaryMaintainer
            ? (machineRecord?.id && primaryMaintainer.machineIds.includes(machineRecord.id)) ||
              (tag ? primaryMaintainer.machineTags.includes(tag) : false)
              ? "machine"
              : "nome"
            : csvResponsavelNome
              ? "csv"
              : null,
        },
        responsaveis,
        responsavelIds,
        responsavelNomesNormalizados: Array.from(responsavelNomesNormalizados),
        oficinaDestino: normalizeWhitespace(row.OFICINA_DESTINO),
        gut: gut ?? null,
        tempoPrevistoHoras: tempoPrevisto ?? null,
        tipoOS: normalizeWhitespace(row.TIPO_O_S),
        situacaoOS: normalizeWhitespace(row.SITUACAO_DA_O_S ?? row["SITUAÇÃO_DA_O_S"]),
        horasEstimadas: {
          eletrica: horasEletrica ?? null,
          mecanica: horasMecanica ?? null,
          outras: horasOutras ?? null,
        },
        status: "PENDENTE",
        atrasada: isLate,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      const ref = adminDb.collection("programacoes_inspecao").doc(docId);
      writeBatch.set(ref, data);
      imported += 1;
      batchCount += 1;

      if (batchCount >= 400) {
        batchCommits.push(writeBatch.commit());
        writeBatch = adminDb.batch();
        batchCount = 0;
      }
    });

    if (batchCount > 0) {
      batchCommits.push(writeBatch.commit());
    }

    if (batchCommits.length) {
      await Promise.all(batchCommits);
    }

    await cfgRef.set(
      {
        batchIdAtual: batchId,
        uploadedAt: FieldValue.serverTimestamp(),
        uploadedBy: uploaderUid
          ? {
              uid: uploaderUid,
              name: uploaderName ?? null,
            }
          : null,
      },
      { merge: true },
    );

    return NextResponse.json({
      batchId,
      totalLidas: rows.length,
      totalImportadas: imported,
      errosValidacao: validationErrors,
    });
  } catch (error: unknown) {
    console.error("[programacao-upload] failed to import CSV", error);
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
