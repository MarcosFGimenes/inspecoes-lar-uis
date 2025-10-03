"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import SignatureCanvas, { SignatureCanvasInstance } from "@/components/signature-canvas-client";

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
  canvasRef: MutableRefObject<SignatureCanvasInstance | null>;
  onClear(): void;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
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
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Assinar inspeção</h2>
            <p className="text-sm text-[var(--muted)]">Informe seus dados e desenhe a assinatura no campo abaixo.</p>
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

        <div className="mt-4 space-y-4">
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Nome do PCM *</span>
            <Input value={nome} onChange={event => onNomeChange(event.target.value)} placeholder="Digite o nome" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Cargo</span>
            <Input value={cargo} onChange={event => onCargoChange(event.target.value)} placeholder="Cargo (opcional)" />
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-[var(--muted)]">
              <span>Assinatura</span>
              <Button type="button" variant="ghost" onClick={onClear} disabled={loading}>
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
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} loading={loading}>
            Confirmar assinatura
          </Button>
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
  const signatureRef = useRef<SignatureCanvasInstance | null>(null);

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

  const openModal = useCallback((inspection: PendingSignInspection) => {
    setSelected(inspection);
    setNome("");
    setCargo("");
    setModalError(null);
    setTimeout(() => signatureRef.current?.clear(), 0);
  }, []);

  const closeModal = useCallback(() => {
    setSelected(null);
    setNome("");
    setCargo("");
    setModalError(null);
    signatureRef.current?.clear();
  }, []);

  const handleClearSignature = useCallback(() => {
    signatureRef.current?.clear();
  }, []);

  const handleConfirmSignature = useCallback(async () => {
    if (!selected) return;
    if (!nome.trim()) {
      setModalError("Informe o nome do PCM");
      return;
    }
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      setModalError("Desenhe a assinatura antes de confirmar");
      return;
    }

    try {
      setModalLoading(true);
      setModalError(null);
      const assinaturaDataUrl = signatureRef.current.getTrimmedCanvas().toDataURL("image/png");
      const payload = {
        nome: nome.trim(),
        cargo: cargo.trim() ? cargo.trim() : undefined,
        assinaturaDataUrl,
      };

      const response = await fetch(`/api/inspecoes/${selected.id}/pcm-sign`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Não foi possível registrar a assinatura");
      }

      setItems(prev => prev.filter(item => item.id !== selected.id));
      setSuccessMessage("Assinatura registrada com sucesso.");
      closeModal();
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao registrar assinatura";
      setModalError(message);
    } finally {
      setModalLoading(false);
    }
  }, [cargo, closeModal, nome, selected]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 p-6">
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
      />
    </div>
  );
}
