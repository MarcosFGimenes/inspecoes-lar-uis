"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import SignatureCanvas, { SignatureCanvasInstance } from "@/components/signature-canvas-client";
import { cn } from "@/lib/cn";
import type { ChecklistAnswer, ChecklistResponse } from "@/types";
import { normalizeStoredImages } from "@/lib/storage/images";

interface PendingSignInspection {
  id: string;
  machineId: string | null;
  templateId: string | null;
  createdAt: string | null;
  operatorNome: string | null;
  operatorMatricula: string | null;
  maintainerId: string | null;
  hasNC: boolean;
  qtdNC: number;
  machineTag: string | null;
  machineNome: string | null;
}

interface MaintainerOption {
  id: string;
  nome: string | null;
  matricula: string | null;
}

interface PcmProfileOption {
  id: string;
  nome: string | null;
  matricula: string | null;
  assinaturaUrl: string | null;
}

interface InspectionDetailData {
  inspection: ChecklistResponse;
  template: Record<string, unknown> | null;
  machine: ChecklistResponse["machine"] | null;
}

interface SignatureModalProps {
  open: boolean;
  onClose(): void;
  onConfirm(): void;
  nome: string;
  cargo: string;
  onNomeChange(value: string): void;
  onCargoChange(value: string): void;
  profiles: PcmProfileOption[];
  selectedProfileId: string;
  onProfileSelect(value: string): void;
  matricula: string;
  onMatriculaChange(value: string): void;
  signatureMode: "saved" | "new";
  onSignatureModeChange(mode: "saved" | "new"): void;
  saveSignatureChoice: boolean;
  onSaveSignatureChoiceChange(value: boolean): void;
  loading: boolean;
  error: string | null;
  canvasRef: RefObject<SignatureCanvasInstance | null>;
  onClear(): void;
  detail: InspectionDetailData | null;
  detailLoading: boolean;
  detailError: string | null;
}

type PcmSignResponse = {
  ok?: boolean;
  error?: string;
  pcmSign?: {
    signedAt?: string;
    nome?: string;
    cargo?: string | null;
    matricula?: string | null;
    assinaturaUrl?: string | null;
  };
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

const responseLabels: Record<ChecklistAnswer["response"], string> = {
  c: "Conforme",
  nc: "Não conforme",
  na: "Não se aplica",
};

const responseBadgeVariant: Record<ChecklistAnswer["response"], "success" | "danger" | "muted"> = {
  c: "success",
  nc: "danger",
  na: "muted",
};

function SearchParamSync({ onChange }: { onChange: (value: string | null) => void }) {
  const searchParams = useSearchParams();
  const inspecao = searchParams.get("inspecao");

  useEffect(() => {
    onChange(inspecao);
  }, [inspecao, onChange]);

  return null;
}

function SignatureModal({
  open,
  onClose,
  onConfirm,
  nome,
  cargo,
  onNomeChange,
  onCargoChange,
  profiles,
  selectedProfileId,
  onProfileSelect,
  matricula,
  onMatriculaChange,
  signatureMode,
  onSignatureModeChange,
  saveSignatureChoice,
  onSaveSignatureChoiceChange,
  loading,
  error,
  canvasRef,
  onClear,
  detail,
  detailLoading,
  detailError,
}: SignatureModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (open && signatureMode === "new") {
      canvasRef.current?.clear();
    }
  }, [open, signatureMode, canvasRef]);

  if (!mounted || !open) return null;

  const answers: ChecklistAnswer[] = Array.isArray(detail?.inspection?.answers)
    ? (detail?.inspection?.answers as ChecklistAnswer[])
    : [];
  const normalizedAnswers = answers.map(answer => ({
    ...answer,
    photoUrls: normalizeStoredImages(answer.photoUrls ?? []),
  }));

  const inspectionInfo = detail?.inspection ?? null;
  const machineInfo = inspectionInfo?.machine ?? null;
  const maintainer = inspectionInfo?.maintainer ?? null;
  const selectedProfile = profiles.find(profile => profile.id === selectedProfileId) ?? null;
  const isNewProfile = selectedProfileId === "new";
  const hasSavedSignature = Boolean(selectedProfile?.assinaturaUrl);
  const usingSavedSignature = signatureMode === "saved" && hasSavedSignature;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Revisar inspeção antes de assinar</h2>
            <p className="text-sm text-[var(--muted)]">
              Confira os detalhes registrados e confirme a assinatura para concluir o processo.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--surface)]"
            onClick={onClose}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-6">
          <section className="space-y-4">
            <h3 className="text-base font-semibold text-[var(--text)]">Resumo da inspeção</h3>
            {detailLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : detailError ? (
              <div className="rounded-lg border border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_85%)] px-4 py-3 text-[var(--danger)]">
                {detailError}
              </div>
            ) : inspectionInfo ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--muted)]">Máquina</p>
                      <p className="text-sm text-[var(--text)]">
                        {machineInfo?.nome ?? "-"}
                        {machineInfo?.tag ? ` (${machineInfo.tag})` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--muted)]">Data/Hora</p>
                      <p className="text-sm text-[var(--text)]">
                        {formatDateTime(inspectionInfo.finalizadaEm ?? inspectionInfo.createdAt ?? null)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--muted)]">Operador</p>
                      <p className="text-sm text-[var(--text)]">
                        {maintainer?.nome ?? "-"}
                        {maintainer?.matricula ? ` (${maintainer.matricula})` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--muted)]">Nº da O.S.</p>
                      <p className="text-sm text-[var(--text)]">{inspectionInfo.osNumero ?? "-"}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-sm font-medium text-[var(--muted)]">Observações gerais</p>
                      <p className="text-sm text-[var(--text)] whitespace-pre-line">
                        {inspectionInfo.observacoes?.trim() ? inspectionInfo.observacoes : "Sem observações adicionais."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[var(--text)]">Itens avaliados</h4>
                    <Badge variant={inspectionInfo.qtdNC && inspectionInfo.qtdNC > 0 ? "danger" : "success"}>
                      {inspectionInfo.qtdNC && inspectionInfo.qtdNC > 0
                        ? `${inspectionInfo.qtdNC} NC`
                        : "Sem NC"}
                    </Badge>
                  </div>
                  {normalizedAnswers.length === 0 ? (
                    <EmptyState
                      title="Sem itens registrados"
                      description="Não foi possível localizar as respostas desta inspeção."
                      className="py-10"
                    />
                  ) : (
                    <div className="space-y-3">
                      {normalizedAnswers.map(answer => (
                        <div
                          key={answer.questionId}
                          className={cn(
                            "rounded-lg border p-4",
                            answer.response === "nc"
                              ? "border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_92%)]"
                              : "border-[var(--border)] bg-white"
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-medium text-[var(--text)]">
                              {answer.questionText ?? `Item ${answer.questionId}`}
                            </p>
                            <Badge variant={responseBadgeVariant[answer.response]}>
                              {responseLabels[answer.response]}
                            </Badge>
                          </div>
                          {answer.recurrence ? (
                            <div className="mt-2">
                              <Badge variant="warning">Reincidência</Badge>
                            </div>
                          ) : null}
                          {answer.observation?.trim() ? (
                            <p className="mt-2 text-sm text-[var(--text)]">
                              <span className="font-medium text-[var(--muted)]">Observação:</span> {answer.observation}
                            </p>
                          ) : null}
                          {answer.itemOsNumero?.trim() ? (
                            <p className="text-xs text-[var(--muted)]">
                              Nº da O.S. do item: <span className="font-medium text-[var(--text)]">{answer.itemOsNumero}</span>
                            </p>
                          ) : null}
                          {answer.photoUrls && answer.photoUrls.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {answer.photoUrls.map((photo, index) => (
                                <a
                                  key={`${answer.questionId}-photo-${index}`}
                                  href={photo.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group overflow-hidden rounded-md border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                                >
                                  <Image
                                    src={photo.url}
                                    alt={`Foto da inspeção - item ${answer.questionId}`}
                                    width={160}
                                    height={120}
                                    className="h-24 w-40 object-cover transition-transform duration-200 group-hover:scale-105"
                                    unoptimized
                                  />
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                title="Inspeção não encontrada"
                description="Não foi possível carregar os detalhes desta inspeção."
                className="py-10"
              />
            )}
          </section>

          <section className="space-y-4">
            <h3 className="text-base font-semibold text-[var(--text)]">Assinatura do PCM</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">Nome salvo</span>
                <Select
                  value={selectedProfileId}
                  onChange={event => onProfileSelect(event.target.value)}
                  disabled={loading}
                >
                  <option value="new">Outro (digitar novo nome)</option>
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.nome ?? profile.id}
                      {profile.matricula ? ` — Matrícula ${profile.matricula}` : ""}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">Nome *</span>
                <Input
                  value={nome}
                  onChange={event => onNomeChange(event.target.value)}
                  placeholder="Digite o nome"
                  disabled={!isNewProfile || loading}
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">Matrícula *</span>
                <Input
                  value={matricula}
                  onChange={event => onMatriculaChange(event.target.value.toUpperCase())}
                  placeholder="Digite a matrícula"
                  disabled={loading}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">Cargo</span>
                <Input
                  value={cargo}
                  onChange={event => onCargoChange(event.target.value)}
                  placeholder="Cargo (opcional)"
                  disabled={loading}
                />
              </label>
            </div>
            <div className="space-y-3">
              {hasSavedSignature ? (
                <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--muted)]">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      className="h-4 w-4"
                      value="saved"
                      checked={signatureMode === "saved"}
                      onChange={() => onSignatureModeChange("saved")}
                      disabled={loading}
                    />
                    Usar assinatura salva
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      className="h-4 w-4"
                      value="new"
                      checked={signatureMode === "new"}
                      onChange={() => onSignatureModeChange("new")}
                      disabled={loading}
                    />
                    Desenhar nova assinatura
                  </label>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-sm text-[var(--muted)]">
                <span>Assinatura</span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClear}
                  disabled={loading || detailLoading || signatureMode === "saved"}
                >
                  Limpar
                </Button>
              </div>
              {usingSavedSignature ? (
                <div className="flex items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-white p-4">
                  <Image
                    src={selectedProfile?.assinaturaUrl ?? ""}
                    alt={selectedProfile?.nome ? `Assinatura salva de ${selectedProfile.nome}` : "Assinatura salva"}
                    width={320}
                    height={160}
                    className="max-h-40 w-full object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
                  <SignatureCanvas
                    ref={canvasRef}
                    penColor="#111827"
                    canvasProps={{ className: "h-48 w-full" }}
                  />
                </div>
              )}
              {signatureMode === "new" ? (
                <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={saveSignatureChoice}
                    onChange={event => onSaveSignatureChoiceChange(event.target.checked)}
                    disabled={loading}
                  />
                  <span>
                    {hasSavedSignature
                      ? "Atualizar a assinatura salva com este novo desenho"
                      : "Salvar esta assinatura para as próximas inspeções"}
                  </span>
                </label>
              ) : null}
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              loading={loading}
              disabled={loading || detailLoading}
            >
              Confirmar assinatura
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function PendingSignaturesPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingSignInspection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [withNcIndex, setWithNcIndex] = useState(0);
  const [withoutNcIndex, setWithoutNcIndex] = useState(0);
  const [selected, setSelected] = useState<PendingSignInspection | null>(null);
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [matricula, setMatricula] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string>("new");
  const [signatureMode, setSignatureMode] = useState<"saved" | "new">("new");
  const [saveSignatureChoice, setSaveSignatureChoice] = useState(false);
  const [maintainers, setMaintainers] = useState<MaintainerOption[]>([]);
  const [maintainerFilter, setMaintainerFilter] = useState<string>("all");
  const [pcmProfiles, setPcmProfiles] = useState<PcmProfileOption[]>([]);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [handledParam, setHandledParam] = useState<string | null>(null);
  const [pendingInspectionId, setPendingInspectionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InspectionDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const signatureRef = useRef<SignatureCanvasInstance | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);

  const refreshPcmProfiles = useCallback(async () => {
    try {
      const response = await fetch("/api/assinaturas/pcm", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as PcmProfileOption[];
      if (Array.isArray(data)) {
        setPcmProfiles(data);
      }
    } catch (err) {
      console.error("[pcm-profiles] failed to load", err);
    }
  }, []);

  useEffect(() => {
    async function loadMaintainers() {
      try {
        const response = await fetch("/api/mantenedores", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as Array<Record<string, unknown>>;
        if (Array.isArray(data)) {
          const options: MaintainerOption[] = data.map(item => ({
            id: String(item.id ?? ""),
            nome: typeof item.nome === "string" ? item.nome : null,
            matricula: typeof item.matricula === "string" ? item.matricula : null,
          }));
          setMaintainers(options.filter(option => option.id));
        }
      } catch (err) {
        console.error("[maintainers] failed to load", err);
      }
    }

    loadMaintainers();
    refreshPcmProfiles();
  }, [refreshPcmProfiles]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const session = await fetch("/api/admin-session", { cache: "no-store" });
      if (session.status === 401) {
        window.location.href = "/admin/login";
        return;
      }

      const response = await fetch("/api/inspecoes/pending-sign", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Falha ao carregar inspeções");
      }
      const data = (await response.json()) as PendingSignInspection[];
      const normalized = Array.isArray(data)
        ? [...data].sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeB - timeA;
          })
        : [];
      setItems(normalized);
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao carregar inspeções";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
      return undefined;
    }
    const channel = new BroadcastChannel("pcm-inspecoes-events");
    broadcastRef.current = channel;
    return () => {
      channel.close();
    };
  }, []);

  useEffect(() => {
    return () => {
      detailAbortRef.current?.abort();
    };
  }, []);

  const filteredItems = useMemo(() => {
    const baseItems = maintainerFilter === "all"
      ? items
      : items.filter(item => item.maintainerId === maintainerFilter);
    if (!search.trim()) return baseItems;
    const term = search.trim().toLowerCase();
    return baseItems.filter(item => {
      const machine = `${item.machineNome ?? ""} ${item.machineTag ?? ""}`.toLowerCase();
      const operator = `${item.operatorNome ?? ""} ${item.operatorMatricula ?? ""}`.toLowerCase();
      return machine.includes(term) || operator.includes(term);
    });
  }, [items, maintainerFilter, search]);

  const withNc = filteredItems.filter(item => item.hasNC);
  const withoutNc = filteredItems.filter(item => !item.hasNC);

  useEffect(() => {
    setWithNcIndex(0);
    setWithoutNcIndex(0);
  }, [items]);

  useEffect(() => {
    setWithNcIndex(0);
    setWithoutNcIndex(0);
  }, [maintainerFilter, search]);

  useEffect(() => {
    if (withNcIndex >= withNc.length) {
      setWithNcIndex(withNc.length > 0 ? withNc.length - 1 : 0);
    }
  }, [withNcIndex, withNc.length]);

  useEffect(() => {
    if (withoutNcIndex >= withoutNc.length) {
      setWithoutNcIndex(withoutNc.length > 0 ? withoutNc.length - 1 : 0);
    }
  }, [withoutNcIndex, withoutNc.length]);

  const currentWithNc = withNc[withNcIndex] ?? null;
  const currentWithoutNc = withoutNc[withoutNcIndex] ?? null;

  const handleNextWithNc = useCallback(() => {
    setWithNcIndex(prev => {
      if (withNc.length === 0) return 0;
      const next = Math.min(prev + 1, withNc.length - 1);
      return next;
    });
  }, [withNc.length]);

  const handlePreviousWithNc = useCallback(() => {
    setWithNcIndex(prev => {
      if (withNc.length === 0) return 0;
      const next = Math.max(prev - 1, 0);
      return next;
    });
  }, [withNc.length]);

  const handleNextWithoutNc = useCallback(() => {
    setWithoutNcIndex(prev => {
      if (withoutNc.length === 0) return 0;
      const next = Math.min(prev + 1, withoutNc.length - 1);
      return next;
    });
  }, [withoutNc.length]);

  const handlePreviousWithoutNc = useCallback(() => {
    setWithoutNcIndex(prev => {
      if (withoutNc.length === 0) return 0;
      const next = Math.max(prev - 1, 0);
      return next;
    });
  }, [withoutNc.length]);

  const fetchDetail = useCallback(
    async (inspectionId: string) => {
      if (!inspectionId) return;
      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;
      setDetailLoading(true);
      setDetailError(null);
      setDetail(null);
      try {
        const response = await fetch(`/api/inspecoes/${inspectionId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Não foi possível carregar a inspeção");
        }
        const data = (await response.json()) as InspectionDetailData;
        if (!controller.signal.aborted) {
          setDetail(data);
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error && err.message ? err.message : "Erro ao carregar inspeção";
        setDetailError(message);
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
    },
    []
  );

  const openModal = useCallback(
    (inspection: PendingSignInspection) => {
      setSelected(inspection);
      setNome("");
      setCargo("");
      setMatricula("");
      setSelectedProfileId("new");
      setSignatureMode("new");
      setSaveSignatureChoice(false);
      setModalError(null);
      setDetail(null);
      setDetailError(null);
      fetchDetail(inspection.id);
      setTimeout(() => signatureRef.current?.clear(), 0);
    },
    [fetchDetail]
  );

  const closeModal = useCallback(() => {
    detailAbortRef.current?.abort();
    setSelected(null);
    setNome("");
    setCargo("");
    setMatricula("");
    setSelectedProfileId("new");
    setSignatureMode("new");
    setSaveSignatureChoice(false);
    setModalError(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    signatureRef.current?.clear();
  }, []);

  useEffect(() => {
    if (!pendingInspectionId) {
      setHandledParam(null);
      return;
    }
    if (loading) return;
    if (handledParam === pendingInspectionId) return;
    const match = items.find(item => item.id === pendingInspectionId);
    if (match) {
      openModal(match);
      setHandledParam(pendingInspectionId);
    }
  }, [handledParam, items, loading, openModal, pendingInspectionId]);

  const handleClearSignature = useCallback(() => {
    signatureRef.current?.clear();
  }, []);

  const handleProfileSelect = useCallback(
    (value: string) => {
      setSelectedProfileId(value);
      setModalError(null);
      if (value === "new") {
        setNome("");
        setMatricula("");
        setSignatureMode("new");
        setSaveSignatureChoice(false);
        setTimeout(() => signatureRef.current?.clear(), 0);
        return;
      }
      const profile = pcmProfiles.find(item => item.id === value) ?? null;
      setNome(profile?.nome ?? "");
      setMatricula(profile?.matricula ? profile.matricula.toUpperCase() : "");
      setSignatureMode(profile?.assinaturaUrl ? "saved" : "new");
      setSaveSignatureChoice(false);
      setTimeout(() => signatureRef.current?.clear(), 0);
    },
    [pcmProfiles]
  );

  const handleConfirmSignature = useCallback(async () => {
    if (!selected) return;

    const profile = selectedProfileId === "new" ? null : pcmProfiles.find(item => item.id === selectedProfileId) ?? null;
    const baseName = profile?.nome ?? nome;
    const trimmedName = baseName.trim();
    if (!trimmedName) {
      setModalError("Informe o nome do PCM");
      return;
    }

    const trimmedMatricula = matricula.trim();
    if (!trimmedMatricula) {
      setModalError("Informe a matrícula do PCM");
      return;
    }

    const normalizedMatricula = trimmedMatricula.toUpperCase();
    const expectedMatricula = profile?.matricula ? profile.matricula.toUpperCase() : null;
    if (expectedMatricula && expectedMatricula !== normalizedMatricula) {
      setModalError("A matrícula informada não confere com o nome selecionado.");
      return;
    }

    const trimmedCargo = cargo.trim();

    let assinaturaDataUrl: string | null = null;
    let assinaturaProfileId: string | null = null;

    if (signatureMode === "saved") {
      if (!profile || !profile.assinaturaUrl) {
        setModalError("A assinatura salva não está disponível.");
        return;
      }
      assinaturaProfileId = profile.id;
    } else {
      const canvas = signatureRef.current;
      if (!canvas || canvas.isEmpty()) {
        setModalError("Desenhe a assinatura antes de confirmar");
        return;
      }
      try {
        const rawCanvas = canvas.getCanvas();
        assinaturaDataUrl = rawCanvas.toDataURL("image/png");
      } catch (err) {
        console.error("[pcm-sign] failed to export canvas:", err);
        assinaturaDataUrl = null;
      }
      if (!assinaturaDataUrl) {
        setModalError("Não foi possível processar a assinatura. Tente novamente.");
        return;
      }
    }

    try {
      setModalLoading(true);
      setModalError(null);
      const payload: Record<string, unknown> = {
        nome: trimmedName,
        cargo: trimmedCargo ? trimmedCargo : undefined,
        matricula: normalizedMatricula,
      };

      if (assinaturaProfileId) {
        payload.assinaturaProfileId = assinaturaProfileId;
      } else if (assinaturaDataUrl) {
        payload.assinaturaDataUrl = assinaturaDataUrl;
      }

      const response = await fetch(`/api/inspecoes/${selected.id}/pcm-sign`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      let parsed: PcmSignResponse | null = null;
      try {
        parsed = rawText ? (JSON.parse(rawText) as PcmSignResponse) : null;
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        const serverMessage = parsed?.error || rawText || "Não foi possível registrar a assinatura";
        console.error("[pcm-sign] request failed", response.status, serverMessage);
        throw new Error(serverMessage);
      }

      const assinaturaUrlFromResponse = parsed?.pcmSign?.assinaturaUrl ?? null;
      const shouldSaveSignature = signatureMode === "saved" || saveSignatureChoice;

      try {
        const profilePayload: Record<string, unknown> = {
          nome: trimmedName,
          matricula: normalizedMatricula,
          saveSignature: shouldSaveSignature,
        };
        const resolvedSignatureUrl =
          signatureMode === "saved"
            ? profile?.assinaturaUrl ?? assinaturaUrlFromResponse ?? null
            : saveSignatureChoice
            ? assinaturaUrlFromResponse
            : null;
        if (shouldSaveSignature && resolvedSignatureUrl) {
          profilePayload.assinaturaUrl = resolvedSignatureUrl;
        }
        const upsertResponse = await fetch("/api/assinaturas/pcm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(profilePayload),
        });
        if (upsertResponse.ok) {
          const updatedProfile = (await upsertResponse.json()) as PcmProfileOption;
          setPcmProfiles(prev => {
            const list = prev.filter(item => item.id !== updatedProfile.id);
            return [...list, updatedProfile];
          });
        } else {
          const upsertText = await upsertResponse.text();
          console.error("[pcm-profiles] upsert failed", upsertResponse.status, upsertText);
        }
      } catch (profileErr) {
        console.error("[pcm-profiles] error while saving profile", profileErr);
      }

      refreshPcmProfiles();
      setItems(prev => prev.filter(item => item.id !== selected.id));
      setSuccessMessage("Assinatura registrada com sucesso.");
      if (broadcastRef.current) {
        const signedAtIso =
          parsed?.pcmSign?.signedAt && typeof parsed.pcmSign.signedAt === "string"
            ? parsed.pcmSign.signedAt
            : new Date().toISOString();
        broadcastRef.current.postMessage({
          type: "inspection-signed",
          id: selected.id,
          nome: parsed?.pcmSign?.nome ?? payload.nome,
          cargo: parsed?.pcmSign?.cargo ?? payload.cargo ?? null,
          signedAt: signedAtIso,
        });
      }
      closeModal();
    } catch (err: unknown) {
      console.error("[pcm-sign] client error:", err);
      const message = err instanceof Error && err.message ? err.message : "Erro ao registrar assinatura";
      setModalError(message);
    } finally {
      setModalLoading(false);
    }
  }, [
    broadcastRef,
    cargo,
    closeModal,
    matricula,
    nome,
    pcmProfiles,
    refreshPcmProfiles,
    saveSignatureChoice,
    selected,
    selectedProfileId,
    signatureMode,
  ]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        <Suspense fallback={null}>
          <SearchParamSync onChange={setPendingInspectionId} />
        </Suspense>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">Assinaturas pendentes</h1>
            <p className="text-sm text-[var(--muted)]">Inspeções aguardando assinatura do PCM.</p>
          </div>
          <Input placeholder="Buscar por máquina ou operador" disabled />
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map(key => (
            <Card key={key}>
              <CardHeader>
                <Skeleton className="h-6 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 p-6">
        <Suspense fallback={null}>
          <SearchParamSync onChange={setPendingInspectionId} />
        </Suspense>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">Assinaturas pendentes</h1>
            <p className="text-sm text-[var(--muted)]">Inspeções aguardando assinatura do PCM.</p>
          </div>
          <Button variant="secondary" onClick={() => loadData()}>
            Recarregar
          </Button>
        </header>
        <div className="rounded-lg border border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_80%)] px-4 py-3 text-[var(--danger)]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <Suspense fallback={null}>
        <SearchParamSync onChange={setPendingInspectionId} />
      </Suspense>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-[var(--text)]">Assinaturas pendentes</h1>
          <p className="text-sm text-[var(--muted)]">
            Priorize as inspeções com não conformidades antes de concluir as demais.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          <Select
            value={maintainerFilter}
            onChange={event => setMaintainerFilter(event.target.value)}
            className="w-full sm:w-64"
          >
            <option value="all">Todos os mantenedores</option>
            {maintainers.map(option => (
              <option key={option.id} value={option.id}>
                {option.matricula ? `${option.matricula} — ` : ""}
                {option.nome ?? option.id}
              </option>
            ))}
          </Select>
          <Input
            className="w-full sm:w-80"
            placeholder="Buscar por TAG ou operador"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
      </header>

      {successMessage && (
        <div className="rounded-lg border border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary),#fff_80%)] px-4 py-3 text-[var(--primary-700)]">
          {successMessage}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Com não conformidade</h2>
            <p className="text-sm text-[var(--muted)]">Inspeções que registraram NCs exigem sua atenção prioritária.</p>
          </div>
          {withNc.length === 0 || !currentWithNc ? (
            <EmptyState title="Nenhuma inspeção com NC" description="Tudo em dia por aqui." className="py-10" />
          ) : (
            <div className="space-y-4">
              <Card className="border-2 border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_92%)]">
                <CardHeader className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="danger">{currentWithNc.qtdNC} NC</Badge>
                  </div>
                  <CardTitle className="text-lg text-[var(--text)]">
                    {currentWithNc.machineNome ?? "Máquina"} {currentWithNc.machineTag ? `(${currentWithNc.machineTag})` : ""}
                  </CardTitle>
                  <p className="text-sm text-[var(--muted)]">
                    Operador: {currentWithNc.operatorNome || "-"}
                    {currentWithNc.operatorMatricula ? ` (${currentWithNc.operatorMatricula})` : ""}
                  </p>
                  <p className="text-sm text-[var(--muted)]">Realizada em {formatDateTime(currentWithNc.createdAt)}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-[var(--muted)]">Assinatura do PCM pendente.</div>
                    <Button type="button" onClick={() => openModal(currentWithNc)}>
                      Assinar
                    </Button>
                  </div>
                  {withNc.length > 1 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
                      <span>
                        Mostrando {withNcIndex + 1} de {withNc.length} inspeções com NC.
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handlePreviousWithNc}
                          disabled={withNcIndex === 0}
                        >
                          Carregar anterior
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleNextWithNc}
                          disabled={withNcIndex >= withNc.length - 1}
                        >
                          Carregar próxima
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Sem não conformidade</h2>
            <p className="text-sm text-[var(--muted)]">Inspeções aprovadas que aguardam apenas sua assinatura.</p>
          </div>
          {withoutNc.length === 0 || !currentWithoutNc ? (
            <EmptyState title="Nenhuma inspeção pendente" description="Nenhuma assinatura aguardando nesta lista." className="py-10" />
          ) : (
            <div className="space-y-4">
              <Card className="border border-[var(--border)] bg-[var(--surface)]">
                <CardHeader className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="success">Sem NC</Badge>
                  </div>
                  <CardTitle className="text-lg text-[var(--text)]">
                    {currentWithoutNc.machineNome ?? "Máquina"} {currentWithoutNc.machineTag ? `(${currentWithoutNc.machineTag})` : ""}
                  </CardTitle>
                  <p className="text-sm text-[var(--muted)]">
                    Operador: {currentWithoutNc.operatorNome || "-"}
                    {currentWithoutNc.operatorMatricula ? ` (${currentWithoutNc.operatorMatricula})` : ""}
                  </p>
                  <p className="text-sm text-[var(--muted)]">Realizada em {formatDateTime(currentWithoutNc.createdAt)}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-[var(--muted)]">Pronta para ser assinada.</div>
                    <Button type="button" variant="secondary" onClick={() => openModal(currentWithoutNc)}>
                      Assinar
                    </Button>
                  </div>
                  {withoutNc.length > 1 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
                      <span>
                        Mostrando {withoutNcIndex + 1} de {withoutNc.length} inspeções sem NC.
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handlePreviousWithoutNc}
                          disabled={withoutNcIndex === 0}
                        >
                          Carregar anterior
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleNextWithoutNc}
                          disabled={withoutNcIndex >= withoutNc.length - 1}
                        >
                          Carregar próxima
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}
        </section>
      </div>

      <SignatureModal
        open={Boolean(selected)}
        onClose={closeModal}
        onConfirm={handleConfirmSignature}
        nome={nome}
        cargo={cargo}
        onNomeChange={setNome}
        onCargoChange={setCargo}
        profiles={pcmProfiles}
        selectedProfileId={selectedProfileId}
        onProfileSelect={handleProfileSelect}
        matricula={matricula}
        onMatriculaChange={setMatricula}
        signatureMode={signatureMode}
        onSignatureModeChange={setSignatureMode}
        saveSignatureChoice={saveSignatureChoice}
        onSaveSignatureChoiceChange={setSaveSignatureChoice}
        loading={modalLoading}
        error={modalError}
        canvasRef={signatureRef}
        onClear={handleClearSignature}
        detail={detail}
        detailLoading={detailLoading}
        detailError={detailError}
      />
    </div>
  );
}
