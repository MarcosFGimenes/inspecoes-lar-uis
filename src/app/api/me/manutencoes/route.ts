import type { DocumentData, DocumentSnapshot } from "firebase-admin/firestore";

import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";
import { normalizeName } from "@/lib/string-utils";

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
      const [byIdSnap, idsSnap] = await Promise.all([
        adminDb.collection("programacoes_manutencao").where("responsavelId", "==", maintId).get(),
        adminDb.collection("programacoes_manutencao").where("responsavelIds", "array-contains", maintId).get(),
      ]);
      byIdSnap.forEach(doc => {
        docsMap.set(doc.id, doc);
      });
      idsSnap.forEach(doc => {
        docsMap.set(doc.id, doc);
      });
    }

    if (normalizedName) {
      const namesSnap = await adminDb
        .collection("programacoes_manutencao")
        .where("responsavelNomesNormalizados", "array-contains", normalizedName)
        .get();
      namesSnap.forEach(doc => {
        docsMap.set(doc.id, doc);
      });
    }

    const records = Array.from(docsMap.values()).map(doc => ({ id: doc.id, data: doc.data() ?? {} }));

    records.sort((a, b) => {
      const statusWeight = (value: unknown) => {
        if (value === "PENDENTE") return 0;
        if (value === "EM_ANDAMENTO") return 1;
        return 2;
      };
      const statusDiff = statusWeight(a.data.status) - statusWeight(b.data.status);
      if (statusDiff !== 0) return statusDiff;
      const prazoA = toIso(a.data.prazoIso) ?? toIso(a.data.prazoTimestamp);
      const prazoB = toIso(b.data.prazoIso) ?? toIso(b.data.prazoTimestamp);
      if (prazoA && prazoB) return prazoA.localeCompare(prazoB);
      if (prazoA) return -1;
      if (prazoB) return 1;
      return a.id.localeCompare(b.id);
    });

    const items = records.map(record => {
      const data = record.data;
      return {
        id: record.id,
        pendencia: typeof data.pendencia === "string" ? data.pendencia : "",
        detalhes: typeof data.detalhes === "string" ? data.detalhes : null,
        origem: data.origem === "NC" ? "NC" : "MANUAL",
        status: typeof data.status === "string" ? data.status : "PENDENTE",
        prazo: toIso(data.prazoIso) ?? toIso(data.prazoTimestamp) ?? null,
        createdAt: toIso(data.createdAt) ?? null,
        updatedAt: toIso(data.updatedAt) ?? null,
        nc: data.nc && typeof data.nc === "object"
          ? {
              responseId: typeof data.nc.responseId === "string" ? data.nc.responseId : null,
              questionId: typeof data.nc.questionId === "string" ? data.nc.questionId : null,
              summary: typeof data.nc.summary === "string" ? data.nc.summary : null,
              questionText: typeof data.nc.questionText === "string" ? data.nc.questionText : null,
              machineId: typeof data.nc.machineId === "string" ? data.nc.machineId : null,
              machineTag: typeof data.nc.machineTag === "string" ? data.nc.machineTag : null,
              machineName: typeof data.nc.machineName === "string" ? data.nc.machineName : null,
              checklistDate: toIso(data.nc.checklistDate) ?? null,
            }
          : null,
      };
    });

    return NextResponse.json(items);
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
