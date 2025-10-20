"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase-client";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChecklistAnswer } from "@/types";

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
  ncItems: Array<{ questionId: string; questionText: string | null; osNumero: string | null; photoUrls: string[] }>;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export default function AdminInspectionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InspectionListItem[]>([]);
  const [selectedMaintainer, setSelectedMaintainer] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState<number>(25);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionFeedback(null);
    try {
      const session = await fetch("/api/admin-session", { cache: "no-store" });
      if (session.status === 401) {
        window.location.href = "/admin/login";
        setLoading(false);
        return;
      }

      const inspectionsSnap = await getDocs(
        query(collection(firebaseDb, "inspecoes"), orderBy("createdAt", "desc"), limit(100))
      );

      const mapped: InspectionListItem[] = inspectionsSnap.docs.map(doc => {
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
                  photoUrls: Array.isArray(answer.photoUrls) ? answer.photoUrls.filter(Boolean) : [],
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
                  photoUrls: Array.isArray(item.fotos) ? item.fotos.filter(Boolean).map(String) : [],
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
        } satisfies InspectionListItem;
      });

      setItems(mapped);
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao carregar inspeções";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setVisibleCount(selectedMaintainer === "all" ? 25 : 10);
  }, [selectedMaintainer]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
      return undefined;
    }
    const channel = new BroadcastChannel("pcm-inspecoes-events");
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; id?: string; nome?: string | null; signedAt?: string | null };
      if (data?.type === "inspection-signed" && data.id) {
        setItems(prev =>
          prev.map(item =>
            item.id === data.id
              ? {
                  ...item,
                  signed: true,
                  signedAt: data.signedAt ?? new Date().toISOString(),
                  pcmNome: data.nome ?? item.pcmNome,
                }
              : item
          )
        );
      }
    };
    channel.addEventListener("message", handler);
    return () => {
      channel.removeEventListener("message", handler);
      channel.close();
    };
  }, []);

  useEffect(() => {
    if (selectedMaintainer === "all") return;
    const stillExists = items.some(item => item.maintainerKey === selectedMaintainer);
    if (!stillExists) {
      setSelectedMaintainer("all");
    }
  }, [items, selectedMaintainer]);

  const maintainerOptions = useMemo(() => {
    const map = new Map<
      string,
      { id: string; nome: string | null; matricula: string | null; total: number }
    >();

    for (const item of items) {
      const key = item.maintainerKey || "unknown";
      const current = map.get(key) ?? {
        id: key,
        nome: item.maintainerNome,
        matricula: item.maintainerMatricula,
        total: 0,
      };
      current.nome = current.nome ?? item.maintainerNome;
      current.matricula = current.matricula ?? item.maintainerMatricula;
      current.total += 1;
      map.set(key, current);
    }

    return Array.from(map.values()).sort((a, b) => {
      const nameA = (a.nome ?? a.matricula ?? a.id).toLowerCase();
      const nameB = (b.nome ?? b.matricula ?? b.id).toLowerCase();
      return nameA.localeCompare(nameB, "pt-BR");
    });
  }, [items]);

  const filteredItems = useMemo(() => {
    const base = selectedMaintainer === "all"
      ? items
      : items.filter(item => item.maintainerKey === selectedMaintainer);
    return base;
  }, [items, selectedMaintainer]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  );

  const hasMore = filteredItems.length > visibleItems.length;

  const selectedMaintainerInfo = useMemo(() => {
    if (selectedMaintainer === "all") return null;
    return maintainerOptions.find(option => option.id === selectedMaintainer) ?? null;
  }, [maintainerOptions, selectedMaintainer]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => prev + (selectedMaintainer === "all" ? 25 : 10));
  }, [selectedMaintainer]);

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

        setItems(prev => prev.filter(item => item.id !== inspectionId));
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

  const signedCount = useMemo(() => items.filter(item => item.signed).length, [items]);
  const pendingCount = useMemo(() => items.filter(item => !item.signed).length, [items]);
  const withNcCount = useMemo(() => items.filter(item => item.hasNc).length, [items]);

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
          {error}
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
              <span className="text-2xl font-semibold text-[var(--text)]">{items.length}</span>
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
                Selecione um mantenedor para visualizar apenas suas inspeções recentes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={selectedMaintainer === "all" ? "default" : "ghost"}
                onClick={() => setSelectedMaintainer("all")}
              >
                Todos
                <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-normal">
                  {items.length}
                </span>
              </Button>
              {maintainerOptions.map(option => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={selectedMaintainer === option.id ? "secondary" : "ghost"}
                  onClick={() => setSelectedMaintainer(option.id)}
                >
                  <span className="flex flex-col items-start text-left">
                    <span className="text-sm font-medium text-[var(--text)]">
                      {option.nome ?? option.matricula ?? "Sem identificação"}
                    </span>
                    {option.matricula ? (
                      <span className="text-xs text-[var(--muted)]">{option.matricula}</span>
                    ) : null}
                  </span>
                  <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-normal">
                    {option.total}
                  </span>
                </Button>
              ))}
            </div>
            {selectedMaintainerInfo ? (
              <p className="text-xs text-[var(--muted)]">
                Mostrando inspeções de {selectedMaintainerInfo.nome ?? selectedMaintainerInfo.matricula ?? "Sem identificação"}.
              </p>
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

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map(key => (
                <div key={key} className="rounded-lg border border-[var(--border)] p-4">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="mt-2 h-4 w-2/3" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="Nenhuma inspeção encontrada"
              description="As inspeções serão exibidas aqui assim que forem registradas."
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
          {!loading && filteredItems.length > 0 ? (
            <div className="mt-6 flex items-center justify-between text-sm text-[var(--muted)]">
              <span>
                Mostrando {visibleItems.length} de {filteredItems.length} inspeções
                {selectedMaintainer === "all" ? "" : " deste mantenedor"}.
              </span>
              {hasMore ? (
                <Button type="button" variant="outline" size="sm" onClick={handleLoadMore}>
                  Carregar mais
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
