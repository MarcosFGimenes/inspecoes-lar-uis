import type { ChecklistAnswer, StoredImage } from "../../types/index.ts";
import { normalizeStoredImages } from "./images.ts";

type TemplateItem = {
  oQueChecar?: string;
  criterio?: string;
};

export function mergeStoredImageCollections(...collections: unknown[]): StoredImage[] {
  const seen = new Set<string>();
  const merged: StoredImage[] = [];
  collections.forEach(collection => {
    normalizeStoredImages(collection).forEach(image => {
      const dedupeKey = `${image.provider ?? "imgbb"}:${image.url}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      merged.push(image);
    });
  });
  return merged;
}

export function normalizeInspectionAnswers(
  data: Record<string, unknown>,
  templateItemsMap: Map<string, TemplateItem>
): ChecklistAnswer[] {
  const itens = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
  const itensMap = new Map<string, ChecklistAnswer>();
  itens
    .filter(item => item?.templateItemId)
    .forEach(item => {
      const questionId = String(item.templateItemId);
      const templateItem = templateItemsMap.get(questionId) ?? {};
      const resultado = String(item.resultado || "C").toLowerCase();
      const response: "c" | "nc" | "na" = resultado === "nc" ? "nc" : resultado === "na" ? "na" : "c";
      itensMap.set(questionId, {
        questionId,
        questionText:
          templateItem.oQueChecar ??
          templateItem.criterio ??
          (typeof item.componente === "string" ? item.componente : null),
        response,
        observation: typeof item.observacaoItem === "string" ? item.observacaoItem : null,
        photoUrls: normalizeStoredImages(item.fotos ?? []),
        recurrence: false,
        itemOsNumero: typeof item.osNumeroItem === "string" && item.osNumeroItem.trim()
          ? item.osNumeroItem.trim().toUpperCase()
          : null,
      });
    });

  const answers = Array.isArray(data.answers) ? (data.answers as ChecklistAnswer[]) : [];
  const mergedMap = new Map<string, ChecklistAnswer>(itensMap);
  answers
    .filter(item => item?.questionId)
    .forEach(item => {
      const fallback = mergedMap.get(item.questionId);
      mergedMap.set(item.questionId, {
        questionId: item.questionId,
        questionText:
          item.questionText ??
          fallback?.questionText ??
          templateItemsMap.get(item.questionId)?.oQueChecar ??
          templateItemsMap.get(item.questionId)?.criterio ??
          null,
        response: item.response === "nc" || item.response === "na" ? item.response : fallback?.response ?? "c",
        observation: item.observation ?? fallback?.observation ?? null,
        photoUrls: mergeStoredImageCollections(
          (item as unknown as Record<string, unknown>).photoUrls ??
            (item as unknown as Record<string, unknown>).photos ??
            [],
          fallback?.photoUrls ?? []
        ),
        recurrence: item.recurrence ?? fallback?.recurrence ?? false,
        itemOsNumero: item.itemOsNumero ?? fallback?.itemOsNumero ?? null,
      });
    });

  return Array.from(mergedMap.values());
}
