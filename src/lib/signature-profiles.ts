// src/lib/signature-profiles.ts

import { normalizeName } from "./string-utils";

const PCM_PREFIX = "pcm__";
const MAINT_PREFIX = "maint__";

export function buildPcmProfileId(nome: string) {
  const normalized = normalizeName(nome);
  if (!normalized) {
    return null;
  }
  return `${PCM_PREFIX}${normalized}`;
}

export function buildMaintainerProfileId(maintainerId: string | null | undefined) {
  if (!maintainerId) {
    return null;
  }
  return `${MAINT_PREFIX}${maintainerId}`;
}

export function isPcmProfileId(profileId: string | null | undefined) {
  if (!profileId) return false;
  return profileId.startsWith(PCM_PREFIX);
}

export function isMaintainerProfileId(profileId: string | null | undefined) {
  if (!profileId) return false;
  return profileId.startsWith(MAINT_PREFIX);
}
