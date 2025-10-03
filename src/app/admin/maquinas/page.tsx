"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface MachineListItem {
  id: string;
  tag: string;
  nome: string;
  setor?: string;
  unidade?: string;
  templateId?: string;
  ativo?: boolean;
  createdAt?: string;
}

interface TemplateSummary {
  id: string;
  nome: string;
}

function buildTemplateMap(templates: TemplateSummary[]) {
  const map = new Map<string, string>();
  templates.forEach(template => {
    map.set(template.id, template.nome);
  });
  return map;
}

export default function MachinesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [machines, setMachines] = useState<MachineListItem[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const session = await fetch("/api/admin-session", { cache: "no-store" });
        if (session.status === 401) {
          window.location.href = "/admin/login";
          return;
        }

        const [machinesRes, templatesRes] = await Promise.all([
          fetch("/api/maquinas", { cache: "no-store" }),
          fetch("/api/templates", { cache: "no-store" }),
        ]);

        if (!machinesRes.ok) {
          const payload = await machinesRes.json().catch(() => null);
          throw new Error(payload?.error || "Falha ao carregar máquinas");
        }
        if (!templatesRes.ok) {
          const payload = await templatesRes.json().catch(() => null);
          throw new Error(payload?.error || "Falha ao carregar templates");
        }

        const machinesData = (await machinesRes.json()) as MachineListItem[];
        const templatesData = (await templatesRes.json()) as TemplateSummary[];

        if (!cancelled) {
          setMachines(Array.isArray(machinesData) ? machinesData : []);
          setTemplates(Array.isArray(templatesData) ? templatesData : []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Erro desconhecido";
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const templateMap = useMemo(() => buildTemplateMap(templates), [templates]);

  const filtered = useMemo(() => {
    if (!query.trim()) return machines;
    const term = query.trim().toLowerCase();
    return machines.filter(machine => {
      const tag = machine.tag?.toLowerCase() ?? "";
      const nome = machine.nome?.toLowerCase() ?? "";
      return tag.includes(term) || nome.includes(term);
    });
  }, [machines, query]);

  const content = () => {
    if (loading) {
      return (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <EmptyState
          title="Nenhuma máquina encontrada"
          description={
            query
              ? "Tente alterar os termos da busca para localizar o equipamento."
              : "Cadastre uma máquina para vincular templates e inspeções."
          }
          icon={<i className="fas fa-tractor" aria-hidden />}
        />
      );
    }

    return (
      <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {filtered.map(machine => {
          const templateLabel = machine.templateId ? templateMap.get(machine.templateId) ?? "-" : "-";
          const createdLabel = machine.createdAt ? new Date(machine.createdAt).toLocaleString("pt-BR") : "-";
          return (
            <Link
              key={machine.id}
              href={`/admin/maquinas/${machine.id}`}
              className="flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--surface-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-semibold text-[var(--text)]">{machine.tag} — {machine.nome}</p>
                  <p className="text-xs text-[var(--muted)]">Template: {templateLabel}</p>
                  <p className="text-xs text-[var(--muted)]">Criada em {createdLabel}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                    machine.ativo
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {machine.ativo ? "Ativa" : "Inativa"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[var(--text)]">Máquinas</h1>
          <p className="text-sm text-[var(--muted)]">Gerencie os equipamentos vinculados aos checklists.</p>
        </div>
        <Link href="/admin/maquinas/new" className={buttonStyles()}>
          <i className="fas fa-plus" aria-hidden />
          Nova máquina
        </Link>
      </header>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Erro ao carregar dados</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Lista de máquinas</CardTitle>
              <CardDescription>Busque por TAG ou nome para encontrar um ativo específico.</CardDescription>
            </div>
            <div className="w-full sm:max-w-xs">
              <Input
                placeholder="Buscar por TAG ou nome"
                value={query}
                onChange={event => setQuery(event.target.value)}
                aria-label="Buscar máquina"
              />
            </div>
          </CardHeader>
          <CardContent>{content()}</CardContent>
        </Card>
      )}
    </div>
  );
}
