// src/lib/imgbb.ts
const DATA_URL_REGEX = /^data:([^;]+);base64,([a-z0-9+/=\r\n]+)$/i;

type UploadResponse = {
  data?: {
    url?: string;
    display_url?: string;
    delete_url?: string;
  };
  success?: boolean;
  status?: number;
};

function extractBase64(dataUrl: string) {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(DATA_URL_REGEX);
  if (!match) {
    throw new Error("INVALID_DATA_URL");
  }
  const base64 = match[2]!.replace(/\s+/g, "");
  if (!base64) {
    throw new Error("INVALID_DATA_URL");
  }
  return base64;
}

function buildEndpoint(expirationSec?: number) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new Error("IMGBB_API_KEY_NOT_CONFIGURED");
  }
  const endpoint = new URL("https://api.imgbb.com/1/upload");
  endpoint.searchParams.set("key", apiKey);
  if (typeof expirationSec === "number" && Number.isFinite(expirationSec) && expirationSec > 0) {
    endpoint.searchParams.set("expiration", Math.floor(expirationSec).toString());
  }
  return endpoint.toString();
}

export async function uploadToImgbbFromDataUrl(
  dataUrl: string,
  name?: string,
  expirationSec?: number
): Promise<{ url: string; display_url: string; delete_url?: string }> {
  const base64 = extractBase64(dataUrl);
  const body = new URLSearchParams();
  body.set("image", base64);
  if (name && name.trim()) {
    body.set("name", name.trim());
  }

  const response = await fetch(buildEndpoint(expirationSec), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  let payload: UploadResponse | null = null;
  try {
    payload = (await response.json()) as UploadResponse;
  } catch (err) {
    throw new Error(`IMGBB_RESPONSE_ERROR: ${(err as Error)?.message ?? "Unknown"}`);
  }

  if (!response.ok || payload?.success !== true || !payload.data?.url || !payload.data.display_url) {
    const status = payload?.status ?? response.status;
    const message = `IMGBB_UPLOAD_FAILED: status=${status}`;
    throw new Error(message);
  }

  return {
    url: payload.data.url,
    display_url: payload.data.display_url,
    delete_url: payload.data.delete_url,
  };
}

