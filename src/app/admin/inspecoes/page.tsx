"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase-client";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChecklistAnswer, StoredImage } from "@/types";
import { cn } from "@/lib/cn";
import { normalizeStoredImages } from "@/lib/storage/images";

interface InspectionListItem {
  id: string;
  machineNome: string | null;
  machineTag: string | null;
  createdAt: string | null;
  maintainerNome: string | null;
  maintainerMatricula: string | null;
  maintainerId: string | null;
  maintainerKey: string;
  qtdNc: number;
  hasNc: boolean;
  osNumero: string | null;
  signed: boolean;
  signedAt: string | null;
  pcmNome: string | null;
  ncItems: Array<{ questionId: string; questionText: string | null; osNumero: string | null; photoUrls: StoredImage[] }>;
}


interface MaintainerOption {
  id: string;
  nome: string | null;
  matricula: string | null;
  ativo?: boolean;
}

interface InspectionStats {
  total: number;
  signed: number;
  pending: number;
  withNc: number;
}

const PAGE_SIZE = 20;
const MAINTAINERS_SESSION_CACHE_KEY = "admin-inspecoes-maintainers-v1";
type InspectionCursor = QueryDocumentSnapshot<DocumentData>;

const emptyStats: InspectionStats = {
  total: 0,
  signed: 0,
  pending: 0,
  withNc: 0,
};

function readSessionCache<T>(key: string): T[] | null {
  if (typeof window === "undefined") return null;
  const cached = window.sessionStorage.getItem(key);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

function writeSessionCache<T>(key: string, records: T[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(key, JSON.stringify(records));
}

function extractFirebaseIndexUrl(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/https:\/\/console\.firebase\.google\.com\/[^\s)]+/);
  return match?.[0] ?? null;
}

async function loadMaintainers(): Promise<MaintainerOption[]> {
  const cached = readSessionCache<MaintainerOption>(MAINTAINERS_SESSION_CACHE_KEY);
  if (cached) return cached;
  const snap = await getDocs(collection(firebaseDb, "mantenedores"));
  const records = snap.docs.map(docSnap => {
    const data = docSnap.data() ?? {};
    return {
      id: docSnap.id,
      nome: typeof data.nome === "string" ? data.nome : null,
      matricula: typeof data.matricula === "string" ? data.matricula.toUpperCase() : null,
      ativo: data.ativo !== false,
    } satisfies MaintainerOption;
  }).sort((a, b) => (a.nome ?? a.matricula ?? a.id).localeCompare(b.nome ?? b.matricula ?? b.id, "pt-BR"));
  writeSessionCache(MAINTAINERS_SESSION_CACHE_KEY, records);
  return records;
}

async function loadInspectionStats(): Promise<InspectionStats> {
  const inspectionsRef = collection(firebaseDb, "inspecoes");
  const [totalSnap, signedSnap, withNcSnap] = await Promise.all([
    getCountFromServer(inspectionsRef),
    getCountFromServer(query(inspectionsRef, where("pcmSign.assinaturaUrl", ">", ""))),
    getCountFromServer(query(inspectionsRef, where("qtdNC", ">", 0))),
  ]);

  const total = totalSnap.data().count;
  const signed = signedSnap.data().count;

  return {
    total,
    signed,
    pending: Math.max(total - signed, 0),
    withNc: withNcSnap.data().count,
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}


function mapInspectionDoc(doc: InspectionCursor): InspectionListItem {
  const data = doc.data() ?? {};
  const machine = (data.machine ?? {}) as Record<string, unknown>;
  const maintainer = (data.maintainer ?? {}) as Record<string, unknown>;
  const answers = Array.isArray(data.answers) ? (data.answers as ChecklistAnswer[]) : [];
  const itensRaw = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
  const ncItems =
    answers.length > 0
      ? answers
          .filter(answer => answer?.response === "nc")
          .map(answer => ({
            questionId: answer.questionId,
            questionText: answer.questionText ?? null,
            osNumero: answer.itemOsNumero ?? null,
            photoUrls: normalizeStoredImages(answer.photoUrls ?? []),
          }))
      : itensRaw
          .filter(item => String(item.resultado ?? item.response ?? "C").toLowerCase() === "nc")
          .map(item => ({
            questionId: String(item.templateItemId ?? item.questionId ?? ""),
            questionText:
              typeof item.componente === "string"
                ? item.componente
                : typeof item.criterio === "string"
                ? item.criterio
                : null,
            osNumero:
              typeof item.osNumeroItem === "string" && item.osNumeroItem.trim()
                ? item.osNumeroItem.trim().toUpperCase()
                : null,
            photoUrls: normalizeStoredImages(item.fotos ?? []),
          }));
  const qtdNc = typeof data.qtdNC === "number" ? data.qtdNC : ncItems.length;
  const pcmSign = (data.pcmSign ?? {}) as Record<string, unknown>;
  const maintainerId =
    typeof maintainer.id === "string" && maintainer.id.trim()
      ? maintainer.id.trim()
      : typeof maintainer.maintId === "string" && maintainer.maintId.trim()
      ? maintainer.maintId.trim()
      : null;
  const maintainerMatricula =
    typeof maintainer.matricula === "string" && maintainer.matricula.trim()
      ? maintainer.matricula.trim().toUpperCase()
      : null;
  const maintainerNome = maintainer.nome ? String(maintainer.nome) : null;
  const maintainerKey =
    maintainerId ??
    maintainerMatricula ??
    (maintainerNome ? maintainerNome.trim().toLowerCase() : null) ??
    "unknown";

  return {
    id: doc.id,
    machineNome: machine.nome ? String(machine.nome) : null,
    machineTag: machine.tag ? String(machine.tag) : null,
    createdAt: data.createdAt ? String(data.createdAt) : null,
    maintainerNome,
    maintainerMatricula,
    maintainerId,
    maintainerKey,
    qtdNc,
    hasNc: qtdNc > 0,
    osNumero: data.osNumero ? String(data.osNumero) : null,
    signed: Boolean(pcmSign && pcmSign.assinaturaUrl),
    signedAt: pcmSign?.signedAt ? String(pcmSign.signedAt) : null,
    pcmNome: pcmSign?.nome ? String(pcmSign.nome) : null,
    ncItems,
  };
}

export default function AdminInspectionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InspectionListItem[]>([]);
  const [stats, setStats] = useState<InspectionStats>(emptyStats);
  const [maintainers, setMaintainers] = useState<MaintainerOption[]>([]);
  const [selectedMaintainerId, setSelectedMaintainerId] = useState<string | null>(null);
  const [indexUrl, setIndexUrl] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreItems, setHasMoreItems] = useState(false);
  const lastInspectionCursorRef = useRef<InspectionCursor | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnDialogItem, setReturnDialogItem] = useState<InspectionListItem | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchInspectionPage = useCallback(async (maintainerId: string, mode: "reset" | "append" = "reset") => {
    const shouldAppend = mode === "append";
    const cursor = lastInspectionCursorRef.current;
    if (shouldAppend && !cursor) return;

    if (shouldAppend) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      lastInspectionCursorRef.current = null;
      setHasMoreItems(false);
      setItems([]);
      setActionFeedback(null);
    }
    setError(null);
    setIndexUrl(null);

    try {
      if (!shouldAppend) {
        const session = await fetch("/api/admin-session", { cache: "no-store" });
        if (session.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
      }

      const constraints = [where("maintainer.id", "==", maintainerId), orderBy("createdAt", "desc")];
      const inspectionsQuery = query(
        collection(firebaseDb, "inspecoes"),
        ...(shouldAppend && cursor ? [...constraints, startAfter(cursor), limit(PAGE_SIZE)] : [...constraints, limit(PAGE_SIZE)])
      );

      const [inspectionsSnap, inspectionStats] = await Promise.all([
        getDocs(inspectionsQuery),
        shouldAppend ? Promise.resolve(null) : loadInspectionStats(),
      ]);

      const mapped = inspectionsSnap.docs.map(mapInspectionDoc);
      setItems(prev => (shouldAppend ? [...prev, ...mapped] : mapped));
      if (inspectionStats) setStats(inspectionStats);
      lastInspectionCursorRef.current = inspectionsSnap.docs.at(-1) ?? null;
      setHasMoreItems(inspectionsSnap.docs.length === PAGE_SIZE);
    } catch (err: unknown) {
      const indexLink = extractFirebaseIndexUrl(err);
      if (indexLink) setIndexUrl(indexLink);
      const message = err instanceof Error && err.message ? err.message : "Erro ao carregar inspeções";
      setError(indexLink ? "O Firestore exige um índice composto para esta consulta." : message);
    } finally {
      if (shouldAppend) setLoadingMore(false);
      else setLoading(false);
    }
  }, []);

  const loadData = useCallback(() => {
    if (selectedMaintainerId) {
      fetchInspectionPage(selectedMaintainerId, "reset");
      return;
    }
    setItems([]);
    setLoading(false);
  }, [fetchInspectionPage, selectedMaintainerId]);
  const handleLoadMore = useCallback(() => {
    if (selectedMaintainerId) fetchInspectionPage(selectedMaintainerId, "append");
  }, [fetchInspectionPage, selectedMaintainerId]);

  useEffect(() => {
    let mounted = true;
    async function initialize() {
      setLoading(true);
      setError(null);
      try {
        const session = await fetch("/api/admin-session", { cache: "no-store" });
        if (session.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        const [maintainerRecords, inspectionStats] = await Promise.all([loadMaintainers(), loadInspectionStats()]);
        if (!mounted) return;
        setMaintainers(maintainerRecords);
        setStats(inspectionStats);
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error && err.message ? err.message : "Erro ao carregar mantenedores";
        setError(message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    initialize();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
      return undefined;
    }
    const channel = new BroadcastChannel("pcm-inspecoes-events");
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; id?: string; nome?: string | null; signedAt?: string | null };
      if (data?.type === "inspection-signed" && data.id) {
        setItems(prev => {
          const changedItem = prev.find(item => item.id === data.id && !item.signed);
          if (changedItem) {
            setStats(current => ({
              ...current,
              signed: current.signed + 1,
              pending: Math.max(current.pending - 1, 0),
            }));
          }

          return prev.map(item =>
            item.id === data.id
              ? {
                  ...item,
                  signed: true,
                  signedAt: data.signedAt ?? new Date().toISOString(),
                  pcmNome: data.nome ?? item.pcmNome,
                }
              : item
          );
        });
      }
    };
    channel.addEventListener("message", handler);
    return () => {
      channel.removeEventListener("message", handler);
      channel.close();
    };
  }, []);

  const maintainerOptions = maintainers;
  const visibleItems = items;
  const hasMore = hasMoreItems;

  const selectMaintainer = useCallback((maintainerId: string) => {
    setSelectedMaintainerId(maintainerId);
    fetchInspectionPage(maintainerId, "reset");
  }, [fetchInspectionPage]);

  const clearMaintainers = useCallback(() => {
    setSelectedMaintainerId(null);
    setItems([]);
    lastInspectionCursorRef.current = null;
    setHasMoreItems(false);
    setIndexUrl(null);
    setError(null);
  }, []);


  const handleReturnInspection = useCallback(async () => {
    if (!returnDialogItem) return;

    setReturningId(returnDialogItem.id);
    setActionFeedback(null);
    try {
      const response = await fetch(`/api/inspecoes/${returnDialogItem.id}/return`, { method: "PATCH" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Falha ao devolver inspeção");
      }

      setItems(prev => prev.filter(item => item.id !== returnDialogItem.id));
      setActionFeedback({ type: "success", message: "Inspeção devolvida ao mantenedor como rascunho." });
      setReturnDialogItem(null);
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao devolver inspeção";
      setActionFeedback({ type: "error", message });
    } finally {
      setReturningId(null);
    }
  }, [returnDialogItem]);

  const handleDeleteInspection = useCallback(
    async (inspectionId: string) => {
      if (!inspectionId) return;
      const confirmed = window.confirm("Confirma a exclusão desta inspeção?");
      if (!confirmed) return;

      setDeletingId(inspectionId);
      setActionFeedback(null);
      try {
        const response = await fetch(`/api/inspecoes/${inspectionId}`, { method: "DELETE" });
        if (!response.ok) {
          const text = await response.text();
          let payload: { error?: string } | null = null;
          try {
            payload = text ? (JSON.parse(text) as { error?: string }) : null;
          } catch {
            payload = null;
          }
          throw new Error(payload?.error || "Falha ao excluir inspeção");
        }

        setItems(prev => {
          const deletedItem = prev.find(item => item.id === inspectionId);
          if (deletedItem) {
            setStats(current => ({
              total: Math.max(current.total - 1, 0),
              signed: deletedItem.signed ? Math.max(current.signed - 1, 0) : current.signed,
              pending: deletedItem.signed ? current.pending : Math.max(current.pending - 1, 0),
              withNc: deletedItem.hasNc ? Math.max(current.withNc - 1, 0) : current.withNc,
            }));
          }
          return prev.filter(item => item.id !== inspectionId);
        });
        setActionFeedback({ type: "success", message: "Inspeção excluída com sucesso." });
      } catch (err) {
        const message = err instanceof Error && err.message ? err.message : "Erro ao excluir inspeção";
        setActionFeedback({ type: "error", message });
      } finally {
        setDeletingId(null);
      }
    },
    []
  );

  const signedCount = stats.signed;
  const pendingCount = stats.pending;
  const withNcCount = stats.withNc;

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--text)]">Inspeções</h1>
        <p className="text-sm text-[var(--muted)]">
          Centralize o acompanhamento das inspeções: acesse rapidamente assinaturas pendentes, edições e relatórios.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_85%)] px-4 py-3 text-[var(--danger)]">
          <p>{error}</p>
          {indexUrl ? <a className="underline" href={indexUrl} target="_blank" rel="noreferrer">Criar índice composto no Firebase</a> : null}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-[var(--text)]">Assinaturas pendentes</CardTitle>
            <p className="text-sm text-[var(--muted)]">Priorize inspeções aguardando validação do PCM.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-[var(--text)]">{pendingCount}</span>
              <Badge variant={pendingCount > 0 ? "danger" : "success"}>{pendingCount > 0 ? "Pendentes" : "Tudo assinado"}</Badge>
            </div>
            <Link href="/admin/inspecoes/assinar" className={buttonStyles({ size: "sm" })}>
              Acessar assinaturas
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-[var(--text)]">Editar inspeções</CardTitle>
            <p className="text-sm text-[var(--muted)]">Atualize respostas, fotos e encerramento de NCs quando necessário.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-semibold text-[var(--text)]">{stats.total}</span>
              <Badge variant="muted">Registros</Badge>
              {withNcCount > 0 ? <Badge variant="warning">{withNcCount} com NC</Badge> : null}
            </div>
            <Link href="#lista-inspecoes" className={buttonStyles({ size: "sm", variant: "secondary" })}>
              Abrir lista para editar
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-[var(--text)]">Visualizar inspeções</CardTitle>
            <p className="text-sm text-[var(--muted)]">Consulte relatórios assinados e histórico completo.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-[var(--text)]">{signedCount}</span>
              <Badge variant={signedCount > 0 ? "success" : "muted"}>{signedCount > 0 ? "Assinadas" : "Aguardando"}</Badge>
            </div>
            <Link href="#lista-inspecoes" className={buttonStyles({ size: "sm", variant: "ghost" })}>
              Ver inspeções recentes
            </Link>
          </CardContent>
        </Card>
      </section>

      <Card id="lista-inspecoes">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg text-[var(--text)]">Lista de inspeções</CardTitle>
            <p className="text-sm text-[var(--muted)]">Visualize o status de assinatura e os acessos rápidos para cada inspeção.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              Recarregar
            </Button>
            <Link href="/admin/nc" className={buttonStyles({ size: "sm", variant: "ghost" })}>
              Tratativas de NC
            </Link>
            <Badge variant="muted">Assinadas: {signedCount}</Badge>
            <Badge variant={pendingCount > 0 ? "warning" : "muted"}>Pendentes: {pendingCount}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6 space-y-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--text)]">Filtrar por mantenedor</span>
              <p className="text-xs text-[var(--muted)]">
                Selecione um mantenedor para buscar no Firestore as últimas 20 inspeções vinculadas a ele.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearMaintainers}
                disabled={!selectedMaintainerId}
              >
                Limpar seleção
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {maintainerOptions.map(option => {
                const isActive = selectedMaintainerId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => selectMaintainer(option.id)}
                    className={cn(
                      buttonStyles({ variant: "ghost", size: "lg" }),
                      "group flex h-full min-h-[120px] w-full flex-col items-stretch justify-between gap-4 rounded-3xl border px-4 py-5 text-left",
                      "shadow-[0_18px_38px_-28px_rgba(37,99,235,0.65)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-30px_rgba(37,99,235,0.55)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
                      isActive
                        ? "border-transparent bg-gradient-to-r from-[#2563eb] via-[#2563eb] to-[#1d4ed8] text-white focus-visible:ring-[#1d4ed8]"
                        : "border-[color-mix(in_oklab,var(--border),#fff_35%)] bg-[color-mix(in_oklab,var(--surface),#fff_65%)] text-[var(--text)] focus-visible:ring-[#2563eb]/40"
                    )}
                    aria-pressed={isActive}
                    data-active={isActive ? "true" : undefined}
                  >
                    <span className="flex flex-col gap-1 text-left">
                      <span className="text-sm font-semibold leading-tight">
                        {option.nome ?? option.matricula ?? "Sem identificação"}
                      </span>
                      {option.matricula ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wide",
                            isActive
                              ? "border-white/40 bg-white/20 text-white"
                              : "border-[rgba(37,99,235,0.18)] bg-[rgba(37,99,235,0.08)] text-[color-mix(in_oklab,#1d4ed8,#111827_25%)]"
                          )}
                        >
                          {option.matricula}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold tracking-tight",
                        isActive
                          ? "bg-white/15 text-white"
                          : "bg-[rgba(37,99,235,0.08)] text-[color-mix(in_oklab,#1d4ed8,#0f172a_35%)]"
                      )}
                    >
                      Ver histórico
                    </span>
                  </button>
                );
              })}
            </div>
            {!selectedMaintainerId ? (
              <p className="text-xs text-[var(--muted)]">Selecione um mantenedor para carregar suas inspeções.</p>
            ) : null}
          </div>

          {actionFeedback ? (
            <div
              className={
                actionFeedback.type === "success"
                  ? "mb-6 rounded-lg border border-[var(--success)] bg-[color-mix(in_oklab,var(--success),#fff_85%)] px-4 py-3 text-[var(--success)]"
                  : "mb-6 rounded-lg border border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_85%)] px-4 py-3 text-[var(--danger)]"
              }
            >
              {actionFeedback.message}
            </div>
          ) : null}

          {!selectedMaintainerId ? (
            <EmptyState
              title="Selecione um mantenedor"
              description="Selecione um mantenedor acima para carregar o histórico de inspeções"
              className="py-12"
            />
          ) : loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map(key => (
                <div key={key} className="rounded-lg border border-[var(--border)] p-4">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="mt-2 h-4 w-2/3" />
                </div>
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <EmptyState
              title="Nenhuma inspeção encontrada"
              description="Não há inspeções registradas para os mantenedores selecionados."
              className="py-12"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Máquina</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>NC</TableHead>
                  <TableHead>Assinatura PCM</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map(item => (
                  <TableRow key={item.id} className={item.hasNc ? "border-l-4 border-l-[var(--danger)]" : undefined}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-[var(--text)]">{item.machineNome ?? "Máquina"}</span>
                        <span className="text-xs text-[var(--muted)]">
                          TAG {item.machineTag ?? "-"} • OS {item.osNumero ?? "-"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm text-[var(--text)]">{item.maintainerNome ?? "-"}</span>
                        <span className="text-xs text-[var(--muted)]">{item.maintainerMatricula ?? "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                    <TableCell>
                      {item.hasNc ? (
                        <div className="space-y-2">
                          <Badge variant="danger">{item.qtdNc} NC</Badge>
                          {item.ncItems.length > 0 ? (
                            <ul className="space-y-1 text-xs text-[var(--muted)]">
                              {item.ncItems.map(nc => (
                                <li key={`${item.id}-${nc.questionId}`} className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                                  <span className="font-medium text-[var(--text)]">{nc.questionText ?? `Item ${nc.questionId}`}</span>
                                  {nc.osNumero ? <span className="ml-1 text-[var(--muted)]">• O.S.: {nc.osNumero}</span> : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-[var(--muted)]">Detalhes da NC indisponíveis.</p>
                          )}
                        </div>
                      ) : (
                        <Badge variant="success">Sem NC</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.signed ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="success">Assinada</Badge>
                          <span className="text-xs text-[var(--muted)]">
                            {item.pcmNome ? `Por ${item.pcmNome}` : "Assistente"} • {formatDateTime(item.signedAt)}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="warning">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {!item.signed ? (
                          <Link
                            href={`/admin/inspecoes/assinar?inspecao=${item.id}`}
                            className={buttonStyles({ size: "sm" })}
                          >
                            Assinar
                          </Link>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                          onClick={() => setReturnDialogItem(item)}
                          loading={returningId === item.id}
                        >
                          ↩ Devolver
                        </Button>
                        <Link
                          href={`/admin/inspecoes/${item.id}/edit`}
                          className={buttonStyles({ size: "sm", variant: "secondary" })}
                        >
                          Editar
                        </Link>
                        <a
                          href={`/api/inspecoes/${item.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonStyles({ size: "sm", variant: "ghost" })}
                        >
                          Ver PDF
                        </a>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteInspection(item.id)}
                          loading={deletingId === item.id}
                        >
                          Excluir
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && visibleItems.length > 0 ? (
            <div className="mt-6 flex items-center justify-between text-sm text-[var(--muted)]">
              <span>
                Mostrando {visibleItems.length} inspeções carregadas para o mantenedor selecionado.
              </span>
              {hasMore ? (
                <Button type="button" variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore} loading={loadingMore}>
                  Carregar mais 20 inspeções
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(returnDialogItem)}
        title="Devolver inspeção"
        description="Deseja devolver esta inspeção para o mantenedor? Ela voltará como rascunho para que ele possa corrigir e reenviar."
        confirmLabel="Devolver"
        cancelLabel="Cancelar"
        busy={returningId != null}
        onCancel={() => {
          if (returningId) return;
          setReturnDialogItem(null);
        }}
        onConfirm={handleReturnInspection}
      />
    </div>
  );
}
