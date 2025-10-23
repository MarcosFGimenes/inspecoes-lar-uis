import { Timestamp } from "firebase-admin/firestore";

import type { Severity, SeverityAudit, SeverityState } from "@/types/severity";

export type FirestoreSeverityAudit = Omit<SeverityAudit, "updatedAt"> & {
  updatedAt?: Timestamp | null;
};

export type FirestoreSeverityState = {
  maintainer?: Severity;
  maintainerAt?: Timestamp;
  signer?: Severity | null;
  signerAt?: Timestamp | null;
  effective?: Severity;
  audit?: FirestoreSeverityAudit;
};

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function normalizeTimestamp(value: unknown): Timestamp | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      const converted = (value as { toDate: () => Date }).toDate();
      if (!Number.isNaN(converted.getTime())) {
        return Timestamp.fromDate(converted);
      }
    } catch {
      return undefined;
    }
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }
  return undefined;
}

export function normalizeSeverityState(input: unknown): FirestoreSeverityState {
  if (!input || typeof input !== "object") {
    return {};
  }

  const raw = input as Record<string, unknown>;
  const maintainer = isSeverity(raw.maintainer) ? raw.maintainer : undefined;
  const signer =
    raw.signer === null || typeof raw.signer === "undefined"
      ? null
      : isSeverity(raw.signer)
        ? raw.signer
        : undefined;
  const effective = isSeverity(raw.effective) ? raw.effective : undefined;

  const auditRaw = raw.audit as Record<string, unknown> | undefined;
  const audit: FirestoreSeverityAudit | undefined = auditRaw
    ? {
        role: auditRaw.role === "pcm" ? "pcm" : "maint",
        id: typeof auditRaw.id === "string" ? auditRaw.id : auditRaw.id === null ? null : undefined,
        updatedAt: normalizeTimestamp(auditRaw.updatedAt),
      }
    : undefined;

  return {
    maintainer,
    maintainerAt: normalizeTimestamp(raw.maintainerAt),
    signer,
    signerAt: normalizeTimestamp(raw.signerAt ?? raw.signerTimestamp),
    effective,
    audit,
  };
}

export function computeEffectiveSeverity(state: FirestoreSeverityState): FirestoreSeverityState {
  if (typeof state.signer === "number") {
    state.effective = state.signer;
  } else if (typeof state.maintainer === "number") {
    state.effective = state.maintainer;
  } else {
    delete state.effective;
  }
  return state;
}

export function toSerializableState(state: FirestoreSeverityState): SeverityState {
  return {
    maintainer: state.maintainer,
    maintainerAt: state.maintainerAt ? state.maintainerAt.toDate().toISOString() : undefined,
    signer:
      typeof state.signer === "number"
        ? state.signer
        : state.signer === null
          ? null
          : undefined,
    signerAt:
      state.signerAt === null
        ? null
        : state.signerAt
        ? state.signerAt.toDate().toISOString()
        : undefined,
    effective: state.effective,
    audit: state.audit
      ? {
          role: state.audit.role,
          id: typeof state.audit.id === "string" ? state.audit.id : state.audit.id ?? null,
          updatedAt: state.audit.updatedAt ? state.audit.updatedAt.toDate().toISOString() : undefined,
        }
      : undefined,
  };
}

export function parseSeverityState(value: unknown): SeverityState {
  const normalized = normalizeSeverityState(value);
  const computed = computeEffectiveSeverity({ ...normalized });
  return toSerializableState(computed);
}

export function getEffectiveSeverity(
  source: { severity?: unknown } | SeverityState | FirestoreSeverityState | null | undefined,
): Severity | undefined {
  if (!source) return undefined;
  const state =
    typeof source === "object" && "maintainer" in source
      ? (source as FirestoreSeverityState)
      : normalizeSeverityState((source as { severity?: unknown }).severity);
  if (typeof state.effective === "number") {
    return state.effective;
  }
  if (typeof state.signer === "number") {
    return state.signer;
  }
  if (typeof state.maintainer === "number") {
    return state.maintainer;
  }
  return undefined;
}

export type { Severity, SeverityAudit, SeverityState };
