import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import type { ChecklistAnswer } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResponseItem = {
  id: string;
  machineId: string | null;
  templateId: string | null;
  createdAt: string | null;
  operatorNome: string | null;
  operatorMatricula: string | null;
  hasNC: boolean;
  qtdNC: number;
  machineTag: string | null;
  machineNome: string | null;
};

function normalizeAnswers(data: Record<string, unknown>): ChecklistAnswer[] {
  const answers = Array.isArray(data.answers) ? (data.answers as ChecklistAnswer[]) : [];
  if (answers.length > 0) {
    return answers
      .filter(item => item?.questionId)
      .map(item => ({
        ...item,
        response: item.response === "nc" || item.response === "c" || item.response === "na" ? item.response : "c",
        photoUrls: Array.isArray(item.photoUrls) ? item.photoUrls.filter(Boolean) : [],
      }));
  }

  const itens = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
  return itens
    .filter(item => item?.templateItemId)
    .map(item => ({
      questionId: String(item.templateItemId),
      questionText: typeof item.componente === "string" ? item.componente : undefined,
      response: String(item.resultado || "C").toLowerCase() === "nc" ? "nc" : String(item.resultado || "C").toLowerCase() === "na" ? "na" : "c",
      observation: typeof item.observacaoItem === "string" ? item.observacaoItem : undefined,
      photoUrls: Array.isArray(item.fotos) ? item.fotos.filter(Boolean).map(String) : [],
    }));
}

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const snapshot = await adminDb
      .collection("inspecoes")
      .orderBy("createdAt", "desc")
      .limit(300)
      .get();

    const items: ResponseItem[] = [];

    snapshot.docs.forEach(doc => {
      const data = doc.data() ?? {};
      if (data.pcmSign) return;
      const answers = normalizeAnswers(data);
      const ncAnswers = answers.filter(answer => answer.response === "nc");
      const machine = (data.machine ?? {}) as Record<string, unknown>;
      const template = (data.template ?? {}) as Record<string, unknown>;
      const maintainer = (data.maintainer ?? {}) as Record<string, unknown>;

      items.push({
        id: doc.id,
        machineId: machine.machineId ? String(machine.machineId) : null,
        templateId: template.id ? String(template.id) : machine.templateId ? String(machine.templateId) : null,
        createdAt: data.createdAt ? String(data.createdAt) : null,
        operatorNome: maintainer.nome ? String(maintainer.nome) : null,
        operatorMatricula: maintainer.matricula ? String(maintainer.matricula) : null,
        hasNC: ncAnswers.length > 0,
        qtdNC: ncAnswers.length,
        machineTag: machine.tag ? String(machine.tag) : null,
        machineNome: machine.nome ? String(machine.nome) : null,
      });
    });

    return NextResponse.json(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
