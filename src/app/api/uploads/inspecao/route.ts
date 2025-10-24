import { NextRequest, NextResponse } from "next/server";

import { requireMaint } from "@/lib/guards";
import { fromDataUrl } from "@/lib/storage/dataUrl";
import { parseImageFormEntry } from "@/lib/storage/formData";
import { r2Provider } from "@/lib/storage/r2Provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonPayload = {
  dataUrl?: string;
  inspectionId?: string;
  fileName?: string;
};

function extractInspectionId(value: FormDataEntryValue | null | undefined): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  const auth = await requireMaint();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const entry = form.get("file") ?? form.get("dataUrl");
      if (!entry) {
        return NextResponse.json({ error: "IMAGE_REQUIRED" }, { status: 400 });
      }
      const parsed = await parseImageFormEntry(entry);
      const inspectionId =
        extractInspectionId(form.get("inspectionId")) ?? extractInspectionId(form.get("inspecaoId"));
      const prefix = inspectionId ? `inspecoes/${inspectionId}` : "inspecoes";
      const upload = await r2Provider.upload(parsed.buffer, parsed.mime, parsed.fileName, prefix);
      return NextResponse.json({ url: upload.url, provider: upload.provider, mime: upload.mime });
    }

    const body = (await req.json().catch(() => null)) as JsonPayload | null;
    if (!body?.dataUrl) {
      return NextResponse.json({ error: "IMAGE_REQUIRED" }, { status: 400 });
    }
    const { buffer, mime } = fromDataUrl(body.dataUrl);
    const inspectionId = body.inspectionId?.trim();
    const prefix = inspectionId ? `inspecoes/${inspectionId}` : "inspecoes";
    const upload = await r2Provider.upload(buffer, mime, body.fileName, prefix);
    return NextResponse.json({ url: upload.url, provider: upload.provider, mime: upload.mime });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPLOAD_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

