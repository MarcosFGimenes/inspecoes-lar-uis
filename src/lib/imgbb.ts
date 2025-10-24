import { Buffer } from "node:buffer";

import type { StoredPhoto } from "./photos";

const DATA_URL_REGEX = /^data:(.+);base64,(.*)$/i;
const POSTIMAGES_ENDPOINT = "https://api.postimage.org/1/upload";
const POSTIMAGES_FIXED_PARAMS = {
  o: "2b819584285c102318568238c7d4a4c7",
  m: "59c2ad4b46b0c1e12d5703302bff0120",
  version: "1.0.1",
  portable: "1",
} as const;

const rawImgbbKeys = process.env.IMGBB_API_KEYS
  ? process.env.IMGBB_API_KEYS.split(",").map(key => key.trim()).filter(Boolean)
  : [];
const fallbackImgbbKey = process.env.IMGBB_API_KEY?.trim();
const IMGBB_API_KEYS = rawImgbbKeys.length > 0 ? rawImgbbKeys : fallbackImgbbKey ? [fallbackImgbbKey] : [];
let lastKeyIndex = -1;

const POSTIMAGES_API_KEY = process.env.POSTIMAGES_API_KEY?.trim() ?? "";
const POSTIMAGES_GALLERY = process.env.POSTIMAGES_GALLERY?.trim();

function maskKey(key: string | null | undefined) {
  if (!key) return "<none>";
  const trimmed = key.trim();
  if (trimmed.length <= 6) {
    return `${trimmed}***`;
  }
  return `${trimmed.slice(0, 6)}***`;
}

function nextImgbbKey(): string | null {
  if (IMGBB_API_KEYS.length === 0) {
    return null;
  }
  lastKeyIndex = (lastKeyIndex + 1) % IMGBB_API_KEYS.length;
  return IMGBB_API_KEYS[lastKeyIndex] ?? null;
}

type ImgbbSuccessResponse = {
  data?: {
    url?: string;
    display_url?: string;
    delete_url?: string;
  };
  success?: boolean;
  error?: { message?: string } | string;
};

type PostimagesResponse = {
  status?: string | number;
  url?: string;
  direct?: string;
  link?: string;
  display_url?: string;
  delete_url?: string;
  delete?: string;
  image?: { url?: string; link?: string; display_url?: string; delete?: string };
  data?: { url?: string; direct?: string; display_url?: string; delete_url?: string };
  error?: { message?: string } | string;
  message?: string;
};

export type UploadResult = StoredPhoto & {
  provider: "imgbb" | "postimages";
  display_url: string;
  mime: string;
};

function extractBase64(dataUrl: string) {
  const match = dataUrl.match(DATA_URL_REGEX);
  if (!match) {
    throw new Error("INVALID_DATA_URL");
  }
  const [, mime, base64] = match;
  if (!base64) {
    throw new Error("INVALID_DATA_URL");
  }
  return { mime, base64 };
}

function guessExtension(mime: string) {
  const match = mime.match(/\/([a-z0-9.+-]+)$/i);
  return match ? match[1]!.toLowerCase() : "bin";
}

function buildFileName(name: string | undefined, mime: string) {
  const base = (name ?? "inspecao").trim() || "inspecao";
  const sanitized = base.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "") || "inspecao";
  const extension = guessExtension(mime);
  return `${sanitized}.${extension}`.slice(0, 120);
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function createImgbbForm(base64: string, mime: string, fileName: string) {
  const form = new FormData();
  if (typeof Blob !== "undefined") {
    const buffer = Buffer.from(base64, "base64");
    const blob = new Blob([buffer], { type: mime });
    form.append("image", blob, fileName);
  } else {
    form.append("image", base64);
  }
  form.append("name", fileName.replace(/\.[^.]+$/, ""));
  return form;
}

function summarizeError(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
    if (record.error) {
      return summarizeError(record.error);
    }
  }
  return "unknown";
}

async function attemptImgbbUpload(
  key: string,
  base64: string,
  mime: string,
  fileName: string,
  expirationSec?: number
): Promise<UploadResult> {
  const form = createImgbbForm(base64, mime, fileName);
  const query = new URLSearchParams({ key });
  if (typeof expirationSec === "number" && Number.isFinite(expirationSec) && expirationSec > 0) {
    query.set("expiration", Math.floor(expirationSec).toString());
  }
  const endpoint = `https://api.imgbb.com/1/upload?${query.toString()}`;
  const response = await fetch(endpoint, { method: "POST", body: form });
  const json = (await response.json().catch(() => ({}))) as ImgbbSuccessResponse;
  if (!response.ok || json?.success !== true || !json.data?.url || !json.data.display_url) {
    const snippet = summarizeError(json);
    console.warn(
      `[upload:image] provider=imgbb key=${maskKey(key)} status=${response.status} success=${json?.success === true} message=${snippet}`
    );
    throw new Error(`IMGBB_UPLOAD_FAILED ${response.status}`);
  }
  return {
    url: json.data.url,
    display_url: json.data.display_url,
    delete_url: json.data.delete_url,
    mime,
    provider: "imgbb",
  };
}

function buildPostimagesPayload(base64: string, mime: string, fileName: string) {
  if (!POSTIMAGES_API_KEY) {
    throw new Error("POSTIMAGES_API_KEY missing");
  }
  const dotIndex = fileName.lastIndexOf(".");
  const nameWithoutExt = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex + 1) : guessExtension(mime);
  const payload = new URLSearchParams();
  payload.set("key", POSTIMAGES_API_KEY);
  if (POSTIMAGES_GALLERY) {
    payload.set("gallery", POSTIMAGES_GALLERY);
  }
  payload.set("name", nameWithoutExt || "inspecao");
  payload.set("type", extension || "bin");
  payload.set("image", base64);
  Object.entries(POSTIMAGES_FIXED_PARAMS).forEach(([key, value]) => {
    payload.set(key, value);
  });
  return payload;
}

async function uploadViaPostimages(base64: string, mime: string, fileName: string): Promise<UploadResult> {
  const body = buildPostimagesPayload(base64, mime, fileName);
  const response = await fetch(POSTIMAGES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: body.toString(),
  });
  const json = (await response.json().catch(() => ({}))) as PostimagesResponse;
  const urlCandidate =
    pickString(json.url) ??
    pickString(json.direct) ??
    pickString(json.link) ??
    pickString(json.display_url) ??
    pickString(json.image?.url) ??
    pickString(json.image?.link) ??
    pickString(json.image?.display_url) ??
    pickString(json.data?.url) ??
    pickString(json.data?.direct) ??
    pickString(json.data?.display_url);
  if (!response.ok || !urlCandidate) {
    const snippet = summarizeError(json);
    console.warn(
      `[upload:image] provider=imgbb fallback=postimages status=${response.status} message=${snippet}`
    );
    throw new Error(`UPLOAD_FAILED_POSTIMAGES ${response.status}`);
  }
  const deleteUrlCandidate =
    pickString(json.delete_url) ??
    pickString(json.delete) ??
    pickString(json.image?.delete) ??
    pickString(json.data?.delete_url);
  const displayUrlCandidate =
    pickString(json.display_url) ??
    pickString(json.image?.display_url) ??
    pickString(json.data?.display_url) ??
    urlCandidate;
  return {
    url: urlCandidate,
    display_url: displayUrlCandidate,
    delete_url: deleteUrlCandidate,
    mime,
    provider: "postimages",
  };
}

export async function uploadToImgbbFromDataUrl(
  dataUrl: string,
  name?: string,
  expirationSec?: number
): Promise<UploadResult> {
  const trimmed = dataUrl.trim();
  const { mime, base64 } = extractBase64(trimmed);
  const fileName = buildFileName(name, mime);

  const attempts: string[] = [];
  const firstKey = nextImgbbKey();
  if (firstKey) {
    attempts.push(firstKey);
  }
  if (IMGBB_API_KEYS.length > 1) {
    const secondKey = nextImgbbKey();
    if (secondKey && !attempts.includes(secondKey)) {
      attempts.push(secondKey);
    }
  }

  const errors: Error[] = [];
  for (const key of attempts) {
    try {
      return await attemptImgbbUpload(key, base64, mime, fileName, expirationSec);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (POSTIMAGES_API_KEY) {
    try {
      return await uploadViaPostimages(base64, mime, fileName);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.map(error => error.message).join("; "));
  }

  throw new Error("IMGBB_API_KEY missing");
}
