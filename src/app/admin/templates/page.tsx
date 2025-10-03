"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [search, setSearch] = useState("");

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
    const formatted = templates.map(template => ({
      ...template,
      itensCount: Array.isArray(template.itens) ? template.itens.length : 0,
      createdAtLabel: template.createdAt ? new Date(template.createdAt).toLocaleString("pt-BR") : "-",
    }));

    if (!search.trim()) return formatted;
    const term = search.trim().toLowerCase();
    return formatted.filter(template => template.nome.toLowerCase().includes(term));
  }, [search, templates]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[var(--text)]">Templates de checklist</h1>
          <p className="text-sm text-[var(--muted)]">Organize os modelos que serão usados nas inspeções.</p>
        </div>
        <Link
          href="/admin/templates/new"
          className={buttonStyles()}
        >
          <i className="fas fa-plus" aria-hidden />
          Novo template
        </Link>
      </header>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Erro ao carregar</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Templates cadastrados</CardTitle>
              <CardDescription>Filtre pelo nome para encontrar rapidamente um checklist.</CardDescription>
            </div>
            <div className="w-full sm:max-w-xs">
              <Input
                placeholder="Buscar template"
                value={search}
                onChange={event => setSearch(event.target.value)}
                aria-label="Buscar template"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                title="Nenhum template encontrado"
                description={
                  search
                    ? "Ajuste a busca ou limpe o filtro para visualizar todos os templates."
                    : "Cadastre um template para começar a montar checklists."
                }
                icon={<i className="fas fa-clipboard-list" aria-hidden />}
              />
            ) : (
              <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {items.map(template => (
                  <Link
                    key={template.id}
                    href={`/admin/templates/${template.id}`}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--surface-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-[var(--text)]">{template.nome}</p>
                        <p className="text-xs text-[var(--muted)]">Criado em {template.createdAtLabel}</p>
                      </div>
                      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                        <i className="fas fa-check-double" aria-hidden />
                        {template.itensCount} {template.itensCount === 1 ? "item" : "itens"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
