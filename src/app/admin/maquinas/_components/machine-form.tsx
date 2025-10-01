"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { machineSchema, MachineInput } from "@/lib/machines-schema";

export type MachineFormValues = MachineInput;

export type TemplateOption = {
  id: string;
  nome: string;
};

type MachineFormProps = {
  initialValues: MachineFormValues;
  templates: TemplateOption[];
  onSubmit: (values: MachineFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  submitLabel?: string;
  title: string;
};

function extractMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function MachineForm({ initialValues, templates, onSubmit, onDelete, submitLabel = "Salvar", title }: MachineFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MachineFormValues>({
    resolver: zodResolver(machineSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  const fotoUrl = watch("fotoUrl");
  const templateId = watch("templateId");

  const templateName = useMemo(() => {
    return templates.find(template => template.id === templateId)?.nome ?? "";
  }, [templates, templateId]);

  async function uploadPhoto(file: File) {
    setIsUploading(true);
    setFormError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/uploads/machine-image", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Falha no upload da foto");
      }
      setValue("fotoUrl", payload.url, { shouldDirty: true, shouldValidate: true });
    } catch (err: unknown) {
      setFormError(extractMessage(err, "Erro ao enviar foto"));
    } finally {
      setIsUploading(false);
    }
  }

  async function submit(values: MachineFormValues) {
    setIsSubmitting(true);
    setFormError(null);
    try {
      await onSubmit({
        ...values,
        fotoUrl: values.fotoUrl || undefined,
      });
    } catch (err: unknown) {
      setFormError(extractMessage(err, "Erro ao salvar maquina"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <form onSubmit={handleSubmit(submit)} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="font-medium">TAG</label>
            <input className="border rounded p-2 w-full" placeholder="Ex: MX-001" {...register("tag")} />
            {errors.tag && <p className="text-sm text-red-600">{errors.tag.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="font-medium">Nome</label>
            <input className="border rounded p-2 w-full" placeholder="Nome da maquina" {...register("nome")} />
            {errors.nome && <p className="text-sm text-red-600">{errors.nome.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="font-medium">Setor</label>
            <input className="border rounded p-2 w-full" {...register("setor")} />
            {errors.setor && <p className="text-sm text-red-600">{errors.setor.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="font-medium">Unidade</label>
            <input className="border rounded p-2 w-full" {...register("unidade")} />
            {errors.unidade && <p className="text-sm text-red-600">{errors.unidade.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="font-medium">Local na unidade</label>
            <input className="border rounded p-2 w-full" {...register("localUnidade")} />
            {errors.localUnidade && <p className="text-sm text-red-600">{errors.localUnidade.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="font-medium">LAC</label>
            <input className="border rounded p-2 w-full" placeholder="012" {...register("lac")} />
            {errors.lac && <p className="text-sm text-red-600">{errors.lac.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <label className="font-medium">Template</label>
          <select className="border rounded p-2 w-full" {...register("templateId")}
            defaultValue={initialValues.templateId}
          >
            <option value="">Selecione um template</option>
            {templates.map(template => (
              <option key={template.id} value={template.id}>
                {template.nome}
              </option>
            ))}
          </select>
          {errors.templateId && <p className="text-sm text-red-600">{errors.templateId.message}</p>}
          {templateName && <p className="text-sm text-gray-600">Template selecionado: {templateName}</p>}
        </div>

        <div className="space-y-2">
          <label className="font-medium">Foto (opcional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) uploadPhoto(file);
            }}
          />
          {isUploading && <p className="text-sm text-gray-600">Enviando foto...</p>}
          {fotoUrl && (
            <div className="mt-2 space-y-2">
              <Image
                src={fotoUrl}
                alt="Foto da maquina"
                width={320}
                height={240}
                className="max-h-48 rounded border w-auto"
                unoptimized
              />
              <button
                type="button"
                className="text-sm text-red-600 underline"
                onClick={() => setValue("fotoUrl", undefined, { shouldDirty: true, shouldValidate: true })}
              >
                Remover foto
              </button>
            </div>
          )}
          {errors.fotoUrl && <p className="text-sm text-red-600">{errors.fotoUrl.message}</p>}
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <input type="checkbox" {...register("ativo")} /> Ativa
          </label>
          {errors.ativo && <p className="text-sm text-red-600">{errors.ativo.message}</p>}
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}
      </form>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white p-4">
        <div className="max-w-3xl mx-auto flex justify-between gap-4">
          {onDelete ? (
            <button
              type="button"
              className="rounded border border-red-600 text-red-600 px-4 py-2"
              onClick={onDelete}
              disabled={isSubmitting}
            >
              Excluir maquina
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="rounded bg-black text-white px-6 py-2 disabled:opacity-50"
            onClick={handleSubmit(submit)}
            disabled={isSubmitting || isUploading}
          >
            {isSubmitting || isUploading ? "Salvando..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
