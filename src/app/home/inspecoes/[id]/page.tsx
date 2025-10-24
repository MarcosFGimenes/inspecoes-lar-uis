"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ChecklistAnswer } from "@/types";
import { ensureStoredPhotos, photosToUrls } from "@/lib/photos";

type InspectionAnswer = Omit<ChecklistAnswer, "questionText" | "observation" | "photoUrls" | "itemOsNumero"> & {
  questionText: string | null;
  observation: string | null;
  photoUrls: string[];
  itemOsNumero: string | null;
};

type InspectionDetail = {
  id: string;
  machineNome: string | null;
  machineTag: string | null;
  machineSetor: string | null;
  machineUnidade: string | null;
  osNumero: string | null;
  observacoes: string | null;
  finalizadaEm: string | null;
  assinaturaUrl: string | null;
  qtdNc: number;
  answers: InspectionAnswer[];
};

function responseLabel(value: "c" | "nc" | "na") {
  switch (value) {
    case "nc":
      return { label: "Não conforme", className: "bg-red-100 text-red-700" };
    case "na":
      return { label: "Não se aplica", className: "bg-gray-200 text-gray-700" };
    default:
      return { label: "Conforme", className: "bg-emerald-100 text-emerald-700" };
  }
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export default function MaintInspectionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const idParam = Array.isArray(params?.id) ? params?.id?.[0] : params?.id ?? "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<InspectionDetail | null>(null);

  useEffect(() => {
    if (!idParam) {
      setError("Identificador da inspeção inválido.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadInspection() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/inspecoes/${encodeURIComponent(idParam)}`, { cache: "no-store" });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (response.status === 403) {
          throw new Error("Você não tem permissão para visualizar esta inspeção.");
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(typeof payload?.error === "string" ? payload.error : "Falha ao carregar inspeção");
        }
        const data = await response.json();
        if (cancelled) return;
        const inspectionData = data?.inspection ?? {};
        const machineData = (data?.machine ?? inspectionData.machine ?? {}) as Record<string, unknown>;
        const answersData = Array.isArray(inspectionData.answers)
          ? (inspectionData.answers as ChecklistAnswer[])
          : [];
        const normalizedAnswers = answersData.reduce<InspectionAnswer[]>((acc, answer) => {
          const questionId = answer?.questionId ? String(answer.questionId) : "";
          if (!questionId) {
            return acc;
          }
          const response: "c" | "nc" | "na" = answer?.response === "nc" ? "nc" : answer?.response === "na" ? "na" : "c";
          const photoUrls = photosToUrls(ensureStoredPhotos(answer?.photoUrls));
          const itemOsNumero = typeof answer?.itemOsNumero === "string" && answer.itemOsNumero.trim().length > 0
            ? answer.itemOsNumero.trim()
            : null;
          acc.push({
            questionId,
            questionText: answer?.questionText ?? null,
            response,
            observation: answer?.observation ?? null,
            photoUrls,
            itemOsNumero,
          });
          return acc;
        }, []);

        const osNumero = typeof inspectionData.osNumero === "string" ? inspectionData.osNumero : null;
        const observacoes = typeof inspectionData.observacoes === "string" ? inspectionData.observacoes : null;
        const finalizadaEm = typeof inspectionData.finalizadaEm === "string"
          ? inspectionData.finalizadaEm
          : typeof inspectionData.createdAt === "string"
            ? inspectionData.createdAt
            : null;
        const assinaturaUrl = typeof inspectionData.assinaturaUrl === "string" ? inspectionData.assinaturaUrl : null;
        const qtdNc =
          typeof inspectionData.qtdNC === "number" && Number.isFinite(inspectionData.qtdNC)
            ? inspectionData.qtdNC
            : normalizedAnswers.filter(a => a.response === "nc").length;

        const detail: InspectionDetail = {
          id: inspectionData.id ? String(inspectionData.id) : idParam,
          machineNome: typeof machineData.nome === "string" ? machineData.nome : null,
          machineTag: typeof machineData.tag === "string" ? machineData.tag : null,
          machineSetor: typeof machineData.setor === "string" ? machineData.setor : null,
          machineUnidade: typeof machineData.unidade === "string" ? machineData.unidade : null,
          osNumero,
          observacoes,
          finalizadaEm,
          assinaturaUrl,
          qtdNc,
          answers: normalizedAnswers,
        };
        setInspection(detail);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error && err.message ? err.message : "Falha ao carregar inspeção";
        setError(message);
        setInspection(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInspection();
    return () => {
      cancelled = true;
    };
  }, [idParam]);

  const machineTitle = useMemo(() => {
    if (!inspection) return "";
    return inspection.machineNome ?? inspection.machineTag ?? "Máquina";
  }, [inspection]);

  const answersWithPhotos = inspection?.answers.filter(answer => answer.photoUrls.length > 0) ?? [];

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  if (!idParam) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Informe um identificador válido para visualizar a inspeção.
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">Carregando inspeção...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Voltar
          </button>
        </div>
      </main>
    );
  }

  if (!inspection) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">Inspeção não encontrada.</div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">{machineTitle}</h1>
        <p className="text-sm text-gray-600">TAG: {inspection.machineTag ?? "-"}</p>
        <div className="flex flex-wrap gap-2 text-sm text-gray-600">
          <span>Setor: {inspection.machineSetor ?? "-"}</span>
          <span>Unidade: {inspection.machineUnidade ?? "-"}</span>
          <span>Concluída em: {formatDate(inspection.finalizadaEm)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Voltar
          </button>
          <a
            href={`/api/inspecoes/${inspection.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-md border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
          >
            Gerar PDF
          </a>
        </div>
      </header>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Resumo</h2>
        <p className="text-sm text-gray-700">
          Nº da O.S.: <span className="font-medium text-gray-900">{inspection.osNumero ?? "-"}</span>
        </p>
        <p className="text-sm text-gray-700">
          Observações gerais: {inspection.observacoes ? inspection.observacoes : <span className="text-gray-500">Nenhuma observação registrada.</span>}
        </p>
        <p className="text-sm text-gray-700">NC registradas: {inspection.qtdNc > 0 ? inspection.qtdNc : "Nenhuma"}</p>
        <p className="text-sm text-gray-700">
          Assinatura: {inspection.assinaturaUrl ? <a href={inspection.assinaturaUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Visualizar imagem</a> : "Não registrada"}
        </p>
      </section>

      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Respostas do checklist</h2>
          <span className="text-sm text-gray-500">{inspection.answers.length} itens respondidos</span>
        </div>
        <div className="space-y-4">
          {inspection.answers.map(answer => {
            const tone = responseLabel(answer.response);
            return (
              <article key={answer.questionId} className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{answer.questionText ?? "Item do checklist"}</h3>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone.className}`}>{tone.label}</span>
                </div>
                {answer.observation && (
                  <p className="text-sm text-gray-700">
                    Observação: <span className="font-medium text-gray-800">{answer.observation}</span>
                  </p>
                )}
                {answer.itemOsNumero?.trim() && (
                  <p className="text-xs text-gray-600">
                    Nº da O.S. do item: <span className="font-medium text-gray-800">{answer.itemOsNumero}</span>
                  </p>
                )}
                {answer.photoUrls.length > 0 && (
                  <div className="space-y-1 text-sm text-gray-700">
                    <p className="font-medium">Fotos anexadas:</p>
                    <ul className="list-inside list-disc space-y-1">
                      {answer.photoUrls.map((url, index) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            Ver foto {index + 1}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {answersWithPhotos.length === 0 ? null : (
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Itens com fotos anexadas</h2>
          <p className="text-sm text-gray-600">Este resumo destaca os itens que possuem evidências fotográficas.</p>
          <ul className="space-y-2 text-sm text-gray-700">
            {answersWithPhotos.map(answer => (
              <li key={answer.questionId} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="font-medium text-gray-900">{answer.questionText ?? "Item do checklist"}</p>
                <p className="text-xs text-gray-500">{answer.photoUrls.length} foto(s) anexada(s)</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

