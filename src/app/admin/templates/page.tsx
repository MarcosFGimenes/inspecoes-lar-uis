"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface TemplateSummary {
  id: string;
  nome: string;
  createdAt: string;
  imagemUrl?: string | null;
  itens?: { id: string }[];
}

function extractMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function TemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const session = await fetch("/api/admin-session", { cache: "no-store" });
        if (session.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        const res = await fetch("/api/templates", { cache: "no-store" });
        if (!res.ok) {
          let payload: { error?: string } | null = null;
          try {
            payload = (await res.json()) as { error?: string };
          } catch {}
          throw new Error(payload?.error || "Falha ao carregar templates");
        }
        const data = (await res.json()) as TemplateSummary[];
        if (!cancelled) {
          setTemplates(Array.isArray(data) ? data : []);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(extractMessage(err, "Erro desconhecido"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => {
    return templates.map(template => ({
      ...template,
      itensCount: Array.isArray(template.itens) ? template.itens.length : 0,
      createdAtLabel: template.createdAt ? new Date(template.createdAt).toLocaleString("pt-BR") : "-",
    }));
  }, [templates]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <header className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Templates</h1>
          <Link href="/admin/templates/new" className="rounded bg-black text-white px-4 py-2">
            Novo template
          </Link>
        </header>
        <p>Carregando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <header className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Templates</h1>
          <Link href="/admin/templates/new" className="rounded bg-black text-white px-4 py-2">
            Novo template
          </Link>
        </header>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Templates</h1>
        <Link href="/admin/templates/new" className="rounded bg-black text-white px-4 py-2">
          Novo template
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="text-gray-600">Nenhum template cadastrado ainda.</p>
      ) : (
        <div className="border rounded divide-y">
          {items.map(template => (
            <Link
              key={template.id}
              href={`/admin/templates/${template.id}`}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 hover:bg-gray-50"
            >
              <div>
                <p className="font-semibold">{template.nome}</p>
                <p className="text-sm text-gray-600">Criado em {template.createdAtLabel}</p>
              </div>
              <div className="text-sm text-gray-700">
                {template.itensCount} {template.itensCount === 1 ? "item" : "itens"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
