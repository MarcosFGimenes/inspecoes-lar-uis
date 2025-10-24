import { Buffer } from "node:buffer";
import { createHash, createHmac, randomUUID } from "node:crypto";

import type { StoredPhoto } from "./photos";

const DATA_URL_REGEX = /^data:(.+);base64,(.*)$/i;
const AWS_ALGORITHM = "AWS4-HMAC-SHA256";
const AWS_SERVICE = "s3";

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSegments(path?: string): string[] {
  if (!path) {
    return [];
  }
  return path
    .split("/")
    .map(segment =>
      segment
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "")
    )
    .filter(Boolean);
}

function guessExtension(mime: string) {
  const match = mime.match(/\/([a-z0-9.+-]+)$/i);
  return match ? match[1]!.toLowerCase() : "bin";
}

function buildFileName(name: string | undefined, mime: string) {
  const base = (name ?? "inspecao").trim() || "inspecao";
  const sanitized = base
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "") || "inspecao";
  const extension = guessExtension(mime);
  return `${sanitized}.${extension}`.slice(0, 120);
}

function extractBase64(dataUrl: string) {
  const match = dataUrl.match(DATA_URL_REGEX);
  if (!match) {
    throw new Error("INVALID_DATA_URL");
  }
  const [, mime, base64] = match;
  if (!mime || !base64) {
    throw new Error("INVALID_DATA_URL");
  }
  return { mime, base64 };
}

function encodeSegment(segment: string) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKey(key: string) {
  return key
    .split("/")
    .filter(part => part.length > 0)
    .map(encodeSegment)
    .join("/");
}

function canonicalize(bucket: string, key: string) {
  const bucketSegment = encodeSegment(bucket);
  const keySegment = encodeKey(key);
  return `/${bucketSegment}${keySegment ? `/${keySegment}` : ""}`;
}

function hashHex(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(buffer: Buffer | string, data: string) {
  return createHmac("sha256", buffer).update(data).digest();
}

function hmacHex(buffer: Buffer | string, data: string) {
  return createHmac("sha256", buffer).update(data).digest("hex");
}

function deriveSigningKey(secret: string, dateStamp: string, region: string, service: string) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function formatAmzDate(date: Date) {
  const yyyy = date.getUTCFullYear().toString();
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const min = date.getUTCMinutes().toString().padStart(2, "0");
  const ss = date.getUTCSeconds().toString().padStart(2, "0");
  return {
    amzDate: `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`,
    dateStamp: `${yyyy}${mm}${dd}`,
  };
}

function buildObjectKey(fileName: string, prefix?: string) {
  const segments: string[] = [];
  segments.push(...normalizeSegments(prefix));
  const now = new Date();
  segments.push(now.getUTCFullYear().toString());
  segments.push((now.getUTCMonth() + 1).toString().padStart(2, "0"));
  segments.push(now.getUTCDate().toString().padStart(2, "0"));
  segments.push(randomUUID());
  segments.push(fileName);
  return segments.join("/");
}

type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  region: string;
  publicBaseUrl?: string;
  prefix?: string;
};

function resolveR2Config(): R2Config {
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");
  const bucket = getEnv("R2_BUCKET_NAME");
  const endpoint = getEnv("R2_ENDPOINT");
  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    throw new Error("R2_CONFIGURATION_MISSING");
  }
  const region = getEnv("R2_REGION") ?? "auto";
  const publicBaseUrl = getEnv("R2_PUBLIC_BASE_URL");
  const prefix = getEnv("R2_PREFIX");
  return { accessKeyId, secretAccessKey, bucket, endpoint, region, publicBaseUrl, prefix };
}

function resolvePublicBaseUrl(config: R2Config) {
  try {
    const endpointUrl = new URL(config.endpoint);
    const origin = endpointUrl.origin;
    const base = config.publicBaseUrl ?? `${origin}/${encodeSegment(config.bucket)}`;
    const replaced = base.includes("{bucket}") ? base.replace(/{bucket}/g, config.bucket) : base;
    return replaced.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  } catch {
    const base = config.publicBaseUrl ?? `${config.endpoint}/${config.bucket}`;
    return base.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  }
}

async function putObjectToR2(buffer: Buffer, mime: string, key: string, config: R2Config) {
  const endpointUrl = new URL(config.endpoint);
  const canonicalUri = canonicalize(config.bucket, key);
  endpointUrl.pathname = `/${config.bucket}/${key}`.replace(/\/{2,}/g, "/");
  const host = endpointUrl.host;

  const payloadHash = hashHex(buffer);
  const timestamp = formatAmzDate(new Date());
  const credentialScope = `${timestamp.dateStamp}/${config.region}/${AWS_SERVICE}/aws4_request`;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp.amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    AWS_ALGORITHM,
    timestamp.amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");

  const signingKey = deriveSigningKey(config.secretAccessKey, timestamp.dateStamp, config.region, AWS_SERVICE);
  const signature = hmacHex(signingKey, stringToSign);
  const authorization =
    `${AWS_ALGORITHM} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  const body = new Blob([copy.buffer], { type: mime });
  const response = await fetch(endpointUrl.toString(), {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "x-amz-date": timestamp.amzDate,
      "x-amz-content-sha256": payloadHash,
      "Content-Type": mime,
    },
    body,
  });

  if (!response.ok) {
    const snippet = await response.text().catch(() => "");
    console.error(
      `[upload:image] provider=r2 status=${response.status} body=${snippet.slice(0, 200).replace(/\s+/g, " " )}`
    );
    throw new Error(`R2_UPLOAD_FAILED ${response.status}`);
  }

  const publicBase = resolvePublicBaseUrl(config);
  const encodedKey = encodeKey(key);
  const url = `${publicBase}/${encodedKey}`;
  return {
    url,
    display_url: url,
    provider: "cloudflare-r2" as const,
    mime,
    storage_key: key,
  } satisfies StoredPhoto & {
    provider: "cloudflare-r2";
    display_url: string;
    mime: string;
    storage_key: string;
  };
}

export type UploadResult = StoredPhoto & {
  provider: "cloudflare-r2";
  display_url: string;
  mime: string;
  storage_key: string;
};

export async function uploadToImgbbFromDataUrl(dataUrl: string, name?: string): Promise<UploadResult> {
  const trimmed = dataUrl.trim();
  const { mime, base64 } = extractBase64(trimmed);
  const buffer = Buffer.from(base64, "base64");
  const config = resolveR2Config();
  const fileName = buildFileName(name, mime);
  const key = buildObjectKey(fileName, config.prefix);
  const upload = await putObjectToR2(buffer, mime, key, config);
  return upload;
}

export const uploadImageFromDataUrl = uploadToImgbbFromDataUrl;
