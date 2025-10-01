// src/lib/templates-schema.ts
import { z } from "zod";

export const templateItemSchema = z.object({
  id: z.string().uuid({ message: "ID do item invalido" }).optional(),
  componente: z.string().min(1, "Componente obrigatorio"),
  oQueChecar: z.string().min(1, "Informe o que checar"),
  instrumento: z.string().min(1, "Informe o instrumento"),
  criterio: z.string().min(1, "Informe o criterio"),
  oQueFazer: z.string().min(1, "Informe o que fazer"),
  imagemItemUrl: z.string().url({ message: "URL invalida" }).optional(),
  ordem: z.coerce.number().int().min(1, "Ordem invalida"),
  createdAt: z
    .string()
    .datetime({ offset: true, message: "createdAt invalido" }),
});

export const templateSchema = z
  .object({
    nome: z.string().min(2, "Nome obrigatorio"),
    imagemUrl: z.string().url({ message: "URL invalida" }).optional(),
    itens: z.array(templateItemSchema).min(1, "Adicione pelo menos um item"),
  })
  .superRefine((data, ctx) => {
    data.itens.forEach((item, index) => {
      if (item.ordem !== index + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ordem deve seguir a posicao do item",
          path: ["itens", index, "ordem"],
        });
      }
    });
  });

export type TemplateItemInput = z.infer<typeof templateItemSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;

export type TemplateRecord = TemplateInput & {
  id: string;
  createdAt: string;
  itens: (TemplateItemInput & { id: string; ordem: number; createdAt: string })[];
};
