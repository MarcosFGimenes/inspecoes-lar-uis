import type { StoredImage } from "@/types/images";

function asStoredImageFromObject(value: unknown): StoredImage | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<StoredImage>;
  if (typeof maybe.url !== "string" || !maybe.url.trim()) return null;
  const provider = maybe.provider === "r2" ? "r2" : "imgbb";
  return {
    url: maybe.url.trim(),
    provider,
    mime: typeof maybe.mime === "string" ? maybe.mime : undefined,
    key: typeof maybe.key === "string" ? maybe.key : undefined,
  };
}

function parseStringCollection(value: string): unknown[] | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:")) {
    return null;
  }

  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") return Object.values(parsed as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map(part => part.trim()).filter(Boolean);
    const looksLikeUrlList = parts.length > 1 && parts.every(part => /^https?:\/\//i.test(part));
    if (looksLikeUrlList) {
      return parts;
    }
  }

  return null;
}

export function normalizeStoredImage(value: unknown): StoredImage | null {
  if (!value) return null;

  if (typeof value === "string") {
    const collection = parseStringCollection(value);
    if (collection) {
      const first = normalizeStoredImages(collection)[0];
      return first ?? null;
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    return { url: trimmed, provider: "imgbb" };
  }

  return asStoredImageFromObject(value);
}

export function normalizeStoredImages(value: unknown): StoredImage[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap(item => normalizeStoredImages(item))
      .filter((item, index, list) => list.findIndex(candidate => candidate.url === item.url && candidate.provider === item.provider) === index);
  }

  if (typeof value === "string") {
    const collection = parseStringCollection(value);
    if (collection) {
      return normalizeStoredImages(collection);
    }
  }

  if (value && typeof value === "object") {
    const single = asStoredImageFromObject(value);
    if (single) return [single];

    const objectValues = Object.values(value as Record<string, unknown>);
    if (objectValues.length > 0) {
      return normalizeStoredImages(objectValues);
    }
  }

  const single = normalizeStoredImage(value);
  return single ? [single] : [];
}

export function mapStringsToStoredImages(urls: string[]): StoredImage[] {
  return urls
    .map(url => (typeof url === "string" ? url.trim() : ""))
    .filter(Boolean)
    .map(url => ({ url, provider: "imgbb" as const }));
}
