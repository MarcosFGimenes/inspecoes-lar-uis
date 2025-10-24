import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";

type TreatmentStatus = "open" | "in_progress" | "resolved";

function toIso(value: unknown) {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
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

function normalizeAnswers(data: Record<string, unknown>) {
  const answers = Array.isArray(data.answers) ? (data.answers as Array<Record<string, unknown>>) : [];
  if (answers.length > 0) {
    return answers
      .filter(answer => answer?.questionId)
      .map(answer => ({
        questionId: String(answer.questionId),
        questionText:
          typeof answer.questionText === "string"
            ? answer.questionText
            : typeof answer.criterio === "string"
            ? answer.criterio
            : typeof answer.componente === "string"
            ? answer.componente
            : `Item ${answer.questionId}`,
        response: String(answer.response || "c").toLowerCase(),
        observation: typeof answer.observation === "string" ? answer.observation : null,
        summary: typeof answer.summary === "string" ? answer.summary : null,
      }));
  }

  const itens = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
  return itens
    .filter(item => item?.templateItemId)
    .map(item => {
      const questionId = String(item.templateItemId);
      const resultado = String(item.resultado || "c").toLowerCase();
      const response = resultado === "nc" ? "nc" : resultado === "na" ? "na" : "c";
      return {
        questionId,
        questionText:
          typeof item.oQueChecar === "string"
            ? item.oQueChecar
            : typeof item.criterio === "string"
            ? item.criterio
            : typeof item.componente === "string"
            ? item.componente
            : `Item ${questionId}`,
        response,
        observation: typeof item.observacaoItem === "string" ? item.observacaoItem : null,
        summary: typeof item.summary === "string" ? item.summary : null,
      };
    });
}

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const limitParam = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "120", 10);
  const limitValue = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 300) : 120;

  const responsesSnap = await adminDb
    .collection("inspecoes")
    .orderBy("createdAt", "desc")
    .limit(limitValue)
    .get();

  const options: Array<{
    id: string;
    responseId: string;
    questionId: string;
    questionText: string;
    summary: string;
    status: TreatmentStatus;
    observation: string | null;
    dueDate: string | null;
    checklistDate: string | null;
    machine: { id: string | null; nome: string | null; tag: string | null };
    maintainer: { nome: string | null; matricula: string | null };
  }> = [];

  responsesSnap.forEach(doc => {
    const data = doc.data() ?? {};
    const machine = (data.machine ?? {}) as Record<string, unknown>;
    const maintainer = (data.maintainer ?? {}) as Record<string, unknown>;
    const answers = normalizeAnswers(data).filter(answer => answer.response === "nc");
    if (answers.length === 0) return;

    const treatments = Array.isArray(data.nonConformityTreatments)
      ? (data.nonConformityTreatments as Array<Record<string, unknown>>)
      : [];
    const treatmentMap = new Map<string, Record<string, unknown>>();
    treatments.forEach(item => {
      if (typeof item?.questionId === "string") {
        treatmentMap.set(String(item.questionId), item);
      }
    });

    answers.forEach(answer => {
      const treatment = treatmentMap.get(answer.questionId);
      const status = typeof treatment?.status === "string" ? (treatment.status as TreatmentStatus) : "open";
      if (status === "resolved") return;
      const dueDate = toIso(treatment?.dueDate) ?? null;
      const summary =
        typeof treatment?.summary === "string" && treatment.summary.trim()
          ? treatment.summary.trim()
          : answer.summary && answer.summary.trim()
          ? answer.summary.trim()
          : answer.questionText;

      options.push({
        id: `${doc.id}:${answer.questionId}`,
        responseId: doc.id,
        questionId: answer.questionId,
        questionText: answer.questionText,
        summary,
        status,
        observation: answer.observation ?? null,
        dueDate,
        checklistDate: toIso(data.createdAt) ?? toIso(data.finalizadaEm) ?? null,
        machine: {
          id: machine.machineId ? String(machine.machineId) : machine.id ? String(machine.id) : null,
          nome: machine.nome ? String(machine.nome) : null,
          tag: machine.tag ? String(machine.tag) : null,
        },
        maintainer: {
          nome: maintainer.nome ? String(maintainer.nome) : null,
          matricula: maintainer.matricula ? String(maintainer.matricula) : null,
        },
      });
    });
  });

  options.sort((a, b) => {
    const statusWeight = (status: TreatmentStatus) => {
      if (status === "open") return 0;
      if (status === "in_progress") return 1;
      return 2;
    };
    const diff = statusWeight(a.status) - statusWeight(b.status);
    if (diff !== 0) return diff;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.summary.localeCompare(b.summary);
  });

  return NextResponse.json(options);
}
