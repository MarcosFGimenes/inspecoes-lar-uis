// src/lib/templates-schema.ts
import { z } from "zod";

export const templateItemSchema = z.object({
  id: z.string().uuid({ message: "ID do item inválido" }).optional(),
  componente: z.string().min(1, "Componente obrigatório"),
  oQueChecar: z.string().min(1, "Informe o que checar"),
  instrumento: z.string().min(1, "Informe o instrumento"),
  criterio: z.string().min(1, "Informe o critério"),
  oQueFazer: z.string().min(1, "Informe o que fazer"),
  imagemItemUrl: z.string().url({ message: "URL inválida" }).optional(),
  ordem: z.number().int().min(1, "Ordem inválida").optional(),
  createdAt: z
    .string()
    .datetime({ offset: true, message: "createdAt inválido" })
    .optional(),
});

export const templateSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  imagemUrl: z.string().url({ message: "URL inválida" }).optional(),
  itens: z
    .array(templateItemSchema)
    .min(1, "Adicione pelo menos um item"),
});

export type TemplateItemInput = z.infer<typeof templateItemSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;

export type TemplateRecord = TemplateInput & {
  id: string;
  createdAt: string;
  itens: (TemplateItemInput & { id: string; ordem: number; createdAt: string })[];
};
