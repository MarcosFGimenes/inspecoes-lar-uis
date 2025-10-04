import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireMaint } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export async function GET(req: NextRequest) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  const tag = req.nextUrl.searchParams.get("tag")?.trim();
  if (!tag) {
    return NextResponse.json({ error: "TAG_REQUIRED" }, { status: 400 });
  }

  try {
    const machineQuery = await adminDb
      .collection("machines")
      .where("tag", "==", tag)
      .limit(1)
      .get();

    if (machineQuery.empty) {
      return NextResponse.json({ error: "MACHINE_NOT_FOUND" }, { status: 404 });
    }

    const machineDoc = machineQuery.docs[0]!;
    const machineData = machineDoc.data();

    if (machineData?.ativo === false) {
      return NextResponse.json({ error: "MACHINE_INACTIVE" }, { status: 403 });
    }

    const maintDoc = await adminDb.collection("mantenedores").doc(auth.store.id!).get();
    if (!maintDoc.exists) {
      return NextResponse.json({ error: "MAINTAINER_NOT_FOUND" }, { status: 403 });
    }

    const maintMachines = Array.isArray(maintDoc.data()?.machines)
      ? (maintDoc.data()?.machines as string[])
      : [];

    if (!maintMachines.includes(machineDoc.id)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const templateId = String(machineData.templateId ?? "").trim();
    if (!templateId) {
      return NextResponse.json({ error: "TEMPLATE_NOT_DEFINED" }, { status: 400 });
    }

    const templateSnap = await adminDb.collection("templates").doc(templateId).get();
    if (!templateSnap.exists) {
      return NextResponse.json({ error: "TEMPLATE_NOT_FOUND" }, { status: 404 });
    }

    const templateData = templateSnap.data() ?? {};

    const issuesSnap = await adminDb
      .collection("issues")
      .where("machineId", "==", machineDoc.id)
      .where("status", "==", "aberta")
      .get();

    const openIssues = issuesSnap.docs.map(doc => {
      const data = doc.data() ?? {};
      return {
        id: doc.id,
        templateItemId: data.templateItemId ?? null,
        descricao: data.descricao ?? null,
        osNumero: data.osNumero ?? null,
        createdAt: data.createdAt ?? null,
      };
    });

    return NextResponse.json({
      maintainer: {
        id: auth.store.id!,
        nome: auth.store.nome ?? null,
        matricula: auth.store.matricula ?? null,
      },
      machine: {
        id: machineDoc.id,
        tag: machineData.tag ?? null,
        nome: machineData.nome ?? null,
        setor: machineData.setor ?? null,
        unidade: machineData.unidade ?? null,
        localUnidade: machineData.localUnidade ?? null,
        lac: machineData.lac ?? null,
        fotoUrl: machineData.fotoUrl ?? null,
        templateId,
      },
      template: {
        id: templateSnap.id,
        nome: templateData.nome ?? null,
        imagemUrl: templateData.imagemUrl ?? null,
        itens: Array.isArray(templateData.itens) ? templateData.itens : [],
      },
      openIssues,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: extractMessage(error, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}
