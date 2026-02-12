import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminFromRequest } from "@/lib/guards";
import { sanitizeIsoHeaderConfig } from "@/lib/iso-header-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "config_inspecao";
const DOC_ID = "cabecalho_iso_global";

type UpdateBody = {
  isoHeaderConfig?: unknown;
};

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const snap = await adminDb.collection(COLLECTION).doc(DOC_ID).get();
    const data = snap.data() ?? {};
    return NextResponse.json({
      isoHeaderConfig: sanitizeIsoHeaderConfig(data.isoHeaderConfig),
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 422 });
  }

  console.log("[DEBUG] Dados recebidos no PUT:", JSON.stringify(body?.isoHeaderConfig, null, 2));

  const isoHeaderConfig = sanitizeIsoHeaderConfig(body?.isoHeaderConfig);
  const updatedAt = new Date().toISOString();

  console.log("[DEBUG] Dados após sanitização:", JSON.stringify(isoHeaderConfig, null, 2));

  try {
    const docRef = adminDb.collection(COLLECTION).doc(DOC_ID);
    
    console.log("[DEBUG] Salvando no Firestore...");
    await docRef.set(
      {
        isoHeaderConfig,
        updatedAt,
        type: "cabecalho_inspecao",
      },
      { merge: true }
    );

    const savedSnap = await docRef.get();
    const savedData = savedSnap.data() ?? {};

    console.log("[DEBUG] Dados recuperados do Firestore:", JSON.stringify(savedData.isoHeaderConfig, null, 2));

    return NextResponse.json({
      ok: true,
      isoHeaderConfig: sanitizeIsoHeaderConfig(savedData.isoHeaderConfig),
      updatedAt: typeof savedData.updatedAt === "string" ? savedData.updatedAt : updatedAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    console.error("[DEBUG] Erro ao salvar:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

