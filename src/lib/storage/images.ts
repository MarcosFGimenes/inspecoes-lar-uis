import type { StoredImage } from "@/types/images";

export function normalizeStoredImage(value: unknown): StoredImage | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return { url: trimmed, provider: "imgbb" };
  }

  if (typeof value === "object") {
    const maybe = value as Partial<StoredImage>;
    if (typeof maybe.url === "string" && maybe.url.trim()) {
      const provider = maybe.provider === "r2" ? "r2" : "imgbb";
      return {
        url: maybe.url.trim(),
        provider,
        mime: typeof maybe.mime === "string" ? maybe.mime : undefined,
        key: typeof maybe.key === "string" ? maybe.key : undefined,
      };
    }
  }

  return null;
}

export function normalizeStoredImages(value: unknown): StoredImage[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(item => normalizeStoredImage(item))
      .filter((item): item is StoredImage => Boolean(item));
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

