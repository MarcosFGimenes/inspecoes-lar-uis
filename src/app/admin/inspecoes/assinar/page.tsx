"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import SignatureCanvas, { SignatureCanvasInstance } from "@/components/signature-canvas-client";
import { cn } from "@/lib/cn";
import type { ChecklistAnswer, ChecklistResponse } from "@/types";

interface PendingSignInspection {
  id: string;
  machineId: string | null;
  templateId: string | null;
  createdAt: string | null;
  operatorNome: string | null;
  operatorMatricula: string | null;
  hasNC: boolean;
  qtdNC: number;
  machineTag: string | null;
  machineNome: string | null;
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
    if (open && canvasRef.current) {
      canvasRef.current.clear();
    }
  }, [open, canvasRef]);

  if (!mounted || !open) return null;

  const answers: ChecklistAnswer[] = Array.isArray(detail?.inspection?.answers)
    ? (detail?.inspection?.answers as ChecklistAnswer[])
    : [];

  const inspectionInfo = detail?.inspection ?? null;
  const machineInfo = inspectionInfo?.machine ?? null;
  const maintainer = inspectionInfo?.maintainer ?? null;

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
                  {answers.length === 0 ? (
                    <EmptyState
                      title="Sem itens registrados"
                      description="Não foi possível localizar as respostas desta inspeção."
                      className="py-10"
                    />
                  ) : (
                    <div className="space-y-3">
                      {answers.map(answer => (
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
                          {Array.isArray(answer.photoUrls) && answer.photoUrls.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {answer.photoUrls.map((url, index) => (
                                <div key={`${answer.questionId}-photo-${index}`} className="overflow-hidden rounded-md border">
                                  <Image
                                    src={url}
                                    alt={`Foto da inspeção - item ${answer.questionId}`}
                                    width={160}
                                    height={120}
                                    className="h-24 w-40 object-cover"
                                    unoptimized
                                  />
                                </div>
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
                <span className="text-[var(--muted)]">Nome *</span>
                <Input value={nome} onChange={event => onNomeChange(event.target.value)} placeholder="Digite o nome" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">Cargo</span>
                <Input value={cargo} onChange={event => onCargoChange(event.target.value)} placeholder="Cargo (opcional)" />
              </label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-[var(--muted)]">
                <span>Assinatura</span>
                <Button type="button" variant="ghost" onClick={onClear} disabled={loading || detailLoading}>
                  Limpar
                </Button>
              </div>
              <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
                <SignatureCanvas
                  ref={canvasRef}
                  penColor="#111827"
                  canvasProps={{ className: "h-48 w-full" }}
                />
              </div>
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
  const [selected, setSelected] = useState<PendingSignInspection | null>(null);
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
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
      setItems(Array.isArray(data) ? data : []);
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
    if (!search.trim()) return items;
    const term = search.trim().toLowerCase();
    return items.filter(item => {
      const machine = `${item.machineNome ?? ""} ${item.machineTag ?? ""}`.toLowerCase();
      const operator = `${item.operatorNome ?? ""} ${item.operatorMatricula ?? ""}`.toLowerCase();
      return machine.includes(term) || operator.includes(term);
    });
  }, [items, search]);

  const withNc = filteredItems.filter(item => item.hasNC);
  const withoutNc = filteredItems.filter(item => !item.hasNC);

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

  const handleConfirmSignature = useCallback(async () => {
    if (!selected) return;

    const trimmedName = nome.trim();
    if (!trimmedName) {
      setModalError("Informe o nome do PCM");
      return;
    }

    const canvas = signatureRef.current;
    if (!canvas || canvas.isEmpty()) {
      setModalError("Desenhe a assinatura antes de confirmar");
      return;
    }

    const trimmedCargo = cargo.trim();

    let assinaturaDataUrl: string | null = null;
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

    try {
      setModalLoading(true);
      setModalError(null);
      const payload = {
        nome: trimmedName,
        cargo: trimmedCargo ? trimmedCargo : undefined,
        assinaturaDataUrl,
      };

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
  }, [broadcastRef, cargo, closeModal, nome, selected]);

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
        <Input
          className="w-full sm:w-80"
          placeholder="Buscar por TAG ou operador"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
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
          {withNc.length === 0 ? (
            <EmptyState title="Nenhuma inspeção com NC" description="Tudo em dia por aqui." className="py-10" />
          ) : (
            <div className="space-y-4">
              {withNc.map(item => (
                <Card key={item.id} className="border-2 border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_92%)]">
                  <CardHeader className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="danger">{item.qtdNC} NC</Badge>
                    </div>
                    <CardTitle className="text-lg text-[var(--text)]">
                      {item.machineNome ?? "Máquina"} {item.machineTag ? `(${item.machineTag})` : ""}
                    </CardTitle>
                    <p className="text-sm text-[var(--muted)]">
                      Operador: {item.operatorNome || "-"}
                      {item.operatorMatricula ? ` (${item.operatorMatricula})` : ""}
                    </p>
                    <p className="text-sm text-[var(--muted)]">Realizada em {formatDateTime(item.createdAt)}</p>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div className="text-sm text-[var(--muted)]">
                      Assinatura do PCM pendente.
                    </div>
                    <Button onClick={() => openModal(item)}>Assinar</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Sem não conformidade</h2>
            <p className="text-sm text-[var(--muted)]">Inspeções aprovadas que aguardam apenas sua assinatura.</p>
          </div>
          {withoutNc.length === 0 ? (
            <EmptyState title="Nenhuma inspeção pendente" description="Nenhuma assinatura aguardando nesta lista." className="py-10" />
          ) : (
            <div className="space-y-4">
              {withoutNc.map(item => (
                <Card key={item.id} className="border border-[var(--border)] bg-[var(--surface)]">
                  <CardHeader className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Sem NC</Badge>
                    </div>
                    <CardTitle className="text-lg text-[var(--text)]">
                      {item.machineNome ?? "Máquina"} {item.machineTag ? `(${item.machineTag})` : ""}
                    </CardTitle>
                    <p className="text-sm text-[var(--muted)]">
                      Operador: {item.operatorNome || "-"}
                      {item.operatorMatricula ? ` (${item.operatorMatricula})` : ""}
                    </p>
                    <p className="text-sm text-[var(--muted)]">Realizada em {formatDateTime(item.createdAt)}</p>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div className="text-sm text-[var(--muted)]">Pronta para ser assinada.</div>
                    <Button variant="secondary" onClick={() => openModal(item)}>
                      Assinar
                    </Button>
                  </CardContent>
                </Card>
              ))}
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
