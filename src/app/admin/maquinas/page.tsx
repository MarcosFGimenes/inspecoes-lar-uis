"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
          throw new Error(payload?.error || "Falha ao carregar maquinas");
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
    if (!query) return machines;
    const term = query.trim().toLowerCase();
    return machines.filter(machine => {
      const tag = machine.tag?.toLowerCase() ?? "";
      const nome = machine.nome?.toLowerCase() ?? "";
      return tag.includes(term) || nome.includes(term);
    });
  }, [machines, query]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <header className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Maquinas</h1>
          <Link href="/admin/maquinas/new" className="rounded bg-black text-white px-4 py-2">
            Nova maquina
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
          <h1 className="text-2xl font-bold">Maquinas</h1>
          <Link href="/admin/maquinas/new" className="rounded bg-black text-white px-4 py-2">
            Nova maquina
          </Link>
        </header>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">Maquinas</h1>
        <Link href="/admin/maquinas/new" className="rounded bg-black text-white px-4 py-2">
          Nova maquina
        </Link>
      </header>

      <input
        className="border rounded p-2 w-full"
        placeholder="Buscar por TAG ou nome"
        value={query}
        onChange={event => setQuery(event.target.value)}
      />

      {filtered.length === 0 ? (
        <p className="text-gray-600">Nenhuma maquina encontrada.</p>
      ) : (
        <div className="border rounded divide-y">
          {filtered.map(machine => {
            const templateLabel = machine.templateId ? templateMap.get(machine.templateId) ?? "-" : "-";
            const createdLabel = machine.createdAt
              ? new Date(machine.createdAt).toLocaleString("pt-BR")
              : "-";
            return (
              <Link
                key={machine.id}
                href={`/admin/maquinas/${machine.id}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 hover:bg-gray-50"
              >
                <div className="space-y-1">
                  <p className="font-semibold">{machine.tag} - {machine.nome}</p>
                  <p className="text-sm text-gray-600">Template: {templateLabel}</p>
                  <p className="text-xs text-gray-500">Criado em {createdLabel}</p>
                </div>
                <span className="text-sm text-gray-700">{machine.ativo ? "Ativa" : "Inativa"}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
