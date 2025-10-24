import { randomBytes } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime";

import { r2 } from "./r2Client";
import type { StoredImage } from "@/types/images";

export interface UploadedImage extends StoredImage {
  provider: "r2" | "imgbb";
  mime?: string | null;
  key?: string | null;
}

export interface StorageProvider {
  upload(buffer: Buffer, mime: string, fileName?: string, prefix?: string): Promise<UploadedImage>;
  getPublicUrl(key: string): string;
}

const bucket = process.env.R2_BUCKET;
const baseUrl = process.env.R2_PUBLIC_BASE_URL;

if (!bucket) {
  throw new Error("R2_BUCKET env var is required for R2 uploads");
}

if (!baseUrl) {
  throw new Error("R2_PUBLIC_BASE_URL env var is required for R2 uploads");
}

const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

function sanitizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function pickExtension(mimeType: string, fileName?: string) {
  if (fileName) {
    const parts = fileName.split(".");
    if (parts.length > 1) {
      const ext = parts.pop();
      if (ext) {
        return sanitizeName(ext).replace(/^-+/, "") || undefined;
      }
    }
  }
  return mime.extension(mimeType) ?? undefined;
}

function buildKey(prefix: string | undefined, fileName: string | undefined, mimeType: string) {
  const folder = prefix?.replace(/\/+$/, "") || "uploads";
  const ext = pickExtension(mimeType, fileName) ?? "bin";
  const randomSuffix = randomBytes(3).toString("hex");
  const timestamp = Date.now();
  const safeName = fileName ? sanitizeName(fileName.split(".")[0] || "image") : "image";
  const parts = [folder.replace(/^\/+/, ""), `${timestamp}-${randomSuffix}-${safeName}.${ext}`];
  return parts.filter(Boolean).join("/");
}

function encodeKeyForUrl(key: string) {
  return key
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/");
}

export const r2Provider: StorageProvider = {
  async upload(buffer, mimeType, fileName, prefix) {
    const key = buildKey(prefix, fileName, mimeType);

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );

    return { url: this.getPublicUrl(key), provider: "r2", mime: mimeType, key };
  },

  getPublicUrl(key: string) {
    return `${normalizedBaseUrl}/${encodeKeyForUrl(key)}`;
  },
};

