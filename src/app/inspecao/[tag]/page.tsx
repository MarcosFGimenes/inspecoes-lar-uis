"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { SignatureCanvasInstance } from "@/components/signature-canvas-client";

type SignatureCanvasComponent = typeof import("@/components/signature-canvas-client").default;
const SignatureCanvas = dynamic(() => import("@/components/signature-canvas-client"), { ssr: false }) as unknown as SignatureCanvasComponent;

/* ===== Tipos já existentes ===== */
type MaintainerInfo = { id: string; nome: string | null; matricula: string | null };
type MachineInfo = {
  id: string; tag: string | null; nome: string | null; setor: string | null; unidade: string | null;
  localUnidade: string | null; lac: string | null; fotoUrl: string | null; templateId: string;
};
type TemplateItem = {
  id?: string; componente?: string | null; oQueChecar?: string | null; instrumento?: string | null;
  criterio?: string | null; oQueFazer?: string | null; imagemItemUrl?: string | null; ordem?: number | null;
};
type TemplateInfo = { id: string; nome: string | null; imagemUrl?: string | null; itens: TemplateItem[] };
type IssueRecord = { id: string; templateItemId: string | null; descricao: string | null; osNumero: string | null; createdAt: string | null };
type InspectionContext = { maintainer: MaintainerInfo; machine: MachineInfo; template: TemplateInfo; openIssues: IssueRecord[] };

type ItemFormState = { resultado: "" | "C" | "NC" | "NA"; observacao: string; fotos: File[]; fileKey: number };
type FeedbackState = { type: "success" | "error"; message: string };

const RESULT_OPTIONS: Array<{ value: "C" | "NC" | "NA"; label: string; tone: "ok" | "nc" | "na" }> = [
  { value: "C", label: "C", tone: "ok" },
  { value: "NC", label: "NC", tone: "nc" },
  { value: "NA", label: "N/A", tone: "na" },
];

/* ===== Helpers já existentes ===== */
async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Falha ao ler arquivo")));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

/* ===== Botão C/NC/N/A no novo visual (mantém handlers) ===== */
function ChoiceBtn({
  active, tone, children, onClick, ariaLabel,
}: { active: boolean; tone: "ok" | "nc" | "na"; children: React.ReactNode; onClick: () => void; ariaLabel: string }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold border-2 transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2";
  const inactive = "bg-white text-gray-800 border-black hover:bg-gray-50";
  const activeByTone: Record<typeof tone, string> = {
    ok: "bg-emerald-600 text-white border-emerald-600",
    nc: "bg-red-600 text-white border-red-600",
    na: "bg-gray-600 text-white border-gray-600",
  };
  const ringByTone: Record<typeof tone, string> = {
    ok: "focus-visible:outline-emerald-600",
    nc: "focus-visible:outline-red-600",
    na: "focus-visible:outline-gray-600",
  };
  return (
    <button type="button" aria-pressed={active} aria-label={ariaLabel}
      className={`${base} ${active ? activeByTone[tone] : inactive} ${ringByTone[tone]}`} onClick={onClick}>
      {children}
    </button>
  );
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
    if (searchParams?.get("ok") === "1") setFeedback({ type: "success", message: "Inspeção salva" });
    const idParam = searchParams?.get("id");
    if (idParam) setLastInspectionId(idParam);
  }, [searchParams]);

  /* ===== Organização visual ===== */
  const sortedItems = useMemo(() => {
    if (!context?.template?.itens) return [] as TemplateItem[];
    return [...context.template.itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  }, [context?.template?.itens]);

  const refreshContext = useCallback(() => setReloadCounter((p) => p + 1), []);

  /* ===== Carrega contexto (sem mexer na lógica) ===== */
  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      if (!tag) {
        setContext(null); setLoading(false); setError("TAG inválida."); return;
      }
      setLoading(true); setError(null);
      try {
        const response = await fetch(`/api/inspecao/context?tag=${encodeURIComponent(tag)}`, { cache: "no-store" });
        if (response.status === 401) { window.location.href = "/login"; return; }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message =
            payload?.error === "FORBIDDEN" ? "Você não tem acesso a esta máquina."
            : payload?.error === "MACHINE_NOT_FOUND" ? "Máquina não encontrada."
            : payload?.error === "TEMPLATE_NOT_FOUND" ? "Template da máquina não encontrado."
            : typeof payload?.error === "string" ? payload.error : "Falha ao carregar dados da inspeção.";
          throw new Error(message);
        }
        const data = (await response.json()) as InspectionContext;
        if (!cancelled) { setContext(data); setError(null); }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar dados da inspeção.";
          setError(message); setContext(null);
        }
      } finally { if (!cancelled) setLoading(false); }
    }
    loadContext();
    return () => { cancelled = true; };
  }, [tag, reloadCounter]);

  /* ===== Reset do formulário ===== */
  const resetForm = useCallback(() => {
    if (!context?.template?.itens) return;
    const initial: Record<string, ItemFormState> = {};
    context.template.itens.filter((i) => i.id).forEach((i, idx) => {
      initial[i.id!] = { resultado: "", observacao: "", fotos: [], fileKey: Date.now() + idx };
    });
    setItemsState(initial); setOsNumero(""); setObservacoes(""); setResolveIssues({});
    setSignatureTouched(false); signatureRef.current?.clear?.();
  }, [context?.template?.itens]);

  useEffect(() => { if (context) resetForm(); }, [context, resetForm]);

  /* ===== Derivados ===== */
  const hasNC = useMemo(() => Object.values(itemsState).some((i) => i.resultado === "NC"), [itemsState]);

  // itens que têm issue aberta -> vira “alerta amarelo”
  const itemsWithOpenIssue = useMemo(() => {
    const set = new Set<string>();
    for (const issue of context?.openIssues ?? []) {
      if (issue.templateItemId) set.add(issue.templateItemId);
    }
    return set;
  }, [context?.openIssues]);

  /* ===== Handlers (mesmos nomes/contratos) ===== */
  const handleResultadoChange = useCallback((itemId: string, value: "C" | "NC" | "NA") => {
    setItemsState((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? { resultado: "", observacao: "", fotos: [], fileKey: Date.now() }), resultado: value } }));
  }, []);

  const handleObservacaoChange = useCallback((itemId: string, value: string) => {
    setItemsState((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? { resultado: "", observacao: "", fotos: [], fileKey: Date.now() }), observacao: value } }));
  }, []);

  const handleFotosChange = useCallback((itemId: string, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 3);
    setItemsState((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { resultado: "", observacao: "", fotos: [], fileKey: Date.now() }), fotos: files, fileKey: (prev[itemId]?.fileKey ?? Date.now()) + 1 },
    }));
  }, []);

  const handleResolveIssue = useCallback((issueId: string, checked: boolean) => {
    setResolveIssues((prev) => ({ ...prev, [issueId]: checked }));
  }, []);

  const submitInspection = useCallback(
    async (mode: "save" | "save-new") => {
      if (!context?.machine?.tag) { setFeedback({ type: "error", message: "Máquina sem TAG configurada." }); return; }
      if (saving) return;
      setSaving(true); setSavingAction(mode); setFeedback(null);
      try {
        const payloadItems: Array<{ templateItemId: string; resultado: "C" | "NC" | "NA"; observacaoItem?: string; fotos?: string[] }> = [];
        for (const item of sortedItems) {
          if (!item.id) continue;
          const st = itemsState[item.id];
          if (!st || !st.resultado) { setFeedback({ type: "error", message: "Selecione C / NC / N/A para todos os itens." }); setSaving(false); setSavingAction(null); return; }
          const fotosBase64 = st.fotos.length ? await Promise.all(st.fotos.map(fileToDataUrl)) : undefined;
          payloadItems.push({ templateItemId: item.id, resultado: st.resultado, observacaoItem: st.observacao.trim() || undefined, fotos: fotosBase64 });
        }
        if (!payloadItems.length) { setFeedback({ type: "error", message: "Template sem itens configurados." }); setSaving(false); setSavingAction(null); return; }

        let assinaturaDataUrl: string | undefined;
        if (signatureRef.current?.isEmpty && !signatureRef.current.isEmpty()) {
          assinaturaDataUrl = signatureRef.current.toDataURL("image/png");
        }
        const resolveIds = Object.entries(resolveIssues).filter(([, c]) => c).map(([id]) => id);

        const response = await fetch("/api/inspecoes", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tag: context.machine.tag, osNumero: osNumero.trim() || undefined, observacoes: observacoes.trim() || undefined,
            assinaturaDataUrl, itens: payloadItems, resolveIssues: resolveIds.length ? resolveIds : undefined,
          }),
        });
        if (response.status === 401) { window.location.href = "/login"; return; }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(typeof payload?.error === "string" ? payload.error : "Falha ao salvar inspeção.");
        }
        const data = await response.json();
        const inspectionId = data?.id ? String(data.id) : null;
        if (inspectionId) setLastInspectionId(inspectionId);

        refreshContext();
        if (mode === "save") {
          router.replace(`/inspecao/${encodeURIComponent(context.machine.tag)}?ok=1${inspectionId ? `&id=${inspectionId}` : ""}`);
        } else {
          setFeedback({ type: "success", message: "Inspeção salva" });
          resetForm();
          if (inspectionId) setLastInspectionId(inspectionId);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } catch (err: unknown) {
        setFeedback({ type: "error", message: err instanceof Error && err.message ? err.message : "Falha ao salvar inspeção." });
      } finally { setSaving(false); setSavingAction(null); }
    },
    [context, itemsState, observacoes, osNumero, refreshContext, resetForm, resolveIssues, router, saving, sortedItems]
  );

  /* ===== Render ===== */
  if (!tag) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">Informe uma TAG válida para iniciar a inspeção.</div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">Carregando dados da inspeção...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      {/* Header + PDF */}
      <header className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Checklist — {context?.machine?.nome ?? tag.toUpperCase()}</h1>
            {context?.machine?.tag && (
              <p className="text-sm text-gray-600">
                TAG: <code className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-700">{context.machine.tag}</code>
              </p>
            )}
            {context?.maintainer && (
              <p className="text-sm text-gray-600">
                Mantenedor: <span className="font-medium">{context.maintainer.nome ?? "-"}</span> (mat. {context.maintainer.matricula ?? "-"})
              </p>
            )}
          </div>

          <a
            href={lastInspectionId ? `/api/inspecoes/${lastInspectionId}/pdf` : "#"}
            target="_blank" rel="noreferrer"
            className={`inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition ${
              lastInspectionId ? "border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100"
              : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
            }`} aria-disabled={!lastInspectionId}>
            Gerar PDF
          </a>
        </div>

        {feedback && (
          <div className={`rounded-md border px-4 py-3 text-sm ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {feedback.message}
          </div>
        )}
      </header>

      {/* Identificação da máquina (visual novo) */}
      {context && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex-1 space-y-1 text-sm text-gray-700">
              <div className="text-lg font-semibold text-gray-900">{context.machine.nome ?? "Máquina"}</div>
              <div>Unidade: {context.machine.unidade ?? "-"}</div>
              <div>Local: {context.machine.localUnidade ?? "-"}</div>
              <div>Setor: {context.machine.setor ?? "-"}</div>
              <div>LAC: {context.machine.lac ?? "-"}</div>
            </div>
            {context.machine.fotoUrl && (
              <div className="relative h-40 w-full overflow-hidden rounded-md border bg-gray-50 md:h-44 md:w-44">
                <Image src={context.machine.fotoUrl} alt={`Foto da máquina ${context.machine.nome ?? context.machine.tag ?? ""}`} fill className="object-cover" sizes="176px" />
              </div>
            )}
          </div>
        </section>
      )}

      {/* OS / Observações / Assinatura no estilo novo */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700 font-medium">Nº da O.S.</span>
            <input
              value={osNumero} onChange={(e) => setOsNumero(e.target.value.toUpperCase())}
              placeholder="Opcional"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700 font-medium">Observações gerais</span>
            <textarea
              value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3}
              placeholder="Registre observações relevantes"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
        </div>

        {hasNC && !osNumero.trim() && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Existem itens marcados como NC. Considere informar o Nº da O.S.
          </div>
        )}

        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Assinatura do mantenedor</p>
          <div className="h-40 w-full overflow-hidden rounded-md border border-dashed border-gray-300 bg-gray-50">
            {typeof window !== "undefined" && (
              <SignatureCanvas
                ref={signatureRef} penColor="#111827" backgroundColor="transparent"
                onEnd={() => setSignatureTouched(true)} canvasProps={{ className: "h-full w-full" }}
              />
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => { signatureRef.current?.clear?.(); setSignatureTouched(false); }}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
            >
              Limpar assinatura
            </button>
            {!signatureTouched && <span className="text-xs text-gray-500">Assine utilizando o campo acima.</span>}
          </div>
        </div>
      </section>

      {/* Checklist – layout novo + destaque amarelo quando houver issue aberta */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Perguntas</h2>
          <p className="text-sm text-gray-600">Template: {context?.template?.nome ?? "-"}</p>
        </div>

        {sortedItems.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600">Nenhum item configurado para este template.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {sortedItems.map((item, idx) => {
              if (!item.id) return null;
              const st = itemsState[item.id];
              const hasOpenIssue = itemsWithOpenIssue.has(item.id);

              return (
                <article key={item.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">
                        <span className="mr-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">{String(idx + 1).padStart(2, "0")}</span>
                        {item.componente ?? "Item sem nome"}
                      </p>
                      {item.oQueChecar && <p className="text-sm text-gray-700">O que checar: {item.oQueChecar}</p>}
                      {item.instrumento && <p className="text-sm text-gray-700">Instrumento: {item.instrumento}</p>}
                      {item.criterio && <p className="text-sm text-gray-700">Critério: {item.criterio}</p>}
                      {item.oQueFazer && <p className="text-sm text-gray-700">O que fazer: {item.oQueFazer}</p>}
                    </div>
                    {item.imagemItemUrl && (
                      <div className="relative h-28 w-full overflow-hidden rounded-md border bg-gray-50 md:h-32 md:w-32">
                        <Image src={item.imagemItemUrl} alt={`Imagem do item ${item.componente ?? item.id}`} fill className="object-cover" sizes="128px" />
                      </div>
                    )}
                  </header>

                  {hasOpenIssue && (
                    <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      Este item possui não conformidade/issue aberta do ciclo anterior. Avalie e informe o resultado.
                    </div>
                  )}

                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    {/* Resultado (botões) */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">Resultado</p>
                      <div className="flex flex-wrap gap-2">
                        {RESULT_OPTIONS.map((option) => (
                          <ChoiceBtn
                            key={option.value}
                            tone={option.tone}
                            active={st?.resultado === option.value}
                            onClick={() => handleResultadoChange(item.id!, option.value)}
                            ariaLabel={`Marcar como ${option.label === "C" ? "Conforme" : option.label === "NC" ? "Não Conforme" : "Não se Aplica"}`}
                          >
                            {option.label}
                          </ChoiceBtn>
                        ))}
                      </div>
                  </div>

                    {/* Observação */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700" htmlFor={`observacao-${item.id}`}>Observações</label>
                      <textarea
                        id={`observacao-${item.id}`} value={st?.observacao ?? ""} rows={3}
                        onChange={(e) => handleObservacaoChange(item.id!, e.target.value)}
                        placeholder="Detalhe evidências/observações relevantes"
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                  </div>

                  {/* Fotos – área tracejada (mantendo seu handler) */}
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <label className="text-sm font-medium text-gray-700" htmlFor={`fotos-${item.id}`}>Fotos (até 3)</label>
                      <span className="text-xs text-gray-500">Arquivos aceitos: imagens</span>
                    </div>

                    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600">
                      <input
                        key={st?.fileKey ?? `${item.id}-0`}
                        id={`fotos-${item.id}`} type="file" accept="image/*" multiple className="sr-only"
                        onChange={(ev) => handleFotosChange(item.id!, ev)}
                      />
                      <span className="font-semibold">Selecionar imagens</span>
                      <span className="text-xs">Clique para escolher (máx. 3)</span>
                    </label>

                    {st?.fotos?.length ? (
                      <ul className="list-disc space-y-1 pl-5 text-xs text-gray-600">
                        {st.fotos.map((f) => <li key={f.name}>{f.name}</li>)}
                      </ul>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Issues abertas (mantida) */}
      {context && (
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Issues abertas</h2>
          {context.openIssues.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhuma issue aberta para esta TAG.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {context.openIssues.map((issue) => (
                <label key={issue.id} className="flex cursor-pointer flex-col gap-1 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700 transition hover:border-blue-300 hover:bg-blue-50">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox" checked={!!resolveIssues[issue.id]}
                      onChange={(e) => handleResolveIssue(issue.id, e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="space-y-1">
                      <p className="font-medium">{issue.descricao ?? "Issue sem descrição"}</p>
                      {issue.osNumero && <p className="text-xs text-gray-500">O.S.: {issue.osNumero}</p>}
                      {issue.createdAt && <p className="text-xs text-gray-400">Aberta em {new Date(issue.createdAt).toLocaleString("pt-BR")}</p>}
                      <p className="text-xs text-gray-600">Marcar como resolvida nesta inspeção</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Footer fixo com ações (mesmo fluxo) */}
      <footer className="sticky bottom-0 left-0 right-0 z-10 -mx-4 border-t border-gray-200 bg-white/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <a
              href={lastInspectionId ? `/api/inspecoes/${lastInspectionId}/pdf` : "#"}
              target="_blank" rel="noreferrer"
              className={`inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition ${
                lastInspectionId ? "border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
              }`} aria-disabled={!lastInspectionId}>
              Gerar PDF
            </a>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button" disabled={saving}
              onClick={() => submitInspection("save")}
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && savingAction === "save" ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button" disabled={saving}
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
