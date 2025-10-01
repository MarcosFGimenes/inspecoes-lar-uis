"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MachineForm, { MachineFormValues, TemplateOption } from "../_components/machine-form";

const defaultValues: MachineFormValues = {
  tag: "",
  nome: "",
  setor: "",
  unidade: "",
  localUnidade: "",
  lac: "",
  fotoUrl: undefined,
  templateId: "",
  ativo: true,
};

export default function NewMachinePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
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

        const templatesRes = await fetch("/api/templates", { cache: "no-store" });
        if (!templatesRes.ok) {
          const payload = await templatesRes.json().catch(() => null);
          throw new Error(payload?.error || "Falha ao carregar templates");
        }
        const templatesData = (await templatesRes.json()) as { id: string; nome: string }[];
        if (!cancelled) {
          setTemplates(templatesData.map(item => ({ id: item.id, nome: item.nome })));
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

  async function handleSubmit(values: MachineFormValues) {
    const response = await fetch("/api/maquinas", {
      method: "POST",
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

  if (loading) {
    return <div className="max-w-3xl mx-auto p-4">Carregando...</div>;
  }

  if (error) {
    return <div className="max-w-3xl mx-auto p-4 text-red-600">{error}</div>;
  }

  return (
    <MachineForm
      title="Nova maquina"
      initialValues={defaultValues}
      templates={templates}
      onSubmit={handleSubmit}
      submitLabel="Criar maquina"
    />
  );
}
