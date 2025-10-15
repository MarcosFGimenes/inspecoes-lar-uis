// src/lib/string-utils.ts

export function normalizeWhitespace(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

export function removeDiacritics(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeName(value: string | null | undefined) {
  if (!value) return "";
  const noDiacritics = removeDiacritics(value);
  return normalizeWhitespace(noDiacritics).toLowerCase();
}

export function toUpperSafe(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}
