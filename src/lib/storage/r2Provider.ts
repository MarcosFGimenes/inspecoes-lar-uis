import { randomBytes } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime";

import { getR2Client } from "./r2Client";
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

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`${name} env var is required for R2 uploads`);
  }
  return value;
}

let normalizedBaseUrl: string | null = null;

function getNormalizedBaseUrl() {
  if (normalizedBaseUrl) {
    return normalizedBaseUrl;
  }
  const baseUrl = requireEnv("R2_PUBLIC_BASE_URL");
  normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return normalizedBaseUrl;
}

let cachedBucket: string | null = null;

function getBucket() {
  if (cachedBucket) {
    return cachedBucket;
  }
  cachedBucket = requireEnv("R2_BUCKET");
  return cachedBucket;
}

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

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );

    return { url: this.getPublicUrl(key), provider: "r2", mime: mimeType, key };
  },

  getPublicUrl(key: string) {
    return `${getNormalizedBaseUrl()}/${encodeKeyForUrl(key)}`;
  },
};

