import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/guards";
import { uploadToImgbbFromDataUrl } from "@/lib/imgbb";
import { randomUUID } from "crypto";

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

async function fileToDataUrl(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";
  const base64 = buffer.toString("base64");
  return `data:${mime};base64,${base64}`;
}

function ensureDataUrl(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!/^data:[^;]+;base64,/i.test(trimmed)) {
    throw new Error("INVALID_DATA_URL");
  }
  return trimmed;
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

    let dataUrl: string;
    let fileName: string | undefined;
    if (typeof entry === "string") {
      try {
        dataUrl = ensureDataUrl(entry);
      } catch {
        return NextResponse.json({ error: "DATA_URL_INVALIDA" }, { status: 400 });
      }
    } else {
      dataUrl = await fileToDataUrl(entry);
      fileName = entry.name;
    }

    const formName = form.get("name");
    const uploadName = buildUploadName(typeof formName === "string" ? formName : undefined, fileName);
    const { url } = await uploadToImgbbFromDataUrl(dataUrl, uploadName);
    return NextResponse.json({ url });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "UPLOAD_ERROR") },
      { status: 500 }
    );
  }
}
