import { Buffer } from "node:buffer";

const DATA_URL_REGEX = /^data:([^;]+);base64,(.*)$/i;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export type DataUrlExtraction = {
  buffer: Buffer;
  mime: string;
  ext: string;
};

export function fromDataUrl(dataUrl: string): DataUrlExtraction {
  const match = DATA_URL_REGEX.exec((dataUrl ?? "").trim());
  if (!match) {
    throw new Error("DATA_URL_INVALID");
  }

  const mime = match[1]!.toLowerCase();
  const base64 = match[2]!;

  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error("DATA_URL_MIME_NOT_ALLOWED");
  }

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) {
    throw new Error("DATA_URL_EMPTY");
  }
  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("DATA_URL_TOO_LARGE");
  }

  const ext = mime.endsWith("jpeg") ? "jpg" : mime.split("/")[1] ?? "bin";

  return { buffer, mime, ext };
}

export function allowedMimeTypes() {
  return Array.from(ALLOWED_MIME_TYPES);
}

export function isAllowedMimeType(mime: string | null | undefined) {
  if (!mime) return false;
  return ALLOWED_MIME_TYPES.has(mime.toLowerCase());
}

