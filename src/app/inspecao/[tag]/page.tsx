"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { SignatureCanvasInstance } from "@/components/signature-canvas-client";

type SignatureCanvasComponent = typeof import("@/components/signature-canvas-client").default;

const SignatureCanvas = dynamic(() => import("@/components/signature-canvas-client"), {
  ssr: false,
}) as unknown as SignatureCanvasComponent;

type MaintainerInfo = {
  id: string;
  nome: string | null;
  matricula: string | null;
};

type MachineInfo = {
  id: string;
  tag: string | null;
  nome: string | null;
  setor: string | null;
  unidade: string | null;
  localUnidade: string | null;
  lac: string | null;
  fotoUrl: string | null;
  templateId: string;
};

type TemplateItem = {
  id?: string;
  componente?: string | null;
  oQueChecar?: string | null;
  instrumento?: string | null;
  criterio?: string | null;
  oQueFazer?: string | null;
  imagemItemUrl?: string | null;
  ordem?: number | null;
};

type TemplateInfo = {
  id: string;
  nome: string | null;
  imagemUrl?: string | null;
  itens: TemplateItem[];
};

type IssueRecord = {
  id: string;
  templateItemId: string | null;
  descricao: string | null;
  osNumero: string | null;
  createdAt: string | null;
};

type InspectionContext = {
  maintainer: MaintainerInfo;
  machine: MachineInfo;
  template: TemplateInfo;
  openIssues: IssueRecord[];
};

type ItemFormState = {
  resultado: "" | "C" | "NC" | "NA";
  observacao: string;
  fotos: File[];
  fileKey: number;
};

type FeedbackState = {
  type: "success" | "error";
  message: string;
};

const RESULT_OPTIONS: Array<{ value: "C" | "NC" | "NA"; label: string; description: string }> = [
  { value: "C", label: "C", description: "Conforme" },
  { value: "NC", label: "NC", description: "Não conforme" },
  { value: "NA", label: "N/A", description: "Não se aplica" },
];

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Falha ao ler arquivo"));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Falha ao ler arquivo"));
    };
    reader.readAsDataURL(file);
  });
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
  const [osNumero, setOsNumero] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [resolveIssues, setResolveIssues] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState<"save" | "save-new" | null>(null);
  const [lastInspectionId, setLastInspectionId] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const signatureRef = useRef<SignatureCanvasInstance | null>(null);
  const [signatureTouched, setSignatureTouched] = useState(false);

  useEffect(() => {
    if (searchParams?.get("ok") === "1") {
      setFeedback({ type: "success", message: "Inspeção salva" });
    }
    const idParam = searchParams?.get("id");
    if (idParam) {
      setLastInspectionId(idParam);
    }
  }, [searchParams]);

  const sortedItems = useMemo(() => {
    if (!context?.template?.itens) return [] as TemplateItem[];
    return [...context.template.itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  }, [context?.template?.itens]);

  const refreshContext = useCallback(() => {
    setReloadCounter(prev => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      if (!tag) {
        setContext(null);
        setLoading(false);
        setError("TAG inválida.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/inspecao/context?tag=${encodeURIComponent(tag)}`, {
          cache: "no-store",
        });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message =
            payload?.error === "FORBIDDEN"
              ? "Você não tem acesso a esta máquina."
              : payload?.error === "MACHINE_NOT_FOUND"
              ? "Máquina não encontrada."
              : payload?.error === "TEMPLATE_NOT_FOUND"
              ? "Template da máquina não encontrado."
              : typeof payload?.error === "string"
              ? payload.error
              : "Falha ao carregar dados da inspeção.";
          throw new Error(message);
        }
        const data = (await response.json()) as InspectionContext;
        if (!cancelled) {
          setContext(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar dados da inspeção.";
          setError(message);
          setContext(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadContext();
    return () => {
      cancelled = true;
    };
  }, [tag, reloadCounter]);

  const resetForm = useCallback(() => {
    if (!context?.template?.itens) return;
    const initialState: Record<string, ItemFormState> = {};
    context.template.itens
      .filter(item => item.id)
      .forEach((item, index) => {
        initialState[item.id!] = {
          resultado: "",
          observacao: "",
          fotos: [],
          fileKey: Date.now() + index,
        };
      });
    setItemsState(initialState);
    setOsNumero("");
    setObservacoes("");
    setResolveIssues({});
    setSignatureTouched(false);
    if (signatureRef.current && typeof signatureRef.current.clear === "function") {
      signatureRef.current.clear();
    }
  }, [context?.template?.itens]);

  useEffect(() => {
    if (context) {
      resetForm();
    }
  }, [context, resetForm]);

  const hasNC = useMemo(() => {
    return Object.values(itemsState).some(item => item.resultado === "NC");
  }, [itemsState]);

  const handleResultadoChange = useCallback((itemId: string, value: "C" | "NC" | "NA") => {
    setItemsState(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? { resultado: "", observacao: "", fotos: [], fileKey: Date.now() }),
        resultado: value,
      },
    }));
  }, []);

  const handleObservacaoChange = useCallback((itemId: string, value: string) => {
    setItemsState(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? { resultado: "", observacao: "", fotos: [], fileKey: Date.now() }),
        observacao: value,
      },
    }));
  }, []);

  const handleFotosChange = useCallback((itemId: string, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 3);
    setItemsState(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? { resultado: "", observacao: "", fotos: [], fileKey: Date.now() }),
        fotos: files,
        fileKey: (prev[itemId]?.fileKey ?? Date.now()) + 1,
      },
    }));
  }, []);

  const handleResolveIssue = useCallback((issueId: string, checked: boolean) => {
    setResolveIssues(prev => ({
      ...prev,
      [issueId]: checked,
    }));
  }, []);

  const submitInspection = useCallback(
    async (mode: "save" | "save-new") => {
      if (!context?.machine?.tag) {
        setFeedback({ type: "error", message: "Máquina sem TAG configurada." });
        return;
      }
      if (saving) return;
      setSaving(true);
      setSavingAction(mode);
      setFeedback(null);
      try {
        const payloadItems = [] as Array<{
          templateItemId: string;
          resultado: "C" | "NC" | "NA";
          observacaoItem?: string;
          fotos?: string[];
        }>;

        for (const item of sortedItems) {
          if (!item.id) continue;
          const state = itemsState[item.id];
          if (!state || !state.resultado) {
            setFeedback({ type: "error", message: "Selecione C / NC / N/A para todos os itens." });
            setSaving(false);
            setSavingAction(null);
            return;
          }
          const fotosBase64 = state.fotos.length
            ? await Promise.all(state.fotos.map(file => fileToDataUrl(file)))
            : undefined;
          payloadItems.push({
            templateItemId: item.id,
            resultado: state.resultado,
            observacaoItem: state.observacao.trim() ? state.observacao.trim() : undefined,
            fotos: fotosBase64,
          });
        }

        if (payloadItems.length === 0) {
          setFeedback({ type: "error", message: "Template sem itens configurados." });
          setSaving(false);
          setSavingAction(null);
          return;
        }

        let assinaturaDataUrl: string | undefined;
        if (signatureRef.current && typeof signatureRef.current.isEmpty === "function") {
          const empty = signatureRef.current.isEmpty();
          if (!empty) {
            assinaturaDataUrl = signatureRef.current.toDataURL("image/png");
          }
        }

        const resolveIds = Object.entries(resolveIssues)
          .filter(([, checked]) => checked)
          .map(([issueId]) => issueId);

        const response = await fetch("/api/inspecoes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tag: context.machine.tag,
            osNumero: osNumero.trim() || undefined,
            observacoes: observacoes.trim() || undefined,
            assinaturaDataUrl,
            itens: payloadItems,
            resolveIssues: resolveIds.length ? resolveIds : undefined,
          }),
        });

        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = typeof payload?.error === "string" ? payload.error : "Falha ao salvar inspeção.";
          throw new Error(message);
        }

        const data = await response.json();
        const inspectionId = data?.id ? String(data.id) : null;
        if (inspectionId) {
          setLastInspectionId(inspectionId);
        }

        refreshContext();

        if (mode === "save") {
          router.replace(`/inspecao/${encodeURIComponent(context.machine.tag)}?ok=1${inspectionId ? `&id=${inspectionId}` : ""}`);
        } else {
          setFeedback({ type: "success", message: "Inspeção salva" });
          resetForm();
          if (inspectionId) {
            setLastInspectionId(inspectionId);
          }
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } catch (err: unknown) {
        const message = err instanceof Error && err.message ? err.message : "Falha ao salvar inspeção.";
        setFeedback({ type: "error", message });
      } finally {
        setSaving(false);
        setSavingAction(null);
      }
    },
    [context, itemsState, observacoes, osNumero, refreshContext, resetForm, resolveIssues, router, saving, sortedItems]
  );

  if (!tag) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Informe uma TAG válida para iniciar a inspeção.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Inspeção — {tag.toUpperCase()}</h1>
            {context?.maintainer && (
              <p className="text-sm text-gray-600">
                Mantenedor: <span className="font-medium">{context.maintainer.nome ?? "-"}</span> (matrícula
                {" "}
                {context.maintainer.matricula ?? "-"})
              </p>
            )}
          </div>
          <a
            href={lastInspectionId ? `/api/inspecoes/${lastInspectionId}/pdf` : "#"}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition ${
              lastInspectionId
                ? "border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
            }`}
            aria-disabled={!lastInspectionId}
          >
            Gerar PDF
          </a>
        </div>
        {feedback && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {feedback.message}
          </div>
        )}
        {loading && (
          <div className="space-y-3">
            <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
            <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
          </div>
        )}
        {error && !loading && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}
      </header>

      {context && !loading && !error && (
        <>
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex-1 space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900">{context.machine.nome ?? "Máquina"}</h2>
                <div className="text-sm text-gray-600">
                  <p>Unidade: {context.machine.unidade ?? "-"}</p>
                  <p>Local: {context.machine.localUnidade ?? "-"}</p>
                  <p>Setor: {context.machine.setor ?? "-"}</p>
                  <p>LAC: {context.machine.lac ?? "-"}</p>
                  <p>TAG: {context.machine.tag ?? "-"}</p>
                </div>
              </div>
              {context.machine.fotoUrl ? (
                <div className="relative h-40 w-full overflow-hidden rounded-md border bg-gray-50 md:h-48 md:w-48">
                  <Image
                    src={context.machine.fotoUrl}
                    alt={`Foto da máquina ${context.machine.nome ?? context.machine.tag ?? ""}`}
                    fill
                    className="object-cover"
                    sizes="192px"
                  />
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="osNumero">
                  Nº da O.S.
                </label>
                <input
                  id="osNumero"
                  value={osNumero}
                  onChange={event => setOsNumero(event.target.value.toUpperCase())}
                  placeholder="Opcional"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm uppercase text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="observacoes">
                  Observações gerais
                </label>
                <textarea
                  id="observacoes"
                  value={observacoes}
                  onChange={event => setObservacoes(event.target.value)}
                  placeholder="Registre observações relevantes"
                  rows={3}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            {hasNC && !osNumero.trim() && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                Existem itens marcados como NC. Considere informar o Nº da O.S.
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Assinatura do mantenedor</p>
              <div className="h-40 w-full overflow-hidden rounded-md border border-dashed border-gray-300 bg-gray-50">
                {typeof window !== "undefined" && (
                  <SignatureCanvas
                    ref={signatureRef}
                    penColor="#111827"
                    backgroundColor="transparent"
                    onEnd={() => setSignatureTouched(true)}
                    canvasProps={{ className: "h-full w-full" }}
                  />
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    if (signatureRef.current && typeof signatureRef.current.clear === "function") {
                      signatureRef.current.clear();
                      setSignatureTouched(false);
                    }
                  }}
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                >
                  Limpar assinatura
                </button>
                {!signatureTouched && <span className="text-xs text-gray-500">Assine utilizando o campo acima.</span>}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Checklist</h2>
              <p className="text-sm text-gray-600">Template: {context.template.nome ?? "-"}</p>
            </div>

            {sortedItems.length === 0 ? (
              <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600">
                Nenhum item configurado para este template.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {sortedItems.map(item => {
                  if (!item.id) return null;
                  const state = itemsState[item.id];
                  return (
                    <article key={item.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {item.ordem ? `${item.ordem}. ` : ""}
                            {item.componente ?? "Item sem nome"}
                          </h3>
                          {item.oQueChecar && (
                            <p className="text-sm text-gray-600">O que checar: {item.oQueChecar}</p>
                          )}
                          {item.instrumento && (
                            <p className="text-sm text-gray-600">Instrumento: {item.instrumento}</p>
                          )}
                          {item.criterio && (
                            <p className="text-sm text-gray-600">Critério: {item.criterio}</p>
                          )}
                          {item.oQueFazer && (
                            <p className="text-sm text-gray-600">O que fazer: {item.oQueFazer}</p>
                          )}
                        </div>
                        {item.imagemItemUrl ? (
                          <div className="relative h-32 w-full overflow-hidden rounded-md border bg-gray-50 md:h-36 md:w-36">
                            <Image
                              src={item.imagemItemUrl}
                              alt={`Imagem do item ${item.componente ?? item.id}`}
                              fill
                              className="object-cover"
                              sizes="144px"
                            />
                          </div>
                        ) : null}
                      </header>

                      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-700">Resultado</p>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {RESULT_OPTIONS.map(option => {
                              const isSelected = state?.resultado === option.value;
                              const baseClasses =
                                option.value === "C"
                                  ? "border-emerald-500 text-emerald-700 bg-emerald-50"
                                  : option.value === "NC"
                                  ? "border-red-500 text-red-700 bg-red-50"
                                  : "border-slate-400 text-slate-600 bg-slate-50";
                              const idleClasses =
                                option.value === "C"
                                  ? "hover:border-emerald-400 hover:bg-emerald-50"
                                  : option.value === "NC"
                                  ? "hover:border-red-400 hover:bg-red-50"
                                  : "hover:border-slate-300 hover:bg-slate-50";
                              return (
                                <label
                                  key={option.value}
                                  className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border px-3 py-3 text-sm font-medium transition ${
                                    isSelected ? baseClasses : `border-gray-200 bg-white text-gray-600 ${idleClasses}`
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    className="sr-only"
                                    name={`resultado-${item.id}`}
                                    value={option.value}
                                    checked={state?.resultado === option.value}
                                    onChange={() => handleResultadoChange(item.id!, option.value)}
                                  />
                                  <span>{option.label}</span>
                                  <span className="text-xs font-normal">{option.description}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700" htmlFor={`observacao-${item.id}`}>
                            Observação do item (opcional)
                          </label>
                          <textarea
                            id={`observacao-${item.id}`}
                            value={state?.observacao ?? ""}
                            onChange={event => handleObservacaoChange(item.id!, event.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                          />
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        <label className="text-sm font-medium text-gray-700" htmlFor={`fotos-${item.id}`}>
                          Fotos do item (até 3)
                        </label>
                        <input
                          key={state?.fileKey ?? `${item.id}-0`}
                          id={`fotos-${item.id}`}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={event => handleFotosChange(item.id!, event)}
                          className="text-sm text-gray-600"
                        />
                        <p className="text-xs text-gray-500">Arquivos aceitos: imagens (máximo de 3 fotos por item).</p>
                        {state?.fotos?.length ? (
                          <ul className="list-disc space-y-1 pl-5 text-xs text-gray-600">
                            {state.fotos.map(file => (
                              <li key={file.name}>{file.name}</li>
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

          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Issues abertas</h2>
            {context.openIssues.length === 0 ? (
              <p className="text-sm text-gray-600">Nenhuma issue aberta para esta TAG.</p>
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
                        onChange={event => handleResolveIssue(issue.id, event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="space-y-1">
                        <p className="font-medium">{issue.descricao ?? "Issue sem descrição"}</p>
                        {issue.templateItemId && (
                          <p className="text-xs text-gray-500">Item: {issue.templateItemId}</p>
                        )}
                        {issue.osNumero && (
                          <p className="text-xs text-gray-500">O.S.: {issue.osNumero}</p>
                        )}
                        {issue.createdAt && (
                          <p className="text-xs text-gray-400">
                            Aberta em {new Date(issue.createdAt).toLocaleString("pt-BR")}
                          </p>
                        )}
                        <p className="text-xs text-gray-600">Marcar como resolvida nesta inspeção</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <footer className="sticky bottom-0 left-0 right-0 z-10 -mx-4 border-t border-gray-200 bg-white/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <a
              href={lastInspectionId ? `/api/inspecoes/${lastInspectionId}/pdf` : "#"}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition ${
                lastInspectionId
                  ? "border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
              }`}
              aria-disabled={!lastInspectionId}
            >
              Gerar PDF
            </a>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={saving}
              onClick={() => submitInspection("save")}
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && savingAction === "save" ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => submitInspection("save-new")}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && savingAction === "save-new" ? "Salvando..." : "Salvar & Nova"}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
