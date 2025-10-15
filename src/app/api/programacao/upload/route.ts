import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { parse as parseDate, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { parseCsv } from "@/lib/csv";
import { normalizeName, normalizeWhitespace } from "@/lib/string-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawRow = {
  [key: string]: string;
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
  nome?: string | null;
  templateId?: string | null;
};

type MaintainerIndexRecord = {
  id: string;
  nome?: string | null;
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

async function fetchMachinesIndex() {
  const collections = ["machines", "maquinas"] as const;
  const index = new Map<string, MachineIndexRecord>();

  for (const collection of collections) {
    const snapshot = await adminDb.collection(collection).get();
    snapshot.forEach(doc => {
      const data = doc.data() ?? {};
      const rawTag = data.tag ?? data.TAG ?? doc.get("tag");
      const tag = rawTag != null ? String(rawTag).trim() : "";
      if (!tag) return;
      if (collection === "maquinas" && index.has(tag)) return;
      index.set(tag, {
        id: doc.id,
        nome: typeof data.nome === "string" ? data.nome : undefined,
        templateId: typeof data.templateId === "string" ? data.templateId : undefined,
      });
    });
  }

  return index;
}

async function fetchMaintainersIndex() {
  const snapshot = await adminDb.collection("mantenedores").get();
  const index = new Map<string, MaintainerIndexRecord>();
  snapshot.forEach(doc => {
    const data = doc.data() ?? {};
    const nome = typeof data.nome === "string" ? data.nome : undefined;
    const normalized = normalizeName(nome ?? undefined);
    if (!normalized) return;
    if (!index.has(normalized)) {
      index.set(normalized, { id: doc.id, nome });
    }
  });
  return index;
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = parseCsv(buffer, { delimiter: ",", skipEmptyLines: true }) as RawRow[];

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

  const [machinesIndex, maintainersIndex] = await Promise.all([
    fetchMachinesIndex(),
    fetchMaintainersIndex(),
  ]);

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
    const machineRecord = machinesIndex.get(tag);

    const responsavelNome = normalizeWhitespace(row.SOLICITANTE ?? "");
    const responsavelNormalized = normalizeName(responsavelNome);
    const maintMatch = responsavelNormalized ? maintainersIndex.get(responsavelNormalized) : undefined;

    const periodicidade = parseInteger(row.PERIODICIDADE);
    const tempoPrevisto = parseNumber(row.TEMPO_PREV);

    const horasEletrica = parseNumber(row.HO_ELÉTRICA);
    const horasMecanica = parseNumber(row.HO_MECÂNICA);
    const horasOutras = parseNumber(row.HO_OUTRAS);

    const gut = ensureNumber(parseNumber(row.GUT));

    const isLate = startOfToday.getTime() > new Date(vencimentoInfo.iso).getTime();

    const data = {
      batchId,
      osNumero: rawOs,
      machine: {
        tag,
        nome: descricao,
        machineId: machineRecord?.id,
        templateId: machineRecord?.templateId,
        machineNotFound: !machineRecord,
      },
      manutencao: {
        tipo: normalizeWhitespace(row["TP_MANUT__PR__PD__CO__OU"] ?? ""),
        criticidade: normalizeWhitespace(row.CRITICIDADE ?? ""),
        descricaoTarefa: normalizeWhitespace(row.DESC_TAREFA ?? ""),
        codTarefa: normalizeWhitespace(row.COD_TAREFA ?? ""),
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
        nome: responsavelNome,
        nomeNormalizado: responsavelNormalized || null,
        maintId: maintMatch?.id ?? null,
      },
      oficinaDestino: normalizeWhitespace(row.OFICINA_DESTINO ?? ""),
      gut: gut ?? null,
      tempoPrevistoHoras: tempoPrevisto ?? null,
      tipoOS: normalizeWhitespace(row.TIPO_O_S ?? ""),
      situacaoOS: normalizeWhitespace(row.SITUACAO_DA_O_S ?? row["SITUAÇÃO_DA_O_S"] ?? ""),
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
}
