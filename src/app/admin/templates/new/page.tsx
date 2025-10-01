"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TemplateForm, { TemplateFormValues } from "../_components/template-form";
import { createTemplateItem } from "@/lib/template-utils";

export default function NewTemplatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [initialValues] = useState<TemplateFormValues>(() => ({
    nome: "",
    imagemUrl: undefined,
    itens: [createTemplateItem(1)],
  }));

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      const res = await fetch("/api/admin-session", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!cancelled) setLoading(false);
    }
    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(values: TemplateFormValues) {
    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Erro ao salvar template");
    }
    router.push("/admin/templates");
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto p-4">Carregando...</div>;
  }

  return (
    <TemplateForm
      title="Novo template"
      initialValues={initialValues}
      onSubmit={handleSubmit}
      submitLabel="Criar template"
    />
  );
}
