"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { SignatureCanvasInstance } from "@/components/signature-canvas-client";
import { CriticidadeSelector } from "@/components/criticidade-selector";
import { CriticidadeBadge } from "@/components/criticidade-badge";
import { ensureStoredPhotos, photosToUrls } from "@/lib/photos";
import type { Severity, SeverityState } from "@/types/severity";

type SignatureCanvasComponent = typeof import("@/components/signature-canvas-client").default;
const SignatureCanvas = dynamic(() => import("@/components/signature-canvas-client"), { ssr: false }) as unknown as SignatureCanvasComponent;

/* ===== Tipos já existentes ===== */
type MaintainerInfo = { id: string; nome: string | null; matricula: string | null };
type MachineInfo = {
  id: string; tag: string | null; nome: string | null; setor: string | null; unidade: string | null;
  localUnidade: string | null; lac: string | null; fotoUrl: string | null; templateId: string;
};
type TemplateItem = {
  id?: string; componente?: string | null; oQueChecar?: string | null; instrumento?: string | null;
  criterio?: string | null; oQueFazer?: string | null; imagemItemUrl?: string | null; ordem?: number | null;
};
type TemplateInfo = { id: string; nome: string | null; imagemUrl?: string | null; itens: TemplateItem[] };
type IssueRecord = {
  id: string;
  templateItemId: string | null;
  descricao: string | null;
  osNumero: string | null;
  fotos: StoredImage[];
  createdAt: string | null;
  severity?: SeverityState | null;
  effectiveSeverity?: Severity | null;
};
type InspectionContext = { maintainer: MaintainerInfo; machine: MachineInfo; template: TemplateInfo; openIssues: IssueRecord[] };

type ItemPhotoState = {
  id: string;
  name: string;
  dataUrl: string;
  file?: File | null;
  origin: "local" | "draft";
};

type ItemFormState = {
  resultado: "" | "C" | "NC" | "NA";
  observacao: string;
  osNumero: string;
  fotos: ItemPhotoState[];
  fileKey: number;
  criticidade: Severity | null;
};
type FeedbackState = { type: "success" | "error"; message: string };
type DraftItemPhotoState = { dataUrl: string; name?: string | null };
type DraftItemState = {
  templateItemId: string;
  resultado: "" | "C" | "NC" | "NA";
  observacao: string;
  osNumero: string;
  fotos: DraftItemPhotoState[];
  criticidade: number | null;
};
type DraftDataState = {
  osNumero: string;
  observacoes: string;
  assinaturaDataUrl: string | null;
  itens: DraftItemState[];
  resolveIssues: string[];
  updatedAt?: string | null;
};

const RESULT_OPTIONS: Array<{ value: "C" | "NC" | "NA"; label: string; tone: "ok" | "nc" | "na" }> = [
  { value: "C", label: "C", tone: "ok" },
  { value: "NC", label: "NC", tone: "nc" },
  { value: "NA", label: "N/A", tone: "na" },
];

/* ===== Helpers já existentes ===== */
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024; // ~1.5MB
const MAX_IMAGE_DIMENSION = 1600; // pixels

async function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Falha ao ler arquivo")));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(blob);
  });
}

async function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao carregar imagem"));
    };
    img.src = url;
  });
}

async function canvasToDataUrl(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("Não foi possível converter a imagem."));
          return;
        }
        try {
          const dataUrl = await readBlobAsDataUrl(blob);
          resolve(dataUrl);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Falha ao gerar imagem."));
        }
      },
      type,
      quality,
    );
  });
}

async function fileToDataUrl(file: File) {
  const fallback = () => readBlobAsDataUrl(file);
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return fallback();
  }

  try {
    const image = await loadImageFromFile(file);
    const largestSide = Math.max(image.width, image.height);
    const shouldResize = largestSide > MAX_IMAGE_DIMENSION || file.size > MAX_IMAGE_BYTES;

    if (!shouldResize || !largestSide) {
      return fallback();
    }

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / largestSide);
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return fallback();
    }
    context.clearRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const qualitySteps = outputType === "image/jpeg" ? [0.82, 0.72, 0.62] : [0.92];

    for (let idx = 0; idx < qualitySteps.length; idx += 1) {
      const quality = qualitySteps[idx];
      try {
        const dataUrl = await canvasToDataUrl(canvas, outputType, quality);
        const estimatedSize = Math.ceil((dataUrl.length * 3) / 4); // rough base64 -> bytes
        if (estimatedSize <= MAX_IMAGE_BYTES || idx === qualitySteps.length - 1) {
          return dataUrl;
        }
      } catch (err) {
        if (idx === qualitySteps.length - 1) {
          throw err;
        }
      }
    }

    return fallback();
  } catch {
    return fallback();
  }
}

function createPhotoId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function coerceSeverity(value: unknown): Severity | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6) {
    return value as Severity;
  }
  return null;
}

/* ===== Botão C/NC/N/A no novo visual (mantém handlers) ===== */
function ChoiceBtn({
  active, tone, children, onClick, ariaLabel,
}: { active: boolean; tone: "ok" | "nc" | "na"; children: React.ReactNode; onClick: () => void; ariaLabel: string }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold border-2 transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2";
  const inactive = "bg-white text-gray-800 border-black hover:bg-gray-50";
  const activeByTone: Record<typeof tone, string> = {
    ok: "bg-emerald-600 text-white border-emerald-600",
    nc: "bg-red-600 text-white border-red-600",
    na: "bg-gray-600 text-white border-gray-600",
  };
  const ringByTone: Record<typeof tone, string> = {
    ok: "focus-visible:outline-emerald-600",
    nc: "focus-visible:outline-red-600",
    na: "focus-visible:outline-gray-600",
  };
  return (
    <button type="button" aria-pressed={active} aria-label={ariaLabel}
      className={`${base} ${active ? activeByTone[tone] : inactive} ${ringByTone[tone]}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default function InspectionPage() {
  const params = useParams<{ tag: string }>();
  const tagParam = Array.isArray(params?.tag) ? params?.tag?.[0] : params?.tag ?? "";
  const tag = useMemo(() => tagParam?.trim() ?? "", [tagParam]);

  const router = useRouter();
  const searchParams = useSearchParams();

  const [context, setContext] = useState<InspectionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemsState, setItemsState] = useState<Record<string, ItemFormState>>({});
  const [programacaoId, setProgramacaoId] = useState<string | null>(null);
  const [programacaoBatchId, setProgramacaoBatchId] = useState<string | null>(null);
  const [programacaoPrazo, setProgramacaoPrazo] = useState<string | null>(null);
  const [osBloqueado, setOsBloqueado] = useState<string | null>(null);
  const [osNumero, setOsNumero] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [resolveIssues, setResolveIssues] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState<"save" | "save-new" | null>(null);
  const [lastInspectionId, setLastInspectionId] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelConfirmText, setCancelConfirmText] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [isDraftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [autoSavingDraft, setAutoSavingDraft] = useState(false);
  const [draftFeedback, setDraftFeedback] = useState<FeedbackState | null>(null);
  const [lastDraftUpdatedAt, setLastDraftUpdatedAt] = useState<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDraftPayloadRef = useRef<string | null>(null);

  const signatureRef = useRef<SignatureCanvasInstance | null>(null);
  const cancelInputRef = useRef<HTMLInputElement | null>(null);
  const [signatureTouched, setSignatureTouched] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [savedSignatureProfile, setSavedSignatureProfile] = useState<{ id: string; assinaturaUrl: string | null } | null>(null);
  const [signatureMode, setSignatureMode] = useState<"saved" | "new">("new");
  const [saveMaintSignatureChoice, setSaveMaintSignatureChoice] = useState(false);

  const refreshSavedSignature = useCallback(async () => {
    try {
      const response = await fetch("/api/assinaturas/maint", { cache: "no-store" });
      if (!response.ok) {
        setSavedSignatureProfile(null);
        setSignatureMode("new");
        setSignatureTouched(false);
        return;
      }
      const data = (await response.json()) as { id: string; assinaturaUrl: string | null };
      setSavedSignatureProfile(data);
      setSaveMaintSignatureChoice(false);
      if (data.assinaturaUrl) {
        setSignatureMode("saved");
        setSignatureTouched(true);
      } else {
        setSignatureMode("new");
        setSignatureTouched(false);
      }
    } catch (err) {
      console.error("[maint-signature] failed to load", err);
    }
  }, []);

  useEffect(() => {
    refreshSavedSignature();
  }, [refreshSavedSignature]);

  useEffect(() => {
    if (signatureMode === "saved") {
      signatureRef.current?.clear?.();
      setSignatureDataUrl(null);
    }
  }, [signatureMode]);

  const createEmptyItemState = useCallback(
    (): ItemFormState => ({
      resultado: "",
      observacao: "",
      osNumero: osBloqueado ?? "",
      fotos: [],
      fileKey: Date.now(),
      criticidade: null,
    }),
    [osBloqueado],
  );

  useEffect(() => {
    if (searchParams?.get("ok") === "1") setFeedback({ type: "success", message: "Inspeção salva" });
    const idParam = searchParams?.get("id");
    if (idParam) setLastInspectionId(idParam);

    const progIdParam = searchParams?.get("programacaoId");
    setProgramacaoId(progIdParam ?? null);

    const batchParam = searchParams?.get("batchId");
    setProgramacaoBatchId(batchParam ?? null);

    const prazoParam = searchParams?.get("prazo");
    setProgramacaoPrazo(prazoParam ?? null);

    const osParam = searchParams?.get("os");
    const lockedOs = osParam ? osParam.trim().toUpperCase() : null;
    setOsBloqueado(lockedOs);
    if (lockedOs) {
      setOsNumero(lockedOs);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!showCancelModal) return;
    const timer = setTimeout(() => {
      cancelInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, [showCancelModal]);

  useEffect(() => {
    if (!osBloqueado) return;
    setItemsState(prev => {
      const updated: Record<string, ItemFormState> = {};
      Object.entries(prev).forEach(([key, value]) => {
        updated[key] = { ...value, osNumero: osBloqueado };
      });
      return updated;
    });
  }, [osBloqueado]);

  /* ===== Organização visual ===== */
  const sortedItems = useMemo(() => {
    if (!context?.template?.itens) return [] as TemplateItem[];
    const baseOrder = [...context.template.itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    const openIssueIds = new Set(
      (context?.openIssues ?? [])
        .map(issue => (typeof issue?.templateItemId === "string" ? issue.templateItemId.trim() : ""))
        .filter((id): id is string => Boolean(id))
    );
    if (!openIssueIds.size) return baseOrder;

    const withIssue: TemplateItem[] = [];
    const withoutIssue: TemplateItem[] = [];
    for (const item of baseOrder) {
      if (item?.id && openIssueIds.has(item.id)) {
        withIssue.push(item);
      } else {
        withoutIssue.push(item);
      }
    }
    return [...withIssue, ...withoutIssue];
  }, [context?.openIssues, context?.template?.itens]);

  /* ===== Carrega contexto (sem mexer na lógica) ===== */
  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      if (!tag) {
        setContext(null); setLoading(false); setError("TAG inválida."); return;
      }
      setLoading(true); setError(null);
      try {
        const response = await fetch(`/api/inspecao/context?tag=${encodeURIComponent(tag)}`, { cache: "no-store" });
        if (response.status === 401) { window.location.href = "/login"; return; }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message =
            payload?.error === "FORBIDDEN" ? "Você não tem acesso a esta máquina."
            : payload?.error === "MACHINE_NOT_FOUND" ? "Máquina não encontrada."
            : payload?.error === "TEMPLATE_NOT_FOUND" ? "Template da máquina não encontrado."
            : typeof payload?.error === "string" ? payload.error : "Falha ao carregar dados da inspeção.";
          throw new Error(message);
        }
        const data = (await response.json()) as InspectionContext;
        if (!cancelled) { setContext(data); setError(null); }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar dados da inspeção.";
          setError(message); setContext(null);
        }
      } finally { if (!cancelled) setLoading(false); }
    }
    loadContext();
    return () => { cancelled = true; };
  }, [tag]);

  /* ===== Reset do formulário ===== */
  const resetForm = useCallback(() => {
    if (!context?.template?.itens) return;
    const initial: Record<string, ItemFormState> = {};
    context.template.itens
      .filter(i => i.id)
      .forEach((i, idx) => {
        const base = createEmptyItemState();
        base.fileKey = Date.now() + idx;
        initial[i.id!] = base;
      });
    setItemsState(initial);
    setOsNumero(osBloqueado ?? "");
    setObservacoes("");
    setResolveIssues({});
    setDraftFeedback(null);
    setLastDraftUpdatedAt(null);
    lastDraftPayloadRef.current = null;
    setSaveMaintSignatureChoice(false);
    setSignatureDataUrl(null);
    if (savedSignatureProfile?.assinaturaUrl) {
      setSignatureMode("saved");
      setSignatureTouched(true);
      signatureRef.current?.clear?.();
    } else {
      setSignatureMode("new");
      setSignatureTouched(false);
      signatureRef.current?.clear?.();
    }
  }, [
    context?.template?.itens,
    createEmptyItemState,
    osBloqueado,
    savedSignatureProfile?.assinaturaUrl,
  ]);

  useEffect(() => { if (context) resetForm(); }, [context, resetForm]);

  const applyDraft = useCallback(
    (draft: DraftDataState) => {
      const itemsMap = new Map(draft.itens.map(item => [item.templateItemId, item] as const));
      const base: Record<string, ItemFormState> = {};
      const now = Date.now();
      const lockedOsValue = osBloqueado ?? null;
      sortedItems.forEach((item, idx) => {
        if (!item.id) return;
        const saved = itemsMap.get(item.id);
        const resultado = saved?.resultado === "C" || saved?.resultado === "NC" || saved?.resultado === "NA" ? saved.resultado : "";
        const savedFotos = Array.isArray(saved?.fotos) ? (saved?.fotos as DraftItemPhotoState[]) : [];
        const rawSavedFotos = savedFotos.filter(foto => typeof foto?.dataUrl === "string" && foto.dataUrl.trim());
        const fotos: ItemPhotoState[] = rawSavedFotos.slice(0, 3).map((foto, fotoIdx) => {
          const dataUrl = String(foto.dataUrl);
          const name = foto?.name?.trim() ? foto.name.trim()! : `Imagem ${fotoIdx + 1}`;
          return {
            id: createPhotoId(),
            name,
            dataUrl,
            file: null,
            origin: "draft" as const,
          } satisfies ItemPhotoState;
        });
        base[item.id] = {
          resultado,
          observacao: saved?.observacao ?? "",
          osNumero: lockedOsValue ?? saved?.osNumero?.trim().toUpperCase() ?? "",
          fotos,
          fileKey: now + idx,
          criticidade: coerceSeverity(saved?.criticidade),
        };
      });
      setItemsState(base);
      const draftOsNormalized = draft.osNumero?.trim().toUpperCase() ?? "";
      setOsNumero(lockedOsValue ?? draftOsNormalized);
      setObservacoes(draft.observacoes ?? "");
      const validResolveIds = draft.resolveIssues
        .filter(id => typeof id === "string" && id.trim().length > 0)
        .map(id => id.trim())
        .sort();
      const resolveMap: Record<string, boolean> = {};
      validResolveIds.forEach(id => {
        resolveMap[id] = true;
      });
      setResolveIssues(resolveMap);
      setDraftFeedback(null);
      const updatedAt = draft.updatedAt ?? null;
      setLastDraftUpdatedAt(updatedAt);
      const signatureValue = draft.assinaturaDataUrl ?? null;
      setSignatureDataUrl(signatureValue);
      setSignatureTouched(!!signatureValue);
      if (signatureValue) {
        setTimeout(() => {
          try {
            signatureRef.current?.fromDataURL?.(signatureValue);
          } catch {
            // ignore load errors
          }
        }, 0);
      } else {
        signatureRef.current?.clear?.();
      }
      const normalizedItems: DraftItemState[] = sortedItems
        .filter(item => item?.id)
        .map(item => {
          const saved = itemsMap.get(item.id as string);
          const resultado = saved?.resultado === "C" || saved?.resultado === "NC" || saved?.resultado === "NA" ? saved.resultado : "";
          const observacao = saved?.observacao?.trim() ?? "";
          const rawFotos = Array.isArray(saved?.fotos)
            ? (saved?.fotos as DraftItemPhotoState[]).filter(
                foto => typeof foto?.dataUrl === "string" && foto.dataUrl.trim()
              )
            : [];
          return {
            templateItemId: item.id as string,
            resultado,
            observacao,
            osNumero: lockedOsValue ?? saved?.osNumero ?? "",
            fotos: rawFotos.slice(0, 3).map(foto => ({
              dataUrl: String(foto.dataUrl),
              name: foto?.name?.trim() ? foto.name.trim() : null,
            })),
            criticidade: coerceSeverity(saved?.criticidade),
          };
        });
      const normalizedPayload: DraftDataState = {
        osNumero: lockedOsValue ?? draftOsNormalized,
        observacoes: (draft.observacoes ?? "").trim(),
        assinaturaDataUrl: signatureValue,
        itens: normalizedItems,
        resolveIssues: validResolveIds,
        updatedAt,
      };
      lastDraftPayloadRef.current = JSON.stringify(normalizedPayload);
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    },
    [sortedItems, osBloqueado]
  );

  useEffect(() => {
    if (!context?.machine?.tag) {
      return;
    }
    let cancelled = false;
    const currentTag = context.machine.tag ?? tag;
    async function loadDraft() {
      setDraftLoading(true);
      setDraftError(null);
      try {
        const response = await fetch(`/api/inspecoes/drafts/${encodeURIComponent(currentTag)}` , {
          cache: "no-store",
        });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(typeof payload?.error === "string" ? payload.error : "Falha ao carregar rascunho");
        }
        const data = await response.json();
        if (cancelled) return;
        const draft = data?.draft;
        if (draft) {
          applyDraft({
            osNumero: draft.osNumero ?? "",
            observacoes: draft.observacoes ?? "",
            assinaturaDataUrl: draft.assinaturaDataUrl ?? null,
            itens: Array.isArray(draft.itens)
              ? draft.itens.map((item: DraftItemState) => ({
                  templateItemId: item.templateItemId,
                  resultado: item.resultado ?? "",
                  observacao: item.observacao ?? "",
                  osNumero: item.osNumero ?? "",
                  fotos: Array.isArray(item.fotos)
                    ? item.fotos.filter(photo => typeof photo?.dataUrl === "string" && photo.dataUrl.trim())
                    : [],
                }))
              : [],
            resolveIssues: Array.isArray(draft.resolveIssues) ? draft.resolveIssues : [],
            updatedAt: draft.updatedAt ?? null,
          });
        } else {
          lastDraftPayloadRef.current = null;
          setLastDraftUpdatedAt(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar rascunho";
          setDraftError(message);
        }
      } finally {
        if (!cancelled) {
          setDraftLoading(false);
        }
      }
    }
    loadDraft();
    return () => {
      cancelled = true;
    };
  }, [context?.machine?.tag, applyDraft, tag]);

  const buildCurrentDraftPayload = useCallback((): DraftDataState => {
    const normalizedOs = osNumero.trim().toUpperCase();
    const normalizedObs = observacoes.trim();
    const itens: DraftItemState[] = [];
    sortedItems.forEach(item => {
      if (!item?.id) return;
      const st = itemsState[item.id];
      const resultado = st?.resultado === "C" || st?.resultado === "NC" || st?.resultado === "NA" ? st.resultado : "";
      const observacao = st?.observacao?.trim() ?? "";
      const osNumeroItem = st?.osNumero?.trim().toUpperCase() ?? "";
      const fotos = Array.isArray(st?.fotos)
        ? (st?.fotos as ItemPhotoState[])
            .filter(foto => typeof foto?.dataUrl === "string" && foto.dataUrl.trim())
            .slice(0, 3)
            .map(foto => ({
              dataUrl: foto.dataUrl,
              name: foto.name ?? null,
            }))
        : [];
      itens.push({
        templateItemId: item.id,
        resultado,
        observacao,
        osNumero: osNumeroItem,
        fotos,
        criticidade: st?.criticidade ?? null,
      });
    });
    const resolveIds = Object.entries(resolveIssues)
      .filter(([, checked]) => checked)
      .map(([id]) => id)
      .sort();
    return {
      osNumero: normalizedOs,
      observacoes: normalizedObs,
      assinaturaDataUrl: signatureDataUrl ?? null,
      itens,
      resolveIssues: resolveIds,
    };
  }, [itemsState, observacoes, osNumero, resolveIssues, signatureDataUrl, sortedItems]);

  const saveDraft = useCallback(
    async (mode: "manual" | "auto") => {
      if (!context?.machine?.tag) return;
      const draftState = buildCurrentDraftPayload();
      const fingerprint = JSON.stringify(draftState);
      if (mode === "auto" && lastDraftPayloadRef.current === fingerprint) {
        return;
      }
      if (mode === "manual" && lastDraftPayloadRef.current === fingerprint) {
        setDraftFeedback({ type: "success", message: "Rascunho já está atualizado." });
        return;
      }

      const payload = {
        osNumero: draftState.osNumero || undefined,
        observacoes: draftState.observacoes || undefined,
        assinaturaDataUrl: draftState.assinaturaDataUrl,
        itens: draftState.itens,
        resolveIssues: draftState.resolveIssues,
      };

      try {
        if (mode === "manual") {
          setDraftSaving(true);
          setDraftFeedback(null);
        } else {
          setAutoSavingDraft(true);
        }
        const response = await fetch(`/api/inspecoes/drafts/${encodeURIComponent(context.machine.tag)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payloadError = await response.json().catch(() => null);
          throw new Error(typeof payloadError?.error === "string" ? payloadError.error : "Falha ao salvar rascunho");
        }
        const data = await response.json();
        lastDraftPayloadRef.current = fingerprint;
        const updatedAt = data?.draft?.updatedAt ?? new Date().toISOString();
        setLastDraftUpdatedAt(updatedAt);
        setDraftError(null);
        if (draftTimerRef.current) {
          clearTimeout(draftTimerRef.current);
          draftTimerRef.current = null;
        }
        if (mode === "manual") {
          setDraftFeedback({ type: "success", message: "Rascunho salvo com sucesso." });
        }
      } catch (err: unknown) {
        const message = err instanceof Error && err.message ? err.message : "Falha ao salvar rascunho";
        setDraftError(message);
        if (mode === "manual") {
          setDraftFeedback({ type: "error", message });
        }
      } finally {
        if (mode === "manual") {
          setDraftSaving(false);
        } else {
          setAutoSavingDraft(false);
        }
      }
    },
    [buildCurrentDraftPayload, context?.machine?.tag]
  );

  const handleManualDraftSave = useCallback(() => {
    saveDraft("manual").catch(() => undefined);
  }, [saveDraft]);

  const openCancelModal = useCallback(() => {
    if (saving || lastInspectionId) return;
    setCancelConfirmText("");
    setCancelError(null);
    setShowCancelModal(true);
  }, [lastInspectionId, saving]);

  const closeCancelModal = useCallback(() => {
    if (cancelLoading) return;
    setShowCancelModal(false);
    setCancelConfirmText("");
    setCancelError(null);
  }, [cancelLoading]);

  const confirmCancelInspection = useCallback(async () => {
    if (cancelLoading) return;
    if (!context?.machine?.tag) {
      setCancelError("Máquina sem TAG configurada.");
      return;
    }
    if (cancelConfirmText.trim().toLowerCase() !== "cancelar") {
      setCancelError('Digite "cancelar" para confirmar.');
      return;
    }
    setCancelLoading(true);
    try {
      await fetch(`/api/inspecoes/drafts/${encodeURIComponent(context.machine.tag)}`, { method: "DELETE" }).catch(() => undefined);
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      lastDraftPayloadRef.current = null;
      setLastDraftUpdatedAt(null);
      setDraftFeedback(null);
      setDraftError(null);
      setAutoSavingDraft(false);
      setShowCancelModal(false);
      setCancelConfirmText("");
      setCancelError(null);
      router.replace("/home");
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Não foi possível cancelar a inspeção.";
      setCancelError(message);
    } finally {
      setCancelLoading(false);
    }
  }, [cancelConfirmText, cancelLoading, context?.machine?.tag, router]);

  useEffect(() => {
    if (!context?.machine?.tag || isDraftLoading) {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      return;
    }
    const draftState = buildCurrentDraftPayload();
    const fingerprint = JSON.stringify(draftState);
    if (fingerprint === lastDraftPayloadRef.current) {
      return;
    }
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = setTimeout(() => {
      saveDraft("auto").catch(() => undefined);
    }, 5000);
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [buildCurrentDraftPayload, context?.machine?.tag, isDraftLoading, saveDraft]);

  /* ===== Derivados ===== */
  const hasNC = useMemo(() => Object.values(itemsState).some((i) => i.resultado === "NC"), [itemsState]);

  // itens que têm issue aberta -> vira “alerta amarelo”
  const templateItemsMap = useMemo(() => {
    const map = new Map<string, TemplateItem>();
    context?.template?.itens?.forEach(item => {
      if (item?.id) {
        map.set(item.id, item);
      }
    });
    return map;
  }, [context?.template?.itens]);

  const openIssuesByItem = useMemo(() => {
    const map = new Map<string, IssueRecord>();
    for (const issue of context?.openIssues ?? []) {
      if (issue.templateItemId) {
        map.set(issue.templateItemId, { ...issue, fotos: photosToUrls(ensureStoredPhotos(issue.fotos)) });
      }
    }
    return map;
  }, [context?.openIssues]);

  const itemsWithOpenIssue = useMemo(() => new Set(openIssuesByItem.keys()), [openIssuesByItem]);

  const draftStatusMessage = useMemo(() => {
    if (draftSaving) return "Salvando rascunho...";
    if (autoSavingDraft) return "Salvando rascunho automaticamente...";
    if (isDraftLoading) return "Carregando rascunho...";
    if (lastDraftUpdatedAt) {
      try {
        return `Rascunho salvo em ${new Date(lastDraftUpdatedAt).toLocaleString("pt-BR")}`;
      } catch {
        return "Rascunho salvo.";
      }
    }
    return "Rascunho automático ativo.";
  }, [autoSavingDraft, draftSaving, isDraftLoading, lastDraftUpdatedAt]);

  /* ===== Handlers (mesmos nomes/contratos) ===== */
  const handleResultadoChange = useCallback(
    (itemId: string, value: "C" | "NC" | "NA") => {
      setItemsState(prev => {
        const previous = prev[itemId] ?? createEmptyItemState();
        const nextState: ItemFormState = {
          ...previous,
          resultado: value,
        };
        if (value === "NC") {
          nextState.criticidade = previous.criticidade ?? (3 as Severity);
        } else {
          nextState.criticidade = null;
        }
        return {
          ...prev,
          [itemId]: nextState,
        };
      });
    },
    [createEmptyItemState]
  );

  const handleObservacaoChange = useCallback(
    (itemId: string, value: string) => {
      setItemsState(prev => {
        const previous = prev[itemId] ?? createEmptyItemState();
        return {
          ...prev,
          [itemId]: {
            ...previous,
            observacao: value,
          },
        };
      });
    },
    [createEmptyItemState]
  );

  const handleItemOsNumeroChange = useCallback(
    (itemId: string, value: string) => {
      if (osBloqueado) return;
      setItemsState(prev => {
        const previous = prev[itemId] ?? createEmptyItemState();
        return {
          ...prev,
          [itemId]: {
            ...previous,
            osNumero: value.toUpperCase(),
          },
        };
      });
    },
    [createEmptyItemState, osBloqueado]
  );

  const handleCriticidadeChange = useCallback(
    (itemId: string, value: Severity) => {
      setItemsState(prev => {
        const previous = prev[itemId] ?? createEmptyItemState();
        if (previous.criticidade === value) {
          return prev;
        }
        return {
          ...prev,
          [itemId]: {
            ...previous,
            criticidade: value,
          },
        };
      });
    },
    [createEmptyItemState]
  );

  const handleFotosChange = useCallback(
    (itemId: string, event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const files = Array.from(input.files ?? []);
      input.value = "";
      if (!files.length) return;

      (async () => {
        try {
          const limitedFiles = files.slice(0, 3);
          const newPhotos: ItemPhotoState[] = [];
          for (const file of limitedFiles) {
            const dataUrl = await fileToDataUrl(file);
            newPhotos.push({
              id: createPhotoId(),
              name: file.name || "Imagem",
              dataUrl,
              file,
              origin: "local" as const,
            });
          }

          setItemsState(prev => {
            const prevItem = prev[itemId] ?? createEmptyItemState();
            const existingFotos = Array.isArray(prevItem.fotos) ? prevItem.fotos : [];
            const combined = [...existingFotos, ...newPhotos].slice(0, 3);
            return {
              ...prev,
              [itemId]: {
                ...prevItem,
                fotos: combined,
                fileKey: Date.now(),
              },
            };
          });
        } catch {
          setFeedback({ type: "error", message: "Não foi possível processar as imagens selecionadas." });
        }
      })();
    },
    [createEmptyItemState, setFeedback]
  );

  const handleRemoveFoto = useCallback((itemId: string, fotoId: string) => {
    setItemsState(prev => {
      const prevItem = prev[itemId];
      if (!prevItem) return prev;
      const remaining = prevItem.fotos.filter(foto => foto.id !== fotoId);
      return {
        ...prev,
        [itemId]: {
          ...prevItem,
          fotos: remaining,
          fileKey: Date.now(),
        },
      };
    });
  }, []);

  const handleResolveIssue = useCallback((issueId: string, checked: boolean) => {
    setResolveIssues((prev) => ({ ...prev, [issueId]: checked }));
  }, []);

  const handleSignatureEnd = useCallback(() => {
    setSignatureMode("new");
    setSignatureTouched(true);
    if (signatureRef.current?.isEmpty && signatureRef.current.isEmpty()) {
      setSignatureDataUrl(null);
      return;
    }
    if (signatureRef.current?.toDataURL) {
      try {
        const dataUrl = signatureRef.current.toDataURL("image/png");
        setSignatureDataUrl(dataUrl);
      } catch {
        // ignore export errors
      }
    }
  }, []);

  const submitInspection = useCallback(
    async (mode: "save" | "save-new") => {
      if (!context?.machine?.tag) { setFeedback({ type: "error", message: "Máquina sem TAG configurada." }); return; }
      if (saving) return;
      setSaving(true); setSavingAction(mode); setFeedback(null);
      try {
        const payloadItems: Array<{
          templateItemId: string;
          resultado: "C" | "NC" | "NA";
          observacaoItem?: string;
          fotos?: string[];
          osNumeroItem?: string;
          criticidade?: Severity;
        }> = [];
        const lockedOsNumero = osBloqueado ?? null;
        for (const item of sortedItems) {
          if (!item.id) continue;
          const st = itemsState[item.id];
          if (!st || !st.resultado) { setFeedback({ type: "error", message: "Selecione C / NC / N/A para todos os itens." }); setSaving(false); setSavingAction(null); return; }
          const osValue = (lockedOsNumero ?? st.osNumero).trim().toUpperCase();
          if (st.resultado === "NC" && !osValue) {
            setFeedback({ type: "error", message: "Informe o Nº da O.S. para todos os itens marcados como NC." });
            setSaving(false);
            setSavingAction(null);
            return;
          }
          const osNumeroItem = osValue || undefined;
          let fotosBase64: string[] | undefined;
          if (st.fotos.length) {
            const fotosValues = await Promise.all(
              st.fotos.slice(0, 3).map(async (foto) => {
                if (typeof foto.dataUrl === "string" && foto.dataUrl.startsWith("data:")) {
                  return foto.dataUrl;
                }
                if (foto.file) {
                  try {
                    return await fileToDataUrl(foto.file);
                  } catch {
                    return null;
                  }
                }
                return null;
              })
            );
            const normalized = fotosValues.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
            fotosBase64 = normalized.length ? normalized : undefined;
          }
          if (st.resultado === "NC" && !st.criticidade) {
            setFeedback({ type: "error", message: "Informe a criticidade sugerida para cada item NC." });
            setSaving(false);
            setSavingAction(null);
            return;
          }
          payloadItems.push({
            templateItemId: item.id,
            resultado: st.resultado,
            observacaoItem: st.observacao.trim() || undefined,
            fotos: fotosBase64,
            osNumeroItem,
            criticidade: st.resultado === "NC" && st.criticidade ? st.criticidade : undefined,
          });
        }
        if (!payloadItems.length) { setFeedback({ type: "error", message: "Template sem itens configurados." }); setSaving(false); setSavingAction(null); return; }

        let assinaturaDataUrl: string | undefined;
        let assinaturaProfileId: string | undefined;
        if (signatureMode === "saved" && savedSignatureProfile?.assinaturaUrl && savedSignatureProfile?.id) {
          assinaturaProfileId = savedSignatureProfile.id;
        } else if (signatureRef.current?.isEmpty && !signatureRef.current.isEmpty()) {
          assinaturaDataUrl = signatureRef.current.toDataURL("image/png");
        } else if (signatureDataUrl) {
          assinaturaDataUrl = signatureDataUrl;
        }

        if (!assinaturaDataUrl && !assinaturaProfileId) {
          setFeedback({ type: "error", message: "Informe a assinatura antes de salvar." });
          setSaving(false);
          setSavingAction(null);
          return;
        }
        const resolveIds = Object.entries(resolveIssues).filter(([, c]) => c).map(([id]) => id);

        const normalizedOsNumero = lockedOsNumero ?? osNumero.trim().toUpperCase();

        const response = await fetch("/api/inspecoes", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tag: context.machine.tag,
            osNumero: normalizedOsNumero || undefined,
            observacoes: observacoes.trim() || undefined,
            assinaturaDataUrl,
            assinaturaProfileId,
            itens: payloadItems,
            resolveIssues: resolveIds.length ? resolveIds : undefined,
            programacaoId: programacaoId ?? undefined,
            programacaoBatchId: programacaoBatchId ?? undefined,
            prazoProgramado: programacaoPrazo ?? undefined,
          }),
        });
        if (response.status === 401) { window.location.href = "/login"; return; }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(typeof payload?.error === "string" ? payload.error : "Falha ao salvar inspeção.");
        }
        const data = await response.json();
        const inspectionId = data?.id ? String(data.id) : null;
        const assinaturaUrlResposta = data?.assinaturaUrl ? String(data.assinaturaUrl) : null;
        if (inspectionId) setLastInspectionId(inspectionId);

        if (signatureMode === "new" && saveMaintSignatureChoice && assinaturaUrlResposta) {
          try {
            await fetch("/api/assinaturas/maint", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assinaturaUrl: assinaturaUrlResposta }),
            });
            refreshSavedSignature();
          } catch (err) {
            console.error("[maint-signature] failed to save", err);
          }
        }

        await fetch(`/api/inspecoes/drafts/${encodeURIComponent(context.machine.tag)}`, { method: "DELETE" }).catch(() => undefined);
        lastDraftPayloadRef.current = null;
        setLastDraftUpdatedAt(null);
        setDraftFeedback(null);
        setDraftError(null);
        if (draftTimerRef.current) {
          clearTimeout(draftTimerRef.current);
          draftTimerRef.current = null;
        }

        const params = new URLSearchParams();
        params.set("ok", "1");
        if (inspectionId) {
          params.set("inspecaoId", inspectionId);
        }
        router.replace(`/home?${params.toString()}`);
      } catch (err: unknown) {
        setFeedback({ type: "error", message: err instanceof Error && err.message ? err.message : "Falha ao salvar inspeção." });
      } finally { setSaving(false); setSavingAction(null); }
    },
    [
      context,
      itemsState,
      observacoes,
      osNumero,
      resolveIssues,
      router,
      saving,
      savedSignatureProfile,
      signatureDataUrl,
      signatureMode,
      sortedItems,
      osBloqueado,
      programacaoId,
      programacaoBatchId,
      programacaoPrazo,
      saveMaintSignatureChoice,
      refreshSavedSignature,
    ]
  );

  /* ===== Render ===== */
  if (!tag) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">Informe uma TAG válida para iniciar a inspeção.</div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">Carregando dados da inspeção...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      {/* Header + PDF */}
      <header className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Checklist — {context?.machine?.nome ?? tag.toUpperCase()}</h1>
            {context?.machine?.tag && (
              <p className="text-sm text-gray-600">
                TAG: <code className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-700">{context.machine.tag}</code>
              </p>
            )}
            {context?.maintainer && (
              <p className="text-sm text-gray-600">
                Mantenedor: <span className="font-medium">{context.maintainer.nome ?? "-"}</span> (mat. {context.maintainer.matricula ?? "-"})
              </p>
            )}
          </div>

          <a
            href={lastInspectionId ? `/api/inspecoes/${lastInspectionId}/pdf` : "#"}
            target="_blank" rel="noreferrer"
            className={`inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition ${
              lastInspectionId ? "border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100"
              : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
            }`} aria-disabled={!lastInspectionId}>
            Gerar PDF
          </a>
        </div>

        {feedback && (
          <div className={`rounded-md border px-4 py-3 text-sm ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {feedback.message}
          </div>
        )}
        {draftFeedback && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              draftFeedback.type === "success"
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {draftFeedback.message}
          </div>
        )}
        {draftError && !draftFeedback && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {draftError}
          </div>
        )}
      </header>

      {/* Não conformidades anteriores */}
      {context && (
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Não conformidades anteriores</h2>
            {context.openIssues.length > 0 && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                {context.openIssues.length === 1
                  ? "1 item pendente"
                  : `${context.openIssues.length} itens pendentes`}
              </span>
            )}
          </div>
          {context.openIssues.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhuma não conformidade aberta para esta TAG.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {context.openIssues.map(issue => (
                <label
                  key={issue.id}
                  className="flex cursor-pointer flex-col gap-1 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700 transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!resolveIssues[issue.id]}
                      onChange={e => handleResolveIssue(issue.id, e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 space-y-1">
                      <p className="font-medium text-gray-800">
                        {(() => {
                          if (issue.templateItemId) {
                            const itemData = templateItemsMap.get(issue.templateItemId);
                            if (itemData) {
                              return itemData.componente || itemData.criterio || itemData.oQueChecar || `Item ${itemData.id}`;
                            }
                          }
                          return issue.descricao ?? "Item sem identificação";
                        })()}
                      </p>
                      {issue.descricao && (
                        <p className="text-sm text-gray-600">
                          <span className="font-medium text-gray-700">Descrição:</span> {issue.descricao}
                        </p>
                      )}
                      {issue.osNumero && <p className="text-xs text-gray-500">Nº da O.S.: {issue.osNumero}</p>}
                      {issue.severity ? (
                        <CriticidadeBadge state={issue.severity} showStatus className="mt-1 inline-flex" />
                      ) : null}
                      {issue.createdAt && (
                        <p className="text-xs text-gray-400">Aberta em {new Date(issue.createdAt).toLocaleString("pt-BR")}</p>
                      )}
                      {issue.fotos?.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {issue.fotos.map((foto, index) => (
                            <a
                              key={`${issue.id}-list-foto-${index}`}
                              href={foto.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded border border-blue-200"
                            >
                              <Image
                                src={foto.url}
                                alt={`Foto da NC anterior`}
                                width={96}
                                height={72}
                                className="h-16 w-24 object-cover"
                                unoptimized
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}
                      <p className="text-xs text-gray-600">Marcar como resolvida nesta inspeção</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Identificação da máquina (visual novo) */}
      {context && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex-1 space-y-1 text-sm text-gray-700">
              <div className="text-lg font-semibold text-gray-900">{context.machine.nome ?? "Máquina"}</div>
              <div>Unidade: {context.machine.unidade ?? "-"}</div>
              <div>Local: {context.machine.localUnidade ?? "-"}</div>
              <div>Setor: {context.machine.setor ?? "-"}</div>
              <div>LAC: {context.machine.lac ?? "-"}</div>
              {programacaoId && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  <i className="fas fa-calendar-check" aria-hidden />
                  Programação vinculada — OS {osNumero || osBloqueado || "-"}
                </div>
              )}
            </div>
            {context.machine.fotoUrl && (
              <div className="relative h-40 w-full overflow-hidden rounded-md border bg-gray-50 md:h-44 md:w-44">
                <Image src={context.machine.fotoUrl} alt={`Foto da máquina ${context.machine.nome ?? context.machine.tag ?? ""}`} fill className="object-cover" sizes="176px" />
              </div>
            )}
          </div>
        </section>
      )}

      {/* OS / Observações */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700 font-medium">Nº da O.S.</span>
            <input
              value={osNumero}
              onChange={e => {
                if (osBloqueado) return;
                setOsNumero(e.target.value.toUpperCase());
              }}
              readOnly={Boolean(osBloqueado)}
              placeholder="Opcional"
              className={`rounded-md border border-gray-300 px-3 py-2 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${osBloqueado ? "cursor-not-allowed bg-gray-100 text-gray-500" : "bg-white"}`}
            />
            {osBloqueado && (
              <span className="text-xs text-gray-500">
                Número vinculado à programação. Não é possível editar.
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700 font-medium">Observações gerais</span>
            <textarea
              value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3}
              placeholder="Registre observações relevantes"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
        </div>

        {hasNC && !osNumero.trim() && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Existem itens marcados como NC. Considere informar o Nº da O.S.
          </div>
        )}
      </section>

      {/* Não conformidades anteriores */}
      {context && (
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Não conformidades anteriores</h2>
            {context.openIssues.length > 0 && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                {context.openIssues.length === 1
                  ? "1 item pendente"
                  : `${context.openIssues.length} itens pendentes`}
              </span>
            )}
          </div>
          {context.openIssues.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhuma não conformidade aberta para esta TAG.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {context.openIssues.map(issue => (
                <label
                  key={issue.id}
                  className="flex cursor-pointer flex-col gap-1 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700 transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!resolveIssues[issue.id]}
                      onChange={e => handleResolveIssue(issue.id, e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 space-y-1">
                      <p className="font-medium text-gray-800">
                        {(() => {
                          if (issue.templateItemId) {
                            const itemData = templateItemsMap.get(issue.templateItemId);
                            if (itemData) {
                              return itemData.componente || itemData.criterio || itemData.oQueChecar || `Item ${itemData.id}`;
                            }
                          }
                          return issue.descricao ?? "Item sem identificação";
                        })()}
                      </p>
                      {issue.descricao && (
                        <p className="text-sm text-gray-600">
                          <span className="font-medium text-gray-700">Descrição:</span> {issue.descricao}
                        </p>
                      )}
                      {issue.osNumero && <p className="text-xs text-gray-500">Nº da O.S.: {issue.osNumero}</p>}
                      {issue.createdAt && (
                        <p className="text-xs text-gray-400">Aberta em {new Date(issue.createdAt).toLocaleString("pt-BR")}</p>
                      )}
                      {issue.fotos?.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {issue.fotos.map((foto, index) => (
                            <a
                              key={`${issue.id}-list-foto-${index}`}
                              href={foto.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded border border-blue-200"
                            >
                              <Image
                                src={foto.url}
                                alt={`Foto da NC anterior`}
                                width={96}
                                height={72}
                                className="h-16 w-24 object-cover"
                                unoptimized
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}
                      <p className="text-xs text-gray-600">Marcar como resolvida nesta inspeção</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Checklist – layout novo + destaque amarelo quando houver issue aberta */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Perguntas</h2>
          <p className="text-sm text-gray-600">Template: {context?.template?.nome ?? "-"}</p>
        </div>

        {sortedItems.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600">Nenhum item configurado para este template.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {sortedItems.map((item, idx) => {
              if (!item.id) return null;
              const st = itemsState[item.id];
              const hasOpenIssue = itemsWithOpenIssue.has(item.id);

              return (
                <article key={item.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">
                        <span className="mr-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">{String(idx + 1).padStart(2, "0")}</span>
                        {item.componente ?? "Item sem nome"}
                      </p>
                      {item.oQueChecar && <p className="text-sm text-gray-700">O que checar: {item.oQueChecar}</p>}
                      {item.instrumento && <p className="text-sm text-gray-700">Instrumento: {item.instrumento}</p>}
                      {item.criterio && <p className="text-sm text-gray-700">Critério: {item.criterio}</p>}
                      {item.oQueFazer && <p className="text-sm text-gray-700">O que fazer: {item.oQueFazer}</p>}
                    </div>
                    {item.imagemItemUrl && (
                      <div className="relative h-28 w-full overflow-hidden rounded-md border bg-gray-50 md:h-32 md:w-32">
                        <Image src={item.imagemItemUrl} alt={`Imagem do item ${item.componente ?? item.id}`} fill className="object-cover" sizes="128px" />
                      </div>
                    )}
                  </header>

                  {hasOpenIssue && (
                    <div className="mt-3 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-medium">Este item possui não conformidade anterior. Avalie e informe o resultado.</p>
                      {(() => {
                        const issue = openIssuesByItem.get(item.id!);
                        if (!issue) return null;
                        const templateItem = templateItemsMap.get(item.id!);
                        const label = templateItem?.componente || templateItem?.criterio || templateItem?.oQueChecar || `Item ${String(idx + 1).padStart(2, "0")}`;
                        return (
                          <div className="space-y-1 text-amber-900/90">
                            <p className="text-sm">
                              <span className="font-semibold">Item:</span> {label}
                            </p>
                            {issue.descricao && (
                              <p className="text-sm">
                                <span className="font-semibold">Descrição registrada:</span> {issue.descricao}
                              </p>
                            )}
                            {issue.osNumero && (
                              <p className="text-sm">
                                <span className="font-semibold">Nº da O.S.:</span> {issue.osNumero}
                              </p>
                            )}
                            {issue.fotos?.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {issue.fotos.map((foto, fotoIdx) => (
                                  <a
                                    key={`${issue.id}-foto-${fotoIdx}`}
                                    href={foto.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block overflow-hidden rounded border border-amber-200"
                                  >
                                    <Image
                                      src={foto.url}
                                      alt={`Foto da NC anterior - ${label}`}
                                      width={96}
                                      height={72}
                                      className="h-16 w-24 object-cover"
                                      unoptimized
                                    />
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    {/* Resultado (botões) */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">Resultado</p>
                      <div className="flex flex-wrap gap-2">
                        {RESULT_OPTIONS.map((option) => (
                          <ChoiceBtn
                            key={option.value}
                            tone={option.tone}
                            active={st?.resultado === option.value}
                            onClick={() => handleResultadoChange(item.id!, option.value)}
                            ariaLabel={`Marcar como ${option.label === "C" ? "Conforme" : option.label === "NC" ? "Não Conforme" : "Não se Aplica"}`}
                          >
                            {option.label}
                          </ChoiceBtn>
                        ))}
                      </div>
                    </div>

                    {/* Observação */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700" htmlFor={`observacao-${item.id}`}>Observações</label>
                      <textarea
                        id={`observacao-${item.id}`} value={st?.observacao ?? ""} rows={3}
                        onChange={(e) => handleObservacaoChange(item.id!, e.target.value)}
                        placeholder="Detalhe evidências/observações relevantes"
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                  </div>

                  {st?.resultado === "NC" && (
                    <>
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-medium text-gray-700">Criticidade Sugerida (mantenedor)</p>
                        <CriticidadeSelector
                          value={st?.criticidade ?? null}
                          onChange={value => handleCriticidadeChange(item.id!, value)}
                          disabled={saving}
                        />
                        <p className="text-xs text-gray-500">1 = baixa, 5 = muito alta.</p>
                      </div>
                      <div className="mt-3 space-y-1">
                        <label className="text-sm font-medium text-gray-700" htmlFor={`os-item-${item.id}`}>
                          Nº da O.S. deste item
                        </label>
                        <input
                          id={`os-item-${item.id}`}
                          value={st?.osNumero ?? ""}
                          onChange={event => handleItemOsNumeroChange(item.id!, event.target.value)}
                          readOnly={Boolean(osBloqueado)}
                          placeholder="Informe o número da O.S."
                          className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${osBloqueado ? "cursor-not-allowed bg-gray-100 text-gray-500" : "bg-white"}`}
                        />
                        <p className="text-xs text-gray-500">
                          {osBloqueado
                            ? "Número preenchido automaticamente a partir da programação."
                            : "Obrigatório para itens marcados como não conformes."}
                        </p>
                      </div>
                    </>
                  )}

                  {/* Fotos – área tracejada (mantendo seu handler) */}
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <label className="text-sm font-medium text-gray-700" htmlFor={`fotos-${item.id}`}>Fotos (até 3)</label>
                      <span className="text-xs text-gray-500">Arquivos aceitos: imagens</span>
                    </div>

                    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600">
                      <input
                        key={st?.fileKey ?? `${item.id}-0`}
                        id={`fotos-${item.id}`} type="file" accept="image/*" multiple className="sr-only"
                        onChange={(ev) => handleFotosChange(item.id!, ev)}
                      />
                      <span className="font-semibold">Selecionar imagens</span>
                      <span className="text-xs">Clique para escolher (máx. 3)</span>
                    </label>

                    {st?.fotos?.length ? (
                      <ul className="flex flex-wrap gap-3 text-xs text-gray-700">
                        {st.fotos.map(foto => (
                          <li
                            key={foto.id}
                            className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-100 p-2"
                          >
                            <a
                              href={foto.dataUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="relative block h-24 w-32 overflow-hidden rounded"
                              aria-label={`Abrir imagem ${foto.name || "anexada"} em uma nova aba`}
                            >
                              <Image
                                src={foto.dataUrl}
                                alt={foto.name || "Pré-visualização da imagem selecionada"}
                                fill
                                sizes="128px"
                                className="object-cover"
                                unoptimized
                              />
                            </a>
                            <div className="flex items-center justify-between gap-2">
                              <span className="max-w-[8rem] truncate" title={foto.name}>
                                {foto.name || "Imagem anexada"}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveFoto(item.id!, foto.id)}
                                className="text-red-500 transition hover:text-red-600"
                              >
                                Remover
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Assinatura do mantenedor */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Assinatura do mantenedor</p>
          {savedSignatureProfile?.assinaturaUrl ? (
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  className="h-4 w-4"
                  value="saved"
                  checked={signatureMode === "saved"}
                  onChange={() => {
                    setSignatureMode("saved");
                    setSaveMaintSignatureChoice(false);
                    setSignatureTouched(true);
                  }}
                />
                Usar assinatura salva
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  className="h-4 w-4"
                  value="new"
                  checked={signatureMode === "new"}
                  onChange={() => {
                    setSignatureMode("new");
                    const hasDraw = signatureRef.current?.isEmpty && !signatureRef.current.isEmpty();
                    setSignatureTouched(Boolean(hasDraw || signatureDataUrl));
                  }}
                />
                Desenhar nova assinatura
              </label>
            </div>
          ) : null}
          {signatureMode === "saved" && savedSignatureProfile?.assinaturaUrl ? (
            <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-md border border-gray-300 bg-white p-4">
              <Image
                src={savedSignatureProfile.assinaturaUrl}
                alt="Assinatura salva"
                width={320}
                height={160}
                className="max-h-36 w-full object-contain"
                unoptimized
              />
            </div>
          ) : (
            <div className="h-40 w-full overflow-hidden rounded-md border border-dashed border-gray-300 bg-gray-50">
              {typeof window !== "undefined" && (
                <SignatureCanvas
                  ref={signatureRef}
                  penColor="#111827"
                  backgroundColor="transparent"
                  onEnd={handleSignatureEnd}
                  canvasProps={{ className: "h-full w-full" }}
                />
              )}
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => {
                signatureRef.current?.clear?.();
                setSignatureTouched(false);
                setSignatureDataUrl(null);
              }}
              disabled={signatureMode === "saved"}
              className={`inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium transition ${
                signatureMode === "saved"
                  ? "cursor-not-allowed bg-gray-100 text-gray-400"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Limpar assinatura
            </button>
            {signatureMode === "new" && !signatureTouched && (
              <span className="text-xs text-gray-500">Assine utilizando o campo acima.</span>
            )}
          </div>
          {signatureMode === "new" && (
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={saveMaintSignatureChoice}
                onChange={event => setSaveMaintSignatureChoice(event.target.checked)}
              />
              <span>
                {savedSignatureProfile?.assinaturaUrl
                  ? "Substituir a assinatura salva por esta nova"
                  : "Salvar assinatura para as próximas inspeções"}
              </span>
            </label>
          )}
        </div>
      </section>

      {/* Footer com ações (mesmo fluxo) */}
      <footer className="mt-8 border-t border-gray-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2 text-sm text-gray-600">
            <a
              href={lastInspectionId ? `/api/inspecoes/${lastInspectionId}/pdf` : "#"}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex w-fit items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition ${
                lastInspectionId
                  ? "border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
              }`}
              aria-disabled={!lastInspectionId}
            >
              Gerar PDF
            </a>
            <p className="text-xs text-gray-500">{draftStatusMessage}</p>
            <p className="text-xs text-gray-400">Fotos anexadas são incluídas nos rascunhos e serão enviadas com a inspeção.</p>
          </div>
          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={openCancelModal}
                disabled={saving || draftSaving || isDraftLoading || cancelLoading}
                className="inline-flex items-center justify-center rounded-md border border-red-500 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-200 disabled:text-red-300"
              >
                Cancelar inspeção
              </button>
              <button
                type="button"
                onClick={handleManualDraftSave}
                disabled={draftSaving || saving || isDraftLoading || cancelLoading}
                className="inline-flex items-center justify-center rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {draftSaving ? "Salvando..." : "Salvar rascunho"}
              </button>
              <button
                type="button"
                disabled={saving || cancelLoading}
                onClick={() => submitInspection("save")}
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && savingAction === "save" ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                disabled={saving || cancelLoading}
                onClick={() => submitInspection("save-new")}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && savingAction === "save-new" ? "Salvando..." : "Salvar & Nova"}
              </button>
            </div>
          </div>
        </div>
      </footer>
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Cancelar inspeção</h2>
            <p className="mt-2 text-sm text-gray-600">
              Digite <strong>cancelar</strong> para confirmar o cancelamento desta inspeção. Essa ação descarta o rascunho atual.
            </p>
            <input
              ref={cancelInputRef}
              type="text"
              value={cancelConfirmText}
              onChange={event => {
                setCancelConfirmText(event.target.value);
                if (cancelError) setCancelError(null);
              }}
              placeholder="Digite cancelar"
              className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase tracking-wide text-gray-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200"
            />
            {cancelError && <p className="mt-2 text-sm text-red-600">{cancelError}</p>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCancelModal}
                disabled={cancelLoading}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmCancelInspection}
                disabled={cancelLoading}
                className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {cancelLoading ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
