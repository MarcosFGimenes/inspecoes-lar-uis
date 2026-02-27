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

function jsonNoStore(payload: unknown, init?: Parameters<typeof NextResponse.json>[1]) {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  return response;
}

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const snap = await adminDb.collection(COLLECTION).doc(DOC_ID).get();
    const data = snap.data() ?? {};
    return jsonNoStore({
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

  const isoHeaderConfig = sanitizeIsoHeaderConfig(body?.isoHeaderConfig);
  const updatedAt = new Date().toISOString();

  try {
    const docRef = adminDb.collection(COLLECTION).doc(DOC_ID);
    await docRef.set(
      {
        isoHeaderConfig,
        updatedAt,
        type: "cabecalho_inspecao",
      },
      { mergeFields: ["isoHeaderConfig", "updatedAt", "type"] }
    );

    return jsonNoStore({
      ok: true,
      isoHeaderConfig,
      updatedAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

