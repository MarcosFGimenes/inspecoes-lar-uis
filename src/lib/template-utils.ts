import { v4 as uuid } from "uuid";
import { TemplateItemInput } from "./templates-schema";

export type TemplateItemFormData = TemplateItemInput & {
  id: string;
  ordem: number;
  createdAt: string;
};

export function createTemplateItem(order: number): TemplateItemFormData {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    componente: "",
    oQueChecar: "",
    instrumento: "",
    criterio: "",
    oQueFazer: "",
    imagemItemUrl: undefined,
    ordem: order,
    createdAt: now,
  };
}

export function ensureSequentialOrders(items: TemplateItemFormData[]): TemplateItemFormData[] {
  return items.map((item, index) => ({
    ...item,
    ordem: index + 1,
  }));
}

export function normalizeTemplateItems(itens: unknown[] | undefined | null): TemplateItemFormData[] {
  if (!Array.isArray(itens) || itens.length === 0) {
    return [createTemplateItem(1)];
  }

  const mapped = itens
    .map((raw, index) => {
      const entry = (raw || {}) as Partial<TemplateItemFormData> & Record<string, unknown>;
      const ordem = typeof entry.ordem === "number" && entry.ordem > 0 ? entry.ordem : index + 1;
      return {
        id: typeof entry.id === "string" && entry.id ? entry.id : uuid(),
        componente: typeof entry.componente === "string" ? entry.componente : "",
        oQueChecar: typeof entry.oQueChecar === "string" ? entry.oQueChecar : "",
        instrumento: typeof entry.instrumento === "string" ? entry.instrumento : "",
        criterio: typeof entry.criterio === "string" ? entry.criterio : "",
        oQueFazer: typeof entry.oQueFazer === "string" ? entry.oQueFazer : "",
        imagemItemUrl:
          typeof entry.imagemItemUrl === "string" && entry.imagemItemUrl ? entry.imagemItemUrl : undefined,
        ordem,
        createdAt:
          typeof entry.createdAt === "string" && entry.createdAt
            ? entry.createdAt
            : new Date().toISOString(),
      } satisfies TemplateItemFormData;
    })
    .sort((a, b) => a.ordem - b.ordem);

  return ensureSequentialOrders(mapped);
}
