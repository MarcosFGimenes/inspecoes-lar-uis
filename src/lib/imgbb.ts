// src/lib/imgbb.ts

import { Buffer } from "node:buffer";

const DATA_URL_REGEX = /^data:(.+);base64,(.*)$/i;

type ImgbbSuccessResponse = {
  data?: {
    url?: string;
    display_url?: string;
    delete_url?: string;
  };
  success?: boolean;
};

type UploadResult = {
  url: string;
  display_url: string;
  delete_url?: string;
  mime: string;
};

function ensureApiKey() {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new Error("IMGBB_API_KEY missing");
  }
  return apiKey;
}

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

export async function uploadToImgbbFromDataUrl(
  dataUrl: string,
  name?: string,
  expirationSec?: number
): Promise<UploadResult> {
  const apiKey = ensureApiKey();
  const { mime, base64 } = extractBase64(dataUrl.trim());

  const form = new FormData();
  if (typeof Blob !== "undefined") {
    const buffer = Buffer.from(base64, "base64");
    const blob = new Blob([buffer], { type: mime });
    const fileName = buildFileName(name, mime);
    form.append("image", blob, fileName);
  } else {
    form.append("image", base64);
  }
  if (name) {
    form.append("name", name);
  }

  const query = new URLSearchParams({ key: apiKey });
  if (typeof expirationSec === "number" && Number.isFinite(expirationSec) && expirationSec > 0) {
    query.set("expiration", Math.floor(expirationSec).toString());
  }

  const endpoint = `https://api.imgbb.com/1/upload?${query.toString()}`;
  const response = await fetch(endpoint, { method: "POST", body: form });
  const json = (await response.json().catch(() => ({}))) as ImgbbSuccessResponse;

  if (!response.ok || json?.success !== true || !json.data?.url || !json.data.display_url) {
    throw new Error(`IMGBB_UPLOAD_FAILED ${response.status} ${JSON.stringify(json)}`);
  }

  return {
    url: json.data.url,
    display_url: json.data.display_url,
    delete_url: json.data.delete_url,
    mime,
  };
}
