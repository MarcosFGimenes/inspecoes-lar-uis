"use client";

import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { templateSchema, TemplateInput } from "@/lib/templates-schema";
import { createTemplateItem, TemplateItemFormData } from "@/lib/template-utils";

export type TemplateFormValues = TemplateInput & {
  itens: TemplateItemFormData[];
};

type TemplateFormProps = {
  initialValues: TemplateFormValues;
  onSubmit: (values: TemplateFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  submitLabel?: string;
  title: string;
};

export default function TemplateForm({ initialValues, onSubmit, onDelete, submitLabel = "Salvar", title }: TemplateFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingMain, setUploadingMain] = useState(false);
  const [itemUploads, setItemUploads] = useState<Record<string, boolean>>({});

  const {
    control,
    handleSubmit,
    register,
    setValue,
    getValues,
    reset,
    watch,
    formState: { errors },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: initialValues,
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "itens",
    keyName: "fieldId",
  });

  useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  const imagemUrl = watch("imagemUrl");
  const itensWatch = watch("itens");

  const isUploadingItem = useMemo(() => Object.values(itemUploads).some(Boolean), [itemUploads]);

  function syncOrders() {
    const items = getValues("itens");
    items.forEach((_, idx) => {
      setValue(`itens.${idx}.ordem`, idx + 1, { shouldDirty: true });
    });
  }

  function handleAddItem() {
    append(createTemplateItem(fields.length + 1));
    setTimeout(() => syncOrders(), 0);
  }

  function handleRemoveItem(index: number, id?: string) {
    if (fields.length <= 1) return;
    remove(index);
    setItemUploads(current => {
      if (!id) return current;
      const clone = { ...current };
      delete clone[id];
      return clone;
    });
    setTimeout(() => syncOrders(), 0);
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    move(index, index - 1);
    setTimeout(() => syncOrders(), 0);
  }

  function handleMoveDown(index: number) {
    if (index === fields.length - 1) return;
    move(index, index + 1);
    setTimeout(() => syncOrders(), 0);
  }

  async function uploadMainImage(file: File) {
    setUploadingMain(true);
    setFormError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/uploads/template-image", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Falha no upload da imagem");
      }
      setValue("imagemUrl", payload.url, { shouldDirty: true });
    } catch (err: any) {
      setFormError(err?.message || "Erro ao enviar imagem");
    } finally {
      setUploadingMain(false);
    }
  }

  async function uploadItemImage(file: File, itemId: string, index: number) {
    setItemUploads(current => ({ ...current, [itemId]: true }));
    setFormError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/uploads/template-item-image", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Falha no upload da imagem do item");
      }
      setValue(`itens.${index}.imagemItemUrl`, payload.url, { shouldDirty: true });
    } catch (err: any) {
      setFormError(err?.message || "Erro ao enviar imagem do item");
    } finally {
      setItemUploads(current => ({ ...current, [itemId]: false }));
    }
  }

  async function submit(values: TemplateFormValues) {
    setIsSubmitting(true);
    setFormError(null);
    const payload: TemplateFormValues = {
      ...values,
      imagemUrl: values.imagemUrl || undefined,
      itens: values.itens.map((item, index) => ({
        ...item,
        id: item.id,
        ordem: index + 1,
        createdAt: item.createdAt || new Date().toISOString(),
        imagemItemUrl: item.imagemItemUrl || undefined,
      })),
    };
    try {
      await onSubmit(payload);
    } catch (err: any) {
      setFormError(err?.message || "Erro ao salvar template");
    } finally {
      setIsSubmitting(false);
    }
  }

  const disableSubmit = isSubmitting || uploadingMain || isUploadingItem;

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <form onSubmit={handleSubmit(submit)} className="space-y-6">
        <div className="space-y-2">
          <label className="font-medium">Nome do template</label>
          <input
            className="border rounded p-2 w-full"
            placeholder="Ex: Inspeção semanal de máquinas"
            {...register("nome")}
          />
          {errors.nome && <p className="text-sm text-red-600">{errors.nome.message}</p>}
        </div>

        <div className="space-y-2">
          <label className="font-medium">Imagem principal (opcional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) uploadMainImage(file);
            }}
          />
          {uploadingMain && <p className="text-sm text-gray-600">Enviando imagem...</p>}
          {imagemUrl && (
            <div className="mt-2 space-y-2">
              <img src={imagemUrl} alt="Imagem do template" className="max-h-48 rounded border" />
              <button
                type="button"
                className="text-sm text-red-600 underline"
                onClick={() => setValue("imagemUrl", undefined, { shouldDirty: true })}
              >
                Remover imagem
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Itens ({itensWatch?.length || 0})</h2>
            <button
              type="button"
              className="rounded bg-black text-white px-4 py-2"
              onClick={handleAddItem}
            >
              Adicionar item
            </button>
          </div>

          {errors.itens && typeof errors.itens.message === "string" && (
            <p className="text-sm text-red-600">{errors.itens.message}</p>
          )}

          <div className="space-y-4">
            {fields.map((field, index) => {
              const itemErrors = errors.itens?.[index];
              const currentItem = itensWatch?.[index];
              const itemId = currentItem?.id || field.id;
              const uploading = itemId ? itemUploads[itemId] || false : false;
              const itemImagemUrl = currentItem?.imagemItemUrl;
              return (
                <div key={field.fieldId} className="border rounded p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Item {index + 1}</h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-sm px-2 py-1 border rounded"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                      >
                        ?
                      </button>
                      <button
                        type="button"
                        className="text-sm px-2 py-1 border rounded"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === fields.length - 1}
                      >
                        ?
                      </button>
                      <button
                        type="button"
                        className="text-sm px-2 py-1 border rounded text-red-600"
                        onClick={() => handleRemoveItem(index, itemId)}
                        disabled={fields.length <= 1}
                      >
                        Remover
                      </button>
                    </div>
                  </div>

                  <input type="hidden" {...register(`itens.${index}.id`)} />
                  <input type="hidden" {...register(`itens.${index}.ordem`)} />
                  <input type="hidden" {...register(`itens.${index}.createdAt`)} />

                  <div className="space-y-2">
                    <label className="font-medium">Componente</label>
                    <input
                      className="border rounded p-2 w-full"
                      {...register(`itens.${index}.componente`)}
                    />
                    {itemErrors?.componente && (
                      <p className="text-sm text-red-600">{itemErrors.componente.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="font-medium">O que checar?</label>
                    <textarea
                      className="border rounded p-2 w-full"
                      rows={3}
                      {...register(`itens.${index}.oQueChecar`)}
                    />
                    {itemErrors?.oQueChecar && (
                      <p className="text-sm text-red-600">{itemErrors.oQueChecar.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="font-medium">Instrumento</label>
                    <input
                      className="border rounded p-2 w-full"
                      {...register(`itens.${index}.instrumento`)}
                    />
                    {itemErrors?.instrumento && (
                      <p className="text-sm text-red-600">{itemErrors.instrumento.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="font-medium">Critério</label>
                    <textarea
                      className="border rounded p-2 w-full"
                      rows={3}
                      {...register(`itens.${index}.criterio`)}
                    />
                    {itemErrors?.criterio && (
                      <p className="text-sm text-red-600">{itemErrors.criterio.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="font-medium">O que fazer?</label>
                    <textarea
                      className="border rounded p-2 w-full"
                      rows={3}
                      {...register(`itens.${index}.oQueFazer`)}
                    />
                    {itemErrors?.oQueFazer && (
                      <p className="text-sm text-red-600">{itemErrors.oQueFazer.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="font-medium">Imagem do item (opcional)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        if (file && itemId) uploadItemImage(file, itemId, index);
                      }}
                    />
                    {uploading && <p className="text-sm text-gray-600">Enviando imagem...</p>}
                    {itemImagemUrl && (
                      <div className="mt-2 space-y-2">
                        <img src={itemImagemUrl} alt="Imagem do item" className="max-h-48 rounded border" />
                        <button
                          type="button"
                          className="text-sm text-red-600 underline"
                          onClick={() => setValue(`itens.${index}.imagemItemUrl`, undefined, { shouldDirty: true })}
                        >
                          Remover imagem do item
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}
      </form>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white p-4">
        <div className="max-w-4xl mx-auto flex justify-between gap-4">
          {onDelete ? (
            <button
              type="button"
              className="rounded border border-red-600 text-red-600 px-4 py-2"
              onClick={onDelete}
              disabled={isSubmitting}
            >
              Excluir template
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="rounded bg-black text-white px-6 py-2 disabled:opacity-50"
            onClick={handleSubmit(submit)}
            disabled={disableSubmit}
          >
            {disableSubmit ? "Salvando..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
