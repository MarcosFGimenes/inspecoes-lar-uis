import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/guards";
import { randomUUID } from "crypto";
import { parseImageFormEntry } from "@/lib/storage/formData";
import { r2Provider } from "@/lib/storage/r2Provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function sanitizeSegment(segment: string) {
  return segment
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildUploadName(nameFromForm?: string | null, fileName?: string) {
  const base = nameFromForm?.trim() || fileName?.split(".")[0] || "template";
  const sanitized = sanitizeSegment(base) || "template";
  const suffix = randomUUID();
  return `${sanitized}-${suffix}`.slice(0, 100);
}

export async function POST(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const entry = form.get("file") ?? form.get("dataUrl");
    if (!entry) {
      return NextResponse.json({ error: "Arquivo invalido" }, { status: 400 });
    }

    const parsed = await parseImageFormEntry(entry);

    const formName = form.get("name");
    const uploadName = buildUploadName(
      typeof formName === "string" ? formName : undefined,
      parsed.fileName
    );
    const upload = await r2Provider.upload(parsed.buffer, parsed.mime, uploadName, "templates");
    return NextResponse.json({ url: upload.url, provider: upload.provider, mime: upload.mime });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "UPLOAD_ERROR") },
      { status: 500 }
    );
  }
}
