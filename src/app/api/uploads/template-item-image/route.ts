import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/guards";
import { adminStorage } from "@/lib/firebase-admin";
import { randomUUID } from "crypto";

function resolveExtension(file: File | Blob & { name?: string }) {
  if ("name" in file && file.name) {
    const parts = file.name.split(".");
    if (parts.length > 1) {
      return parts.pop()!.toLowerCase();
    }
  }
  if (file.type) {
    const [_, ext] = file.type.split("/");
    if (ext) return ext;
  }
  return "bin";
}

export async function POST(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = resolveExtension(file);
  const filename = `public/template-items/${randomUUID()}.${ext}`;
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
}
