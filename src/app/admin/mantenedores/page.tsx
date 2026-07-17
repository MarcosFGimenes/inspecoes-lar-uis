"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where, writeBatch, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";

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

type MaintainerShareState = {
  active: boolean;
  substituteId: string;
  loading: boolean;
};

type PendingShareDoc = QueryDocumentSnapshot<DocumentData>;

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

async function loadPendingShareDocs(originalId: string) {
  const programacoesRef = collection(firebaseDb, "programacoes_inspecao");
  const [responsavelIdsSnap, maintainerIdSnap, responsavelPrincipalSnap] = await Promise.all([
    getDocs(query(programacoesRef, where("status", "==", "PENDENTE"), where("responsavelIds", "array-contains", originalId))),
    getDocs(query(programacoesRef, where("status", "==", "PENDENTE"), where("maintainerId", "==", originalId))),
    getDocs(query(programacoesRef, where("status", "==", "PENDENTE"), where("responsavel.maintId", "==", originalId))),
  ]);

  const docsById = new Map(
    [...responsavelIdsSnap.docs, ...maintainerIdSnap.docs, ...responsavelPrincipalSnap.docs].map(docSnap => [docSnap.id, docSnap] as const)
  );

  return Array.from(docsById.values()) as Array<PendingShareDoc>;
}

function inferShareStateFromDocs(maintainer: Maintainer, docs: PendingShareDoc[]) {
  const sharedIds = docs.flatMap(docSnap => {
    const current = docSnap.data() as Record<string, unknown>;
    const responsaveisRaw = Array.isArray(current.responsaveis)
      ? current.responsaveis.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      : [];
    const responsavelIds = Array.isArray(current.responsavelIds)
      ? current.responsavelIds.filter((id): id is string => typeof id === "string")
      : [];

    return [
      ...responsavelIds.filter(id => id !== maintainer.id),
      ...responsaveisRaw
        .map(item => (typeof item.maintId === "string" && item.maintId !== maintainer.id ? item.maintId : null))
        .filter((id): id is string => Boolean(id)),
      ...responsaveisRaw
        .filter(item => item.origem === "compartilhado" && typeof item.maintId === "string")
        .map(item => item.maintId as string)
        .filter(id => id !== maintainer.id),
    ];
  });

  const substituteId = Array.from(new Set(sharedIds))[0] ?? "";

  return {
    active: Boolean(substituteId),
    substituteId,
    loading: false,
  } satisfies MaintainerShareState;
}

export default function MantenedoresPage() {
  const [data, setData] = useState<Maintainer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Maintainer | null>(null);
  const [shareByMaintainerId, setShareByMaintainerId] = useState<Record<string, MaintainerShareState>>({});

  useEffect(() => {
    fetch("/api/admin-session", { cache: "no-store" }).then(r => {
      if (r.status === 401) window.location.href = "/admin/login";
    });

    fetch("/api/mantenedores", { cache: "no-store" })
      .then(async r => {
        if (!r.ok) {
          throw new Error("Não foi possível carregar os mantenedores");
        }

        const payload = (await r.json()) as Maintainer[];
        setData(payload);

        const shareStatuses = await Promise.all(
          payload
            .filter(maintainer => maintainer.ativo)
            .map(async maintainer => {
              const docs = await loadPendingShareDocs(maintainer.id);
              return [maintainer.id, inferShareStateFromDocs(maintainer, docs)] as const;
            })
        );

        setShareByMaintainerId(Object.fromEntries(shareStatuses));
      })
      .catch(error => {
        const message = error instanceof Error && error.message ? error.message : "Erro ao carregar mantenedores";
        setFeedback({ type: "error", message });
      })
      .finally(() => {
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

  const activeMaintainers = useMemo(() => data.filter(maintainer => maintainer.ativo), [data]);

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

  function updateShareState(maintainerId: string, updates: Partial<MaintainerShareState>) {
    setShareByMaintainerId(current => {
      const previous = current[maintainerId] ?? { active: false, substituteId: "", loading: false };
      return {
        ...current,
        [maintainerId]: {
          ...previous,
          ...updates,
        },
      };
    });
  }

  async function handleToggleShare(maintainer: Maintainer, nextActive: boolean) {
    const currentState = shareByMaintainerId[maintainer.id] ?? { active: false, substituteId: "", loading: false };
    const substituteId = currentState.substituteId;

    if (!substituteId) {
      setFeedback({ type: "error", message: "Selecione um mantenedor substituto antes de ativar o compartilhamento." });
      return;
    }

    const substitute = data.find(item => item.id === substituteId);
    if (!substitute) {
      setFeedback({ type: "error", message: "Não foi possível localizar o mantenedor substituto selecionado." });
      return;
    }

    setFeedback(null);
    updateShareState(maintainer.id, { loading: true });

    try {
      const docs = await loadPendingShareDocs(maintainer.id);
      const substituteNormalizedName = normalizeName(substitute.nome);

      for (const docsChunk of chunkArray(docs, 450)) {
        const batch = writeBatch(firebaseDb);
        docsChunk.forEach(docSnap => {
          const currentDoc = docSnap.data() as Record<string, unknown>;
          const responsaveisRaw = Array.isArray(currentDoc.responsaveis)
            ? currentDoc.responsaveis.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
            : [];
          const responsavelIds = Array.isArray(currentDoc.responsavelIds)
            ? currentDoc.responsavelIds.filter((id): id is string => typeof id === "string")
            : [];
          const normalizedNames = Array.isArray(currentDoc.responsavelNomesNormalizados)
            ? currentDoc.responsavelNomesNormalizados.filter((name): name is string => typeof name === "string")
            : [];

          if (nextActive) {
            const substituteAlreadyIncluded = responsaveisRaw.some(item => typeof item.maintId === "string" && item.maintId === substitute.id);
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
            const nextResponsavelIds = Array.from(new Set([...responsavelIds, substitute.id]));
            const nextNormalizedNames = Array.from(new Set([...normalizedNames, substituteNormalizedName].filter(Boolean)));

            batch.update(docSnap.ref, {
              responsaveis: nextResponsaveis,
              responsavelIds: nextResponsavelIds,
              responsavelNomesNormalizados: nextNormalizedNames,
            });
          } else {
            const nextResponsaveis = responsaveisRaw.filter(item => !(typeof item.maintId === "string" && item.maintId === substitute.id));
            const nextResponsavelIds = responsavelIds.filter(id => id !== substitute.id);
            const nextNormalizedNames = normalizedNames.filter(name => name !== substituteNormalizedName);

            batch.update(docSnap.ref, {
              responsaveis: nextResponsaveis,
              responsavelIds: nextResponsavelIds,
              responsavelNomesNormalizados: nextNormalizedNames,
            });
          }
        });
        await batch.commit();
      }

      updateShareState(maintainer.id, {
        active: nextActive,
        substituteId,
        loading: false,
      });
      setFeedback({
        type: "success",
        message: nextActive ? `Compartilhamento ativado com ${substitute.nome}.` : `Compartilhamento desativado para ${substitute.nome}.`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : "Erro ao atualizar o compartilhamento";
      updateShareState(maintainer.id, { loading: false });
      setFeedback({ type: "error", message });
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
                {filtered.map(m => {
                  const shareState = shareByMaintainerId[m.id] ?? { active: false, substituteId: "", loading: false };
                  const canToggleShare = Boolean(shareState.substituteId) && m.ativo && activeMaintainers.length >= 2;

                  return (
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
                              variant="ghost"
                              size="sm"
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => handleOpenDelete(m)}
                            >
                              <i className="fas fa-trash" aria-hidden />
                              Excluir
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-slate-50/80">
                        <TableCell colSpan={6}>
                          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <i className="fas fa-share-nodes text-[var(--primary)]" aria-hidden />
                                Compartilhamento de inspeções
                              </div>
                              <p className="text-sm text-slate-500">
                                Escolha outro mantenedor ativo e ative o interruptor para que as inspeções pendentes fiquem visíveis para ele sem alterar o dono original.
                              </p>
                            </div>
                            <div className="flex flex-col gap-4 sm:min-w-[360px]">
                              <label className="space-y-2 text-sm text-slate-600">
                                <span className="font-medium">Mantenedor substituto</span>
                                <Select
                                  value={shareState.substituteId}
                                  onChange={event => {
                                    const substituteId = event.target.value;
                                    updateShareState(m.id, { substituteId, active: shareState.active, loading: false });
                                  }}
                                  disabled={shareState.loading || !m.ativo || activeMaintainers.length < 2}
                                >
                                  <option value="" disabled>Selecione um mantenedor ativo</option>
                                  {activeMaintainers
                                    .filter(maintainer => maintainer.id !== m.id)
                                    .map(maintainer => (
                                      <option key={maintainer.id} value={maintainer.id}>
                                        {maintainer.matricula ? `${maintainer.matricula} — ` : ""}
                                        {maintainer.nome}
                                      </option>
                                    ))}
                                </Select>
                              </label>
                              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="space-y-1">
                                  <p className="text-sm font-medium text-slate-700">
                                    {shareState.active ? "Compartilhamento ativo" : "Compartilhamento desligado"}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {shareState.loading ? "Aplicando alteração..." : "Ative para disponibilizar as inspeções pendentes ao substituto."}
                                  </p>
                                </div>
                                <label className="inline-flex items-center gap-3">
                                  <span className="text-sm font-medium text-slate-600">
                                    {shareState.active ? "Ligado" : "Desligado"}
                                  </span>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={shareState.active}
                                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                                      shareState.active ? "bg-emerald-600" : "bg-slate-300"
                                    } ${shareState.loading || !canToggleShare ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                                    onClick={() => handleToggleShare(m, !shareState.active)}
                                    disabled={shareState.loading || !canToggleShare}
                                  >
                                    <span
                                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                        shareState.active ? "translate-x-6" : "translate-x-1"
                                      }`}
                                    />
                                  </button>
                                  {shareState.loading ? <i className="fas fa-spinner fa-spin text-sm text-[var(--primary)]" aria-hidden /> : null}
                                </label>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
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
