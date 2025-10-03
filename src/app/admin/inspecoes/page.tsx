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
  qtdNc: number;
  hasNc: boolean;
  osNumero: string | null;
  signed: boolean;
  signedAt: string | null;
  pcmNome: string | null;
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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
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
        const qtdNcFromAnswers = answers.filter(answer => answer?.response === "nc").length;
        const qtdNc = typeof data.qtdNC === "number" ? data.qtdNC : qtdNcFromAnswers;
        const pcmSign = (data.pcmSign ?? {}) as Record<string, unknown>;

        return {
          id: doc.id,
          machineNome: machine.nome ? String(machine.nome) : null,
          machineTag: machine.tag ? String(machine.tag) : null,
          createdAt: data.createdAt ? String(data.createdAt) : null,
          maintainerNome: maintainer.nome ? String(maintainer.nome) : null,
          maintainerMatricula: maintainer.matricula ? String(maintainer.matricula) : null,
          qtdNc,
          hasNc: qtdNc > 0,
          osNumero: data.osNumero ? String(data.osNumero) : null,
          signed: Boolean(pcmSign && pcmSign.assinaturaUrl),
          signedAt: pcmSign?.signedAt ? String(pcmSign.signedAt) : null,
          pcmNome: pcmSign?.nome ? String(pcmSign.nome) : null,
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
                {items.map(item => (
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
                        <Badge variant="danger">{item.qtdNc} NC</Badge>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
