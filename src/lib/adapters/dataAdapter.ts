import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";

import {
  computeEffectiveSeverity,
  FirestoreSeverityAudit,
  FirestoreSeverityState,
  normalizeSeverityState,
  toSerializableState,
} from "./severity-utils";

import type { Severity, SeverityState } from "./severity-utils";

export type { Severity, SeverityAudit, SeverityState } from "./severity-utils";
export { parseSeverityState, getEffectiveSeverity } from "./severity-utils";

interface IssueContext {
  issueRef: DocumentReference;
  issueData: DocumentData;
  inspectionRef?: DocumentReference;
  inspectionData?: DocumentData;
  programacaoRef?: DocumentReference;
}

function serializeSeverityState(state: FirestoreSeverityState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (typeof state.maintainer === "number") {
    payload.maintainer = state.maintainer;
  }
  if (state.maintainerAt) {
    payload.maintainerAt = state.maintainerAt;
  }
  if (typeof state.signer === "number" || state.signer === null) {
    payload.signer = state.signer;
  }
  if (state.signerAt !== undefined) {
    payload.signerAt = state.signerAt ?? null;
  }
  if (typeof state.effective === "number") {
    payload.effective = state.effective;
  }
  if (state.audit) {
    payload.audit = {
      role: state.audit.role,
      id: typeof state.audit.id === "string" ? state.audit.id : state.audit.id ?? null,
      updatedAt: state.audit.updatedAt ?? FieldValue.serverTimestamp(),
    };
  }
  return payload;
}

async function resolveProgramacaoRef(
  inspectionData: DocumentData | undefined,
  issueData: DocumentData,
): Promise<DocumentReference | undefined> {
  const programacaoId =
    typeof inspectionData?.programacaoId === "string" && inspectionData.programacaoId.trim().length > 0
      ? inspectionData.programacaoId.trim()
      : null;

  if (programacaoId) {
    return adminDb.collection("programacoes_inspecao").doc(programacaoId);
  }

  const osNumero =
    typeof issueData.osNumero === "string" && issueData.osNumero.trim().length > 0
      ? issueData.osNumero.trim()
      : typeof inspectionData?.osNumero === "string" && inspectionData.osNumero.trim().length > 0
        ? inspectionData.osNumero.trim()
        : null;

  if (!osNumero) {
    return undefined;
  }

  const snap = await adminDb
    .collection("programacoes_inspecao")
    .where("osNumero", "==", osNumero)
    .limit(1)
    .get();

  return snap.empty ? undefined : snap.docs[0]!.ref;
}

async function loadIssueContext(issueId: string): Promise<IssueContext | null> {
  const issueRef = adminDb.collection("issues").doc(issueId);
  const issueSnap = await issueRef.get();
  if (!issueSnap.exists) {
    return null;
  }
  const issueData = issueSnap.data() ?? {};

  const inspectionId =
    typeof issueData.abertaEmInspecaoId === "string" && issueData.abertaEmInspecaoId.trim().length > 0
      ? issueData.abertaEmInspecaoId.trim()
      : null;

  let inspectionRef: DocumentReference | undefined;
  let inspectionData: DocumentData | undefined;
  if (inspectionId) {
    inspectionRef = adminDb.collection("inspecoes").doc(inspectionId);
    const inspectionSnap = await inspectionRef.get().catch(() => null);
    if (inspectionSnap?.exists) {
      inspectionData = inspectionSnap.data() ?? {};
    } else {
      inspectionRef = undefined;
    }
  }

  const programacaoRef = await resolveProgramacaoRef(inspectionData, issueData).catch(() => undefined);

  return {
    issueRef,
    issueData,
    inspectionRef,
    inspectionData,
    programacaoRef,
  };
}

function buildAudit(role: "maint" | "pcm", id?: string | null): FirestoreSeverityAudit {
  const now = Timestamp.now();
  return {
    role,
    id: typeof id === "string" && id.trim().length > 0 ? id.trim() : id ?? null,
    updatedAt: now,
  };
}

function toSerializableState(state: FirestoreSeverityState): SeverityState {
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

export async function propagateSeverityToWO(
  issueId: string,
  overrideState?: FirestoreSeverityState,
): Promise<void> {
  const context = await loadIssueContext(issueId);
  if (!context) {
    return;
  }

  const severityState = computeEffectiveSeverity(
    overrideState ? { ...overrideState } : normalizeSeverityState(context.issueData.severity),
  );
  const severityPayload = serializeSeverityState(severityState);

  if (context.programacaoRef) {
    const updates: Record<string, unknown> = {
      "manutencao.severity": severityPayload,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await context.programacaoRef.set(updates, { merge: true });
  }

  if (context.inspectionRef && typeof context.issueData.templateItemId === "string") {
    const isoNow = new Date().toISOString();
    await context.inspectionRef.set(
      {
        updatedAt: isoNow,
        [`severityIndex.${context.issueData.templateItemId}`]: {
          ...severityPayload,
          updatedAt: isoNow,
        },
      },
      { merge: true },
    );
  }
}

export async function updateMaintainerSeverity(
  issueId: string,
  value: Severity,
  maintainerId?: string | null,
): Promise<SeverityState> {
  const context = await loadIssueContext(issueId);
  if (!context) {
    throw new Error("ISSUE_NOT_FOUND");
  }

  const now = Timestamp.now();
  const current = normalizeSeverityState(context.issueData.severity);
  const nextState = computeEffectiveSeverity({
    ...current,
    maintainer: value,
    maintainerAt: now,
    audit: buildAudit("maint", maintainerId),
  });
  if (typeof nextState.signer !== "number") {
    nextState.effective = value;
  }

  await context.issueRef.set(
    {
      severity: serializeSeverityState(nextState),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await propagateSeverityToWO(issueId, nextState);
  return toSerializableState(nextState);
}

export async function updateSignerSeverity(
  issueId: string,
  value: Severity | null,
  signerId?: string | null,
): Promise<SeverityState> {
  const context = await loadIssueContext(issueId);
  if (!context) {
    throw new Error("ISSUE_NOT_FOUND");
  }

  const now = Timestamp.now();
  const current = normalizeSeverityState(context.issueData.severity);
  const nextState = computeEffectiveSeverity({
    ...current,
    signer: value === null ? null : value,
    signerAt: value === null ? null : now,
    audit: buildAudit("pcm", signerId),
  });
  if (value === null && typeof current.maintainer === "number") {
    nextState.effective = current.maintainer;
  }

  await context.issueRef.set(
    {
      severity: serializeSeverityState(nextState),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await propagateSeverityToWO(issueId, nextState);
  return toSerializableState(nextState);
}

