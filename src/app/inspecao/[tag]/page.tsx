"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

interface MachineSnapshot {
  machineId: string;
  tag: string | null;
  nome: string | null;
  setor: string | null;
  unidade: string | null;
  localUnidade: string | null;
  fotoUrl: string | null;
  templateId: string;
}

interface TemplateItem {
  id?: string;
  componente?: string;
  oQueChecar?: string;
  instrumento?: string;
  criterio?: string;
  oQueFazer?: string;
  imagemItemUrl?: string | null;
  ordem?: number;
}

interface TemplateRecord {
  id: string;
  nome?: string;
  imagemUrl?: string | null;
  itens?: TemplateItem[];
}

interface InspectionContextResponse {
  machine: MachineSnapshot;
  template: TemplateRecord;
  issues: unknown[];
}

export default function InspectionPage() {
  const params = useParams<{ tag: string }>();
  const tagParam = params?.tag;
  const tag = useMemo(() => {
    if (!tagParam) return "";
    return Array.isArray(tagParam) ? tagParam[0] ?? "" : tagParam;
  }, [tagParam]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<InspectionContextResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!tag) return;
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
          if (!cancelled) {
            setError(message);
            setContext(null);
          }
          return;
        }

        const data = (await response.json()) as InspectionContextResponse;
        if (!cancelled) {
          setContext(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error && err.message
              ? err.message
              : "Falha ao carregar dados da inspeção.";
          setError(message);
          setContext(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [tag]);

  if (!tag) {
    return (
      <main className="max-w-4xl mx-auto p-4">
        <p className="text-red-600">TAG inválida.</p>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Inspeção — {tag.toUpperCase()}</h1>
        {loading && <p>Carregando dados da máquina...</p>}
        {error && !loading && <p className="text-red-600">{error}</p>}
      </header>

      {context && !loading && !error && (
        <div className="space-y-8">
          <section className="rounded-lg border bg-white shadow-sm">
            <div className="p-6 space-y-4">
              <div className="flex flex-col gap-6 md:flex-row md:items-start">
                <div className="flex-1 space-y-2">
                  <h2 className="text-2xl font-semibold">{context.machine.nome ?? "Máquina"}</h2>
                  <div className="text-gray-600 space-y-1">
                    <p>
                      <span className="font-medium">TAG:</span> {context.machine.tag ?? "-"}
                    </p>
                    <p>
                      <span className="font-medium">Setor:</span> {context.machine.setor ?? "-"}
                    </p>
                    <p>
                      <span className="font-medium">Unidade:</span> {context.machine.unidade ?? "-"}
                    </p>
                    <p>
                      <span className="font-medium">Local na unidade:</span> {context.machine.localUnidade ?? "-"}
                    </p>
                  </div>
                </div>
                {context.machine.fotoUrl ? (
                  <div className="relative h-40 w-40 overflow-hidden rounded-lg border bg-gray-50">
                    <Image
                      src={context.machine.fotoUrl}
                      alt={`Foto da máquina ${context.machine.nome ?? context.machine.tag}`}
                      fill
                      sizes="160px"
                      className="object-cover"
                    />
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled
                  className="rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-600 cursor-not-allowed"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  disabled
                  className="rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-600 cursor-not-allowed"
                >
                  Salvar e Nova
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold">Itens do template</h2>
              <p className="text-sm text-gray-600">
                Template: {context.template.nome ?? "Sem nome"}
              </p>
            </div>
            <div className="space-y-4">
              {Array.isArray(context.template.itens) && context.template.itens.length > 0 ? (
                context.template.itens
                  .slice()
                  .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
                  .map(item => (
                    <article key={item.id ?? `${item.componente}-${item.ordem}`}
                      className="rounded-lg border bg-white p-4 shadow-sm space-y-3"
                    >
                      <header className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
                        <h3 className="text-lg font-semibold">
                          {item.ordem ? `${item.ordem}. ` : ""}
                          {item.componente ?? "Item sem nome"}
                        </h3>
                        {item.instrumento && (
                          <span className="text-sm text-gray-500">
                            Instrumento: {item.instrumento}
                          </span>
                        )}
                      </header>
                      {item.oQueChecar && (
                        <p>
                          <span className="font-medium">O que checar:</span> {item.oQueChecar}
                        </p>
                      )}
                      {item.criterio && (
                        <p>
                          <span className="font-medium">Critério:</span> {item.criterio}
                        </p>
                      )}
                      {item.oQueFazer && (
                        <p>
                          <span className="font-medium">O que fazer:</span> {item.oQueFazer}
                        </p>
                      )}
                      {item.imagemItemUrl && (
                        <div className="relative mt-2 h-48 w-full overflow-hidden rounded-md border bg-gray-50">
                          <Image
                            src={item.imagemItemUrl}
                            alt={`Imagem do item ${item.componente ?? item.ordem ?? ""}`}
                            fill
                            sizes="(min-width: 768px) 480px, 100vw"
                            className="object-cover"
                          />
                        </div>
                      )}
                    </article>
                  ))
              ) : (
                <p className="text-gray-600">Nenhum item configurado para este template.</p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-2xl font-semibold">Avarias em aberto</h2>
            {Array.isArray(context.issues) && context.issues.length > 0 ? (
              <ul className="list-disc space-y-2 pl-5 text-gray-700">
                {context.issues.map((issue, index) => (
                  <li key={index}>Issue #{index + 1}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-600">Nenhuma avaria em aberto para esta TAG.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
