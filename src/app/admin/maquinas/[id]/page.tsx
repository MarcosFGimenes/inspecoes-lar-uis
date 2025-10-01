"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import MachineForm, { MachineFormValues, TemplateOption } from "../_components/machine-form";

interface MachineResponse {
  id: string;
  tag: string;
  nome: string;
  setor: string;
  unidade: string;
  localUnidade: string;
  lac: string;
  fotoUrl?: string | null;
  templateId: string;
  ativo: boolean;
}

function extractMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function EditMachinePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const machineId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<MachineFormValues | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);

  useEffect(() => {
    if (!machineId) return;
    let cancelled = false;

    async function load() {
      try {
        const session = await fetch("/api/admin-session", { cache: "no-store" });
        if (session.status === 401) {
          window.location.href = "/admin/login";
          return;
        }

        const [machineRes, templatesRes] = await Promise.all([
          fetch(`/api/maquinas/${machineId}`, { cache: "no-store" }),
          fetch("/api/templates", { cache: "no-store" }),
        ]);

        if (machineRes.status === 404) {
          throw new Error("Maquina nao encontrada");
        }
        if (!machineRes.ok) {
          let payload: { error?: string } | null = null;
          try {
            payload = (await machineRes.json()) as { error?: string };
          } catch {}
          throw new Error(payload?.error || "Falha ao carregar maquina");
        }
        if (!templatesRes.ok) {
          const payload = await templatesRes.json().catch(() => null);
          throw new Error(payload?.error || "Falha ao carregar templates");
        }

        const machineData = (await machineRes.json()) as MachineResponse;
        const templatesData = (await templatesRes.json()) as { id: string; nome: string }[];

        if (cancelled) return;

        setTemplates(templatesData.map(item => ({ id: item.id, nome: item.nome })));
        setInitialValues({
          tag: machineData.tag,
          nome: machineData.nome,
          setor: machineData.setor,
          unidade: machineData.unidade,
          localUnidade: machineData.localUnidade,
          lac: machineData.lac,
          fotoUrl: machineData.fotoUrl ?? undefined,
          templateId: machineData.templateId,
          ativo: machineData.ativo,
        });
      } catch (err: unknown) {
        if (!cancelled) setError(extractMessage(err, "Erro ao carregar maquina"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [machineId]);

  async function handleSubmit(values: MachineFormValues) {
    if (!machineId) return;
    const response = await fetch(`/api/maquinas/${machineId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (response.status === 409) {
      throw new Error("TAG ja cadastrada");
    }
    if (!response.ok) {
      let payload: { error?: string } | null = null;
      try {
        payload = (await response.json()) as { error?: string };
      } catch {}
      throw new Error(payload?.error || "Erro ao salvar maquina");
    }
    router.push("/admin/maquinas");
  }

  async function handleDelete() {
    if (!machineId) return;
    const confirmed = window.confirm("Tem certeza que deseja excluir esta maquina?");
    if (!confirmed) return;
    const response = await fetch(`/api/maquinas/${machineId}`, { method: "DELETE" });
    if (!response.ok) {
      let payload: { error?: string } | null = null;
      try {
        payload = (await response.json()) as { error?: string };
      } catch {}
      throw new Error(payload?.error || "Erro ao excluir maquina");
    }
    router.push("/admin/maquinas");
  }

  if (loading) {
    return <div className="max-w-3xl mx-auto p-4">Carregando...</div>;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <p className="text-red-600">{error}</p>
        <button
          type="button"
          className="text-blue-600 underline"
          onClick={() => router.push("/admin/maquinas")}
        >
          Voltar para maquinas
        </button>
      </div>
    );
  }

  if (!initialValues) {
    return null;
  }

  return (
    <MachineForm
      title="Editar maquina"
      initialValues={initialValues}
      templates={templates}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
      submitLabel="Salvar alteracoes"
    />
  );
}
