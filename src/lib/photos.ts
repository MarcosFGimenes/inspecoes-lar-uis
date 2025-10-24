import type { ChecklistPhoto } from "@/types/checklists";

export type StoredPhoto = ChecklistPhoto;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isStoredPhoto(value: unknown): value is StoredPhoto {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return isNonEmptyString(record.url ?? record.display_url ?? record.displayUrl ?? null);
}

function coerceUrl(source: unknown, key: string): string | undefined {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  const record = source as Record<string, unknown>;
  const value = record[key];
  return isNonEmptyString(value) ? value.trim() : undefined;
}

export function normalizeStoredPhotos(value: unknown): StoredPhoto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: StoredPhoto[] = [];
  for (const entry of value) {
    if (isNonEmptyString(entry)) {
      normalized.push({ url: entry.trim(), provider: undefined });
      continue;
    }
    if (isStoredPhoto(entry)) {
      const url = coerceUrl(entry, "url") ?? coerceUrl(entry, "display_url")!;
      const displayUrl = coerceUrl(entry, "display_url") ?? url;
      const provider = coerceUrl(entry, "provider") ?? undefined;
      const mime = coerceUrl(entry, "mime") ?? undefined;
      const deleteUrl = coerceUrl(entry, "delete_url") ?? undefined;
      normalized.push({
        url,
        display_url: displayUrl,
        provider,
        mime,
        delete_url: deleteUrl,
      });
      continue;
    }
    const maybeRecord = typeof entry === "object" && entry ? (entry as Record<string, unknown>) : null;
    if (maybeRecord) {
      const urlCandidate =
        coerceUrl(maybeRecord, "url") ??
        coerceUrl(maybeRecord, "display_url") ??
        coerceUrl(maybeRecord, "link") ??
        coerceUrl(maybeRecord, "direct") ??
        coerceUrl(maybeRecord, "src");
      if (urlCandidate) {
        normalized.push({
          url: urlCandidate,
          display_url: coerceUrl(maybeRecord, "display_url") ?? urlCandidate,
          provider: coerceUrl(maybeRecord, "provider") ?? undefined,
          mime: coerceUrl(maybeRecord, "mime") ?? undefined,
          delete_url: coerceUrl(maybeRecord, "delete_url") ?? undefined,
        });
      }
    }
  }
  return normalized;
}

export function photosToUrls(photos: StoredPhoto[]): string[] {
  return photos.map(photo => photo.url).filter(isNonEmptyString);
}

export function ensureStoredPhotos(value: unknown): StoredPhoto[] {
  const photos = normalizeStoredPhotos(value);
  return photos.length > 0 ? photos : [];
}
