"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where, writeBatch } from "firebase/firestore";

import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { firebaseDb } from "@/lib/firebase-client";

type Maintainer = {
  id: string;
  matricula: string;
  nome: string;
  setor: string;
  lac: string;
  ativo: boolean;
};

type ShareTarget = {
  original: Maintainer;
  substituteId: string;
  active: boolean;
};

function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export default function MantenedoresPage() {
  const [data, setData] = useState<Maintainer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Maintainer | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    fetch("/api/admin-session", { cache: "no-store" }).then(r => {
      if (r.status === 401) window.location.href = "/admin/login";
    });
    fetch("/api/mantenedores", { cache: "no-store" }).then(async r => {
      if (r.ok) {
        const payload = (await r.json()) as Maintainer[];
        setData(payload);
      }
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(
    () =>
      data.filter(m => {
        if (!q) return true;
        const term = q.toLowerCase();
        return m.matricula.toLowerCase().includes(term) || m.nome.toLowerCase().includes(term);
      }),
    [data, q]
  );

  const activeMaintainers = useMemo(
    () => data.filter(maintainer => maintainer.ativo),
    [data]
  );

  function handleOpenDelete(target: Maintainer) {
    setDeleteTarget(target);
    setConfirmOpen(true);
    setFeedback(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/mantenedores/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Não foi possível remover o mantenedor");
      }
      setData(current => current.filter(item => item.id !== deleteTarget.id));
      setFeedback({ type: "success", message: `Mantenedor ${deleteTarget.nome} removido com sucesso.` });
      setConfirmOpen(false);
      setDeleteTarget(null);
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : "Erro desconhecido";
      setFeedback({ type: "error", message });
    } finally {
      setDeleting(false);
    }
  }


  function handleOpenShare(original: Maintainer) {
    setShareTarget({ original, substituteId: "", active: false });
    setFeedback(null);
  }

  async function handleShareInspections() {
    if (!shareTarget?.original || !shareTarget.substituteId) return;
    const substitute = data.find(maintainer => maintainer.id === shareTarget.substituteId);
    if (!substitute) {
      setFeedback({ type: "error", message: "Selecione um mantenedor válido para compartilhar." });
      return;
    }
    if (!shareTarget.active) {
      setFeedback({
        type: "success",
        message: "Compartilhamento desativado. Nenhuma alteração foi feita.",
      });
      setShareTarget(null);
      return;
    }

    setSharing(true);
    setFeedback(null);
    try {
      const programacoesRef = collection(firebaseDb, "programacoes_inspecao");
      const [responsavelIdsSnap, maintainerIdSnap, responsavelPrincipalSnap] = await Promise.all([
        getDocs(query(programacoesRef, where("status", "==", "PENDENTE"), where("responsavelIds", "array-contains", shareTarget.original.id))),
        getDocs(query(programacoesRef, where("status", "==", "PENDENTE"), where("maintainerId", "==", shareTarget.original.id))),
        getDocs(query(programacoesRef, where("status", "==", "PENDENTE"), where("responsavel.maintId", "==", shareTarget.original.id))),
      ]);
      const docsById = new Map([
        ...responsavelIdsSnap.docs,
        ...maintainerIdSnap.docs,
        ...responsavelPrincipalSnap.docs,
      ].map(docSnap => [docSnap.id, docSnap] as const));
      const docs = Array.from(docsById.values());
      const substituteNormalizedName = normalizeName(substitute.nome);

      for (const docsChunk of chunkArray(docs, 450)) {
        const batch = writeBatch(firebaseDb);
        docsChunk.forEach(docSnap => {
          const current = docSnap.data() ?? {};
          const responsaveisRaw = Array.isArray(current.responsaveis) ? current.responsaveis : [];
          const substituteAlreadyIncluded = responsaveisRaw.some(
            item => typeof item?.maintId === "string" && item.maintId === substitute.id,
          );
          const nextResponsaveis = substituteAlreadyIncluded
            ? responsaveisRaw
            : [
                ...responsaveisRaw,
                {
                  maintId: substitute.id,
                  nome: substitute.nome,
                  matricula: substitute.matricula,
                  origem: "compartilhado",
                },
              ];
          const responsavelIds = Array.isArray(current.responsavelIds)
            ? current.responsavelIds.filter((id): id is string => typeof id === "string")
            : [];
          const nextResponsavelIds = Array.from(new Set([...responsavelIds, substitute.id]));
          const normalizedNames = Array.isArray(current.responsavelNomesNormalizados)
            ? current.responsavelNomesNormalizados.filter((name): name is string => typeof name === "string")
            : [];
          const nextNormalizedNames = Array.from(new Set([...normalizedNames, substituteNormalizedName].filter(Boolean)));

          batch.update(docSnap.ref, {
            responsaveis: nextResponsaveis,
            responsavelIds: nextResponsavelIds,
            responsavelNomesNormalizados: nextNormalizedNames,
          });
        });
        await batch.commit();
      }

      setFeedback({
        type: "success",
        message: `${docs.length} inspeções pendentes foram compartilhadas com sucesso com ${substitute.nome}.`,
      });
      setShareTarget(null);
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : "Erro ao compartilhar programações";
      setFeedback({ type: "error", message });
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[var(--text)]">Mantenedores</h1>
          <p className="text-sm text-[var(--muted)]">Administre os profissionais responsáveis pelas inspeções.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/dashboard" className={buttonStyles({ variant: "secondary" })}>
            <i className="fas fa-arrow-left" aria-hidden />
            Voltar ao dashboard
          </Link>
          <Link href="/admin/mantenedores/new" className={buttonStyles()}>
            <i className="fas fa-plus" aria-hidden />
            Novo mantenedor
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Equipe cadastrada</CardTitle>
            <CardDescription>Filtre por matrícula ou nome para localizar rapidamente um profissional.</CardDescription>
          </div>
          <div className="w-full sm:max-w-sm">
            <Input
              placeholder="Buscar por matrícula ou nome"
              value={q}
              onChange={event => setQ(event.target.value)}
              aria-label="Buscar mantenedor"
            />
          </div>
        </CardHeader>
        <CardContent>
          {feedback && (
            <div
              className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
                feedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              <div className="flex items-start gap-3">
                <i
                  className={`fas ${feedback.type === "success" ? "fa-check-circle" : "fa-circle-exclamation"} mt-1`}
                  aria-hidden
                />
                <div>
                  <p className="font-medium">{feedback.type === "success" ? "Operação concluída" : "Não foi possível concluir"}</p>
                  <p>{feedback.message}</p>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Nenhum mantenedor encontrado"
              description={
                q
                  ? "Ajuste os termos de busca para encontrar quem procura."
                  : "Cadastre um mantenedor para gerenciar inspeções."
              }
              icon={<i className="fas fa-user-cog" aria-hidden />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>LAC</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(m => (
                  <Fragment key={m.id}>
                    <TableRow>
                      <TableCell className="font-medium">{m.matricula}</TableCell>
                      <TableCell>{m.nome}</TableCell>
                      <TableCell className="text-[var(--muted)]">{m.setor}</TableCell>
                      <TableCell className="text-[var(--muted)]">{m.lac}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                            m.ativo ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {m.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/admin/mantenedores/${m.id}`}
                            className={buttonStyles({ variant: "outline", size: "sm" })}
                          >
                            <i className="fas fa-pen" aria-hidden />
                            Editar
                          </Link>
                          <Link
                            href={`/admin/mantenedores/${m.id}/machines`}
                            className={buttonStyles({ variant: "secondary", size: "sm" })}
                          >
                            <i className="fas fa-cogs" aria-hidden />
                            Máquinas
                          </Link>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            onClick={() => handleOpenShare(m)}
                            disabled={!m.ativo || activeMaintainers.length < 2}
                          >
                            <i className="fas fa-share" aria-hidden />
                            Compartilhar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => handleOpenDelete(m)}
                          >
                            <i className="fas fa-trash" aria-hidden />
                            Excluir
                          </Button>
                        </div>
                        {shareTarget?.original.id === m.id ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700 sm:mt-0 sm:flex sm:items-center sm:justify-end sm:gap-3">
                            <label className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-3 py-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[var(--primary)]"
                                checked={shareTarget.active}
                                onChange={event => {
                                  const active = event.target.checked;
                                  setShareTarget(current => current ? { ...current, active } : current);
                                }}
                                disabled={sharing}
                              />
                              <span>Compartilhar inspeções</span>
                            </label>
                            <span className="text-sm">
                              com <strong>{activeMaintainers.find(maintainer => maintainer.id === shareTarget.substituteId)?.nome ?? "mantenedor"}</strong>
                            </span>
                            <label className="min-w-[220px] text-sm">
                              <span className="sr-only">Mantenedor compartilhado</span>
                              <Select
                                value={shareTarget.substituteId}
                                onChange={event => {
                                  const substituteId = event.target.value;
                                  setShareTarget(current => current ? { ...current, substituteId } : current);
                                }}
                                disabled={sharing}
                              >
                                <option value="" disabled>Selecione um mantenedor ativo</option>
                                {activeMaintainers
                                  .filter(maintainer => maintainer.id !== shareTarget.original.id)
                                  .map(maintainer => (
                                    <option key={maintainer.id} value={maintainer.id}>
                                      {maintainer.matricula ? `${maintainer.matricula} — ` : ""}{maintainer.nome}
                                    </option>
                                  ))}
                              </Select>
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                onClick={handleShareInspections}
                                loading={sharing}
                                disabled={!shareTarget.substituteId || !shareTarget.active}
                              >
                                Compartilhar
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setShareTarget(null)}
                                disabled={sharing}
                              >
                                Fechar
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Excluir mantenedor"
        description={
          deleteTarget
            ? `Tem certeza que deseja remover ${deleteTarget.nome}? Essa ação é irreversível.`
            : "Tem certeza que deseja remover este mantenedor?"
        }
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        onCancel={() => {
          if (deleting) return;
          setConfirmOpen(false);
          setDeleteTarget(null);
        }}
        busy={deleting}
      />
    </div>
  );
}