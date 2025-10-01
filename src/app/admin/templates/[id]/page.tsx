"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TemplateForm, { TemplateFormValues } from "../_components/template-form";
import { normalizeTemplateItems, TemplateItemFormData } from "@/lib/template-utils";

interface TemplateResponse {
  id: string;
  nome: string;
  imagemUrl?: string | null;
  itens?: TemplateItemFormData[] | null;
  createdAt?: string;
}

function extractMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function EditTemplatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const templateId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<TemplateFormValues | null>(null);

  useEffect(() => {
    if (!templateId) return;

    let cancelled = false;
    async function load() {
      try {
        const session = await fetch("/api/admin-session", { cache: "no-store" });
        if (session.status === 401) {
          window.location.href = "/admin/login";
          return;
        }

        const res = await fetch(`/api/templates/${templateId}`, { cache: "no-store" });
        if (res.status === 404) {
          throw new Error("Template nao encontrado");
        }
        if (!res.ok) {
          let payload: { error?: string } | null = null;
          try {
            payload = (await res.json()) as { error?: string };
          } catch {}
          throw new Error(payload?.error || "Falha ao carregar template");
        }

        const data = (await res.json()) as TemplateResponse;
        if (cancelled) return;

        setInitialValues({
          nome: data.nome || "",
          imagemUrl: data.imagemUrl || undefined,
          itens: normalizeTemplateItems(data.itens || []),
        });
      } catch (err: unknown) {
        if (!cancelled) setError(extractMessage(err, "Erro ao carregar template"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  async function handleSubmit(values: TemplateFormValues) {
    if (!templateId) return;
    const response = await fetch(`/api/templates/${templateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      let payload: { error?: string } | null = null;
      try {
        payload = (await response.json()) as { error?: string };
      } catch {}
      throw new Error(payload?.error || "Erro ao atualizar template");
    }
    router.push("/admin/templates");
  }

  async function handleDelete() {
    if (!templateId) return;
    const confirmed = window.confirm("Tem certeza que deseja excluir este template?");
    if (!confirmed) return;
    const response = await fetch(`/api/templates/${templateId}`, { method: "DELETE" });
    if (!response.ok) {
      let payload: { error?: string } | null = null;
      try {
        payload = (await response.json()) as { error?: string };
      } catch {}
      throw new Error(payload?.error || "Erro ao excluir template");
    }
    router.push("/admin/templates");
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto p-4">Carregando...</div>;
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <p className="text-red-600">{error}</p>
        <button
          type="button"
          className="text-blue-600 underline"
          onClick={() => router.push("/admin/templates")}
        >
          Voltar para templates
        </button>
      </div>
    );
  }

  if (!initialValues) {
    return null;
  }

  return (
    <TemplateForm
      title="Editar template"
      initialValues={initialValues}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
      submitLabel="Salvar alteracoes"
    />
  );
}
