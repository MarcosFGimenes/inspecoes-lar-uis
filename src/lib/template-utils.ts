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
