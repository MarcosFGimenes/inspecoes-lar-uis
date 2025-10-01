import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/guards";
import { adminStorage } from "@/lib/firebase-admin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveExtension(file: File | (Blob & { name?: string })) {
  if ("name" in file && file.name) {
    const parts = file.name.split(".");
    if (parts.length > 1) {
      return parts.pop()!.toLowerCase();
    }
  }
  if (file.type) {
    const typeParts = file.type.split("/");
    if (typeParts.length > 1) return typeParts[1];
  }
  return "bin";
}

function extractMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function POST(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Arquivo invalido" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = resolveExtension(file);
    const filename = `public/templates/${randomUUID()}.${ext}`;
    const bucket = adminStorage.bucket();
    const storageFile = bucket.file(filename);

    await storageFile.save(buffer, {
      resumable: false,
      contentType: file.type || "application/octet-stream",
    });
    await storageFile.makePublic();
    await storageFile.setMetadata({
      contentType: file.type || "application/octet-stream",
      cacheControl: "public, max-age=31536000",
    });

    const url = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    return NextResponse.json({ url });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "UPLOAD_ERROR") },
      { status: 500 }
    );
  }
}
