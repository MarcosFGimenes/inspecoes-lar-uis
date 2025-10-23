"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { CriticidadeBadge } from "@/components/criticidade-badge";
import { cn } from "@/lib/cn";
import type { Severity, SeverityState } from "@/types/severity";

type MaintSessionInfo = {
  nome?: string | null;
  matricula?: string | null;
};

type MachineRecord = {
  id: string;
  tag: string | null;
  nome: string | null;
  setor: string | null;
  unidade: string | null;
  fotoUrl: string | null;
};

type ProgramacaoRecord = {
  id: string;
  batchId: string | null;
  osNumero: string | null;
  machine: {
    tag: string | null;
    nome: string | null;
    machineId: string | null;
    machineNotFound: boolean;
  };
  manutencao: {
    tipo: string | null;
    criticidade: string | null;
    severity?: SeverityState;
    effectiveSeverity?: Severity | null;
  };
  responsavel: {
    nome: string | null;
    maintId: string | null;
    matricula: string | null;
    origem: string | null;
  };
  mantenedores: Array<{
    nome: string | null;
    maintId: string | null;
    matricula: string | null;
    origem: string | null;
  }>;
  datas: {
    emissao: string | null;
    vencimento: string | null;
    fechamento: string | null;
    programada: string | null;
    prazo: string | null;
  };
  atrasada: boolean;
  status: string | null;
  issue: {
    id: string | null;
    descricao: string | null;
    fotos: string[];
    osNumero: string | null;
    severity?: SeverityState;
    effectiveSeverity?: Severity | null;
  } | null;
  execucao: {
    status: string | null;
    descricao: string | null;
    fotos: string[];
    concluidaEm: string | null;
    concluidaPor: {
      maintId: string | null;
      nome: string | null;
      matricula: string | null;
    } | null;
  } | null;
};

type CompletionPhoto = { id: string; dataUrl: string };

const MAX_COMPLETION_PHOTOS = 6;
const MAX_UPLOAD_BYTES = 1.5 * 1024 * 1024;

export default function MaintHomeStartPage() {
  const router = useRouter();

  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<MaintSessionInfo | null>(null);

  const [machinesLoading, setMachinesLoading] = useState(true);
  const [machinesError, setMachinesError] = useState<string | null>(null);
  const [machines, setMachines] = useState<MachineRecord[]>([]);

  const [programacoesLoading, setProgramacoesLoading] = useState(true);
  const [programacoesError, setProgramacoesError] = useState<string | null>(null);
  const [programacoes, setProgramacoes] = useState<ProgramacaoRecord[]>([]);

  const [selectedProgramacaoId, setSelectedProgramacaoId] = useState<string | null>(null);
  const [detailFeedback, setDetailFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [completionDescricao, setCompletionDescricao] = useState("");
  const [completionFotos, setCompletionFotos] = useState<CompletionPhoto[]>([]);
  const [completionLoading, setCompletionLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [searchTag, setSearchTag] = useState("");
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [inspectionSaved, setInspectionSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      setSessionLoading(true);
      setSessionError(null);
      try {
        const response = await fetch("/api/auth/maint/me", { cache: "no-store" });
        if (response.status === 401) {
          if (!cancelled) {
            setSession(null);
            setSessionError("Sessão não encontrada. Faça login novamente.");
          }
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar sessão");
        }
        const data = await response.json();
        if (!cancelled) {
          setSession({
            nome: data.store?.nome ?? null,
            matricula: data.store?.matricula ?? null,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar sessão";
          setSessionError(message);
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }
    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setMachines([]);
      setMachinesLoading(false);
      setMachinesError(null);
      return;
    }

    let cancelled = false;
    async function loadMachines() {
      setMachinesLoading(true);
      setMachinesError(null);
      try {
        const response = await fetch("/api/me/machines", { cache: "no-store" });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar máquinas");
        }
        const data = (await response.json()) as MachineRecord[];
        if (!cancelled) {
          setMachines(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar máquinas";
          setMachinesError(message);
          setMachines([]);
        }
      } finally {
        if (!cancelled) {
          setMachinesLoading(false);
        }
      }
    }

    loadMachines();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const loadProgramacoes = useCallback(
    async (signal?: AbortSignal) => {
      if (!session) {
        setProgramacoes([]);
        setProgramacoesError(null);
        setProgramacoesLoading(false);
        setSelectedProgramacaoId(null);
        return;
      }

      setProgramacoesLoading(true);
      setProgramacoesError(null);
      try {
        const response = await fetch("/api/me/programacoes", { cache: "no-store", signal });
        if (signal?.aborted) {
          return;
        }
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar programações");
        }
        const data = (await response.json()) as ProgramacaoRecord[];
        if (signal?.aborted) {
          return;
        }
        setProgramacoes(data);
        setSelectedProgramacaoId(current => {
          if (current && data.some(record => record.id === current)) {
            return current;
          }
          return data.length > 0 ? data[0]!.id : null;
        });
      } catch (err: unknown) {
        if (signal?.aborted) {
          return;
        }
        const message = err instanceof Error && err.message ? err.message : "Falha ao carregar programações";
        setProgramacoesError(message);
        setProgramacoes([]);
      } finally {
        if (!signal?.aborted) {
          setProgramacoesLoading(false);
        }
      }
    },
    [session],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadProgramacoes(controller.signal).catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [loadProgramacoes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setInspectionSaved(params.get("ok") === "1");
  }, []);

  const displayName = useMemo(() => {
    if (!session) return "mantenedor";
    const nome = session.nome?.trim();
    if (nome && nome.length > 0) {
      const firstName = nome.split(" ")[0];
      return firstName || nome;
    }
    const matricula = session.matricula?.trim();
    return matricula && matricula.length > 0 ? matricula : "mantenedor";
  }, [session]);

  const handleSearch = useCallback(() => {
    const trimmed = searchTag.trim();
    if (!trimmed) return;
    router.push(`/inspecao/${encodeURIComponent(trimmed)}`);
  }, [router, searchTag]);

  const handleLogout = useCallback(async () => {
    try {
      setLogoutLoading(true);
      await fetch("/api/auth/maint/logout", { method: "POST" });
      window.location.href = "/login";
    } finally {
      setLogoutLoading(false);
    }
  }, []);

  const handleSelectMachine = useCallback(
    (tag: string | null) => {
      if (!tag) return;
      router.push(`/inspecao/${encodeURIComponent(tag)}`);
    },
    [router]
  );

  const readFileAsDataUrl = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Falha ao ler arquivo"));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });
  }, []);

  const formatDate = useCallback((iso: string | null | undefined) => {
    if (!iso) return "-";
    try {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "-";
      return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
    } catch {
      return "-";
    }
  }, []);

  const selectedProgramacao = useMemo(
    () => programacoes.find(record => record.id === selectedProgramacaoId) ?? null,
    [programacoes, selectedProgramacaoId],
  );

  useEffect(() => {
    setCompletionDescricao("");
    setCompletionFotos([]);
    setDetailFeedback(null);
  }, [selectedProgramacaoId]);

  const handleOpenProgramacao = useCallback((record: ProgramacaoRecord) => {
    setSelectedProgramacaoId(record.id);
    setCompletionDescricao("");
    setCompletionFotos([]);
    setDetailFeedback(null);
  }, []);

  const handleCompletionPhotosChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) {
        return;
      }
      const available = MAX_COMPLETION_PHOTOS - completionFotos.length;
      if (available <= 0) {
        setDetailFeedback({ type: "error", message: "Limite de fotos atingido." });
        event.target.value = "";
        return;
      }
      const selectedFiles = files.slice(0, available);
      const additions: CompletionPhoto[] = [];
      for (const file of selectedFiles) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setDetailFeedback({ type: "error", message: "Reduza as fotos para até 1,5MB." });
          continue;
        }
        try {
          const dataUrl = await readFileAsDataUrl(file);
          additions.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, dataUrl });
        } catch (error) {
          console.error(error);
          setDetailFeedback({ type: "error", message: "Não foi possível ler uma das imagens." });
        }
      }
      if (additions.length > 0) {
        setCompletionFotos(prev => [...prev, ...additions]);
      }
      event.target.value = "";
    },
    [completionFotos.length, readFileAsDataUrl],
  );

  const handleRemoveCompletionPhoto = useCallback((id: string) => {
    setCompletionFotos(prev => prev.filter(photo => photo.id !== id));
  }, []);

  const handleTriggerPhotoPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleConcludeProgramacao = useCallback(async () => {
    if (!selectedProgramacao) {
      setDetailFeedback({ type: "error", message: "Selecione uma programação." });
      return;
    }
    setCompletionLoading(true);
    setDetailFeedback(null);
    try {
      const payload = {
        descricao: completionDescricao.trim() ? completionDescricao.trim() : null,
        fotos: completionFotos.map(photo => photo.dataUrl),
      };
      const response = await fetch(`/api/me/programacoes/${selectedProgramacao.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error ?? "Falha ao concluir correção.");
      }
      setDetailFeedback({ type: "success", message: "Correção concluída e enviada ao PCM." });
      setCompletionDescricao("");
      setCompletionFotos([]);
      await loadProgramacoes();
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : "Falha ao concluir correção.";
      setDetailFeedback({ type: "error", message });
    } finally {
      setCompletionLoading(false);
    }
  }, [completionDescricao, completionFotos, loadProgramacoes, selectedProgramacao]);

  const selectedSeverityState =
    selectedProgramacao?.issue?.severity ?? selectedProgramacao?.manutencao.severity;
  const selectedSeverityValue =
    selectedProgramacao?.issue?.effectiveSeverity ?? selectedProgramacao?.manutencao.effectiveSeverity ?? null;
  const issuePhotos = selectedProgramacao?.issue?.fotos ?? [];
  const mantenedoresSelecionados = selectedProgramacao?.mantenedores ?? [];
  const remainingPhotoSlots = Math.max(0, MAX_COMPLETION_PHOTOS - completionFotos.length);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 px-6 py-8 text-white shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-100">Início</p>
            <h1 className="text-3xl font-semibold">Bem vindo, {displayName}!</h1>
            <p className="text-sm text-blue-100">
              Escolha uma máquina para iniciar uma nova inspeção ou digite a TAG abaixo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={logoutLoading}
            className="inline-flex items-center justify-center rounded-full border border-white/60 px-4 py-2 text-sm font-medium text-white transition hover:border-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {logoutLoading ? "Saindo..." : "Sair"}
          </button>
        </div>
        {inspectionSaved && (
          <div className="rounded-2xl border border-white/40 bg-white/15 px-4 py-3 text-sm">
            <p className="font-medium">Inspeção salva com sucesso!</p>
            <p className="text-blue-100">Você pode conferir os detalhes em &ldquo;Inspeções&rdquo; sempre que precisar.</p>
          </div>
        )}
        {sessionError && (
          <div className="rounded-2xl border border-red-200/70 bg-red-500/20 px-4 py-3 text-sm text-white">
            {sessionError}
          </div>
        )}
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-900">Correções programadas</h2>
          <p className="text-sm text-slate-500">
            Visualize as não conformidades direcionadas a você, confira as evidências e conclua após a correção.
          </p>
        </div>

        {programacoesError ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {programacoesError}
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-6 lg:flex-row">
            <div className="space-y-3 lg:w-[42%]">
              {programacoesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
                  ))}
                </div>
              ) : programacoes.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 shadow-sm">
                  Nenhuma correção programada para você no momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {programacoes.map(record => {
                    const isSelected = selectedProgramacaoId === record.id;
                    const severityState = record.issue?.severity ?? record.manutencao.severity;
                    const severityValue =
                      record.issue?.effectiveSeverity ?? record.manutencao.effectiveSeverity ?? null;
                    const mantenedorNames = record.mantenedores
                      .map(entry => entry.nome || entry.matricula || entry.maintId || null)
                      .filter((name): name is string => Boolean(name));

                    return (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => handleOpenProgramacao(record)}
                        aria-pressed={isSelected}
                        className={cn(
                          "w-full rounded-2xl border px-4 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                          isSelected
                            ? "border-blue-500 bg-blue-50/70 shadow-sm"
                            : "border-slate-200 hover:border-blue-200 hover:bg-blue-50/40",
                        )}
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <h3 className="text-base font-semibold text-slate-900">
                                {record.issue?.descricao ?? record.machine.nome ?? record.machine.tag ?? "Correção programada"}
                              </h3>
                              <p className="text-xs uppercase tracking-wide text-slate-400">
                                OS {record.osNumero ?? record.issue?.osNumero ?? "-"}
                              </p>
                            </div>
                            <CriticidadeBadge
                              value={severityValue}
                              state={severityState}
                              label="Criticidade"
                              showStatus
                            />
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>Máquina: {record.machine.nome ?? "-"}</span>
                            <span>TAG: {record.machine.tag ?? "-"}</span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>Programada: {formatDate(record.datas.programada)}</span>
                            <span>Prazo: {formatDate(record.datas.prazo)}</span>
                            <span>Vencimento: {formatDate(record.datas.vencimento)}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-medium text-slate-600">
                              Responsável: {record.responsavel.nome ?? record.responsavel.matricula ?? "-"}
                            </span>
                            {record.atrasada ? <Badge variant="danger">Atrasada</Badge> : null}
                            {record.status ? (
                              <Badge variant="muted" className="uppercase tracking-wide">
                                {record.status}
                              </Badge>
                            ) : null}
                          </div>
                          {mantenedorNames.length > 0 ? (
                            <p className="text-xs text-slate-500">
                              Mantenedores de apoio: {mantenedorNames.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:flex-1">
              {programacoesLoading ? (
                <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
              ) : selectedProgramacao ? (
                <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                  <header className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-semibold text-slate-900">
                        {selectedProgramacao.machine.nome ?? selectedProgramacao.machine.tag ?? "Correção programada"}
                      </h3>
                      {selectedProgramacao.atrasada ? <Badge variant="danger">Atrasada</Badge> : null}
                      {selectedProgramacao.status ? (
                        <Badge variant="muted" className="uppercase tracking-wide">
                          {selectedProgramacao.status}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-600">
                      {selectedProgramacao.issue?.descricao ?? "Sem descrição cadastrada para esta não conformidade."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <CriticidadeBadge
                        value={selectedSeverityValue}
                        state={selectedSeverityState}
                        label="Criticidade atual"
                        showStatus
                      />
                    </div>
                  </header>

                  {detailFeedback ? (
                    <div
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm",
                        detailFeedback.type === "success"
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border border-red-200 bg-red-50 text-red-700",
                      )}
                    >
                      {detailFeedback.message}
                    </div>
                  ) : null}

                  <div className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase text-slate-500">Máquina</p>
                      <p className="text-sm text-slate-900">
                        {selectedProgramacao.machine.nome ?? selectedProgramacao.machine.tag ?? "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-slate-500">TAG</p>
                      <p className="text-sm text-slate-900">{selectedProgramacao.machine.tag ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-slate-500">OS vinculada</p>
                      <p className="text-sm text-slate-900">
                        {selectedProgramacao.osNumero ?? selectedProgramacao.issue?.osNumero ?? "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-slate-500">Data programada</p>
                      <p className="text-sm text-slate-900">{formatDate(selectedProgramacao.datas.programada)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-slate-500">Prazo</p>
                      <p className="text-sm text-slate-900">{formatDate(selectedProgramacao.datas.prazo)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-slate-500">Responsável</p>
                      <p className="text-sm text-slate-900">
                        {selectedProgramacao.responsavel.nome ??
                          selectedProgramacao.responsavel.matricula ??
                          "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-slate-500">Mantenedores de apoio</p>
                      <p className="text-sm text-slate-900">
                        {mantenedoresSelecionados.length > 0
                          ? mantenedoresSelecionados
                              .map(entry => entry.nome ?? entry.matricula ?? entry.maintId ?? "-")
                              .join(", ")
                          : "-"}
                      </p>
                    </div>
                  </div>

                  {issuePhotos.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-900">Fotos da não conformidade</h4>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {issuePhotos.map((url, index) => (
                          <a
                            key={`${url}-${index}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative block overflow-hidden rounded-xl border border-slate-200 bg-white"
                          >
                            <Image
                              src={url}
                              alt="Foto da não conformidade"
                              fill
                              className="object-cover transition-transform duration-200 group-hover:scale-105"
                              sizes="(min-width: 1024px) 200px, (min-width: 640px) 160px, 45vw"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label htmlFor="descricaoConclusao" className="text-sm font-semibold text-slate-900">
                      Descreva como a correção foi concluída
                    </label>
                    <textarea
                      id="descricaoConclusao"
                      value={completionDescricao}
                      onChange={event => setCompletionDescricao(event.target.value)}
                      rows={4}
                      placeholder="Inclua as ações executadas, peças trocadas ou observações relevantes."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      disabled={completionLoading}
                    />
                  </div>

                  {completionFotos.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-900">Fotos adicionadas</h4>
                      <div className="flex flex-wrap gap-3">
                        {completionFotos.map(photo => (
                          <div
                            key={photo.id}
                            className="relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                          >
                            <Image
                              src={photo.dataUrl}
                              alt="Foto adicionada"
                              fill
                              unoptimized
                              className="object-cover"
                              sizes="96px"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveCompletionPhoto(photo.id)}
                              className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white shadow hover:bg-black/80"
                            >
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleTriggerPhotoPicker}
                      disabled={completionLoading || remainingPhotoSlots <= 0}
                      className="inline-flex items-center justify-center rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Adicionar fotos ({completionFotos.length}/{MAX_COMPLETION_PHOTOS})
                    </button>
                    <button
                      type="button"
                      onClick={handleConcludeProgramacao}
                      disabled={completionLoading}
                      className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
                    >
                      {completionLoading ? "Enviando..." : "Concluir correção"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Até {MAX_COMPLETION_PHOTOS} fotos (máx. 1,5&nbsp;MB cada). Restam {remainingPhotoSlots} vagas para novas fotos.
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleCompletionPhotosChange}
                  />
                </div>
              ) : (
                <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
                  Selecione uma correção programada para visualizar detalhes e concluir a execução.
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Iniciar inspeção por TAG</h2>
        <p className="mt-1 text-sm text-slate-500">
          Digite a TAG desejada para ir direto ao checklist correspondente.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={searchTag}
            onChange={event => setSearchTag(event.target.value.toUpperCase())}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Ex.: ABC123"
            className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm uppercase tracking-wide text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:flex-1"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Iniciar
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Máquinas disponíveis</h2>
            <p className="text-sm text-slate-500">Selecione uma máquina para abrir uma nova inspeção.</p>
          </div>
          {sessionLoading && (
            <span className="text-xs text-slate-400">Carregando sessão...</span>
          )}
        </div>

        {machinesLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : machinesError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{machinesError}</div>
        ) : machines.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
            Nenhuma máquina atribuída a você no momento.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {machines.map(machine => {
              const hasTag = Boolean(machine.tag);
              return (
                <article
                  key={machine.id}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-transparent bg-white shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"
                >
                  {machine.fotoUrl ? (
                    <div className="relative h-40 w-full">
                      <Image
                        src={machine.fotoUrl}
                        alt={`Foto da máquina ${machine.nome ?? machine.tag ?? ""}`}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      />
                    </div>
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-slate-100 text-sm font-medium text-slate-500">
                      Sem imagem
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-slate-900">{machine.nome ?? "Máquina"}</h3>
                      <p className="text-sm text-slate-600">TAG: {machine.tag ?? "-"}</p>
                      <p className="text-xs text-slate-500">Setor: {machine.setor ?? "-"}</p>
                      <p className="text-xs text-slate-500">Unidade: {machine.unidade ?? "-"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectMachine(machine.tag)}
                      disabled={!hasTag}
                      className="mt-auto inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      {hasTag ? "Iniciar inspeção" : "TAG indisponível"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
