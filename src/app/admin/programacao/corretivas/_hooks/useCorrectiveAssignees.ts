import { useQuery } from "@tanstack/react-query";

import type { CorrectiveAssigneeOption } from "../_types";
import { CORRECTIVE_ASSIGNEES_KEY } from "./cache-utils";

async function fetchAssignees(signal?: AbortSignal): Promise<CorrectiveAssigneeOption[]> {
  const response = await fetch("/api/correctives/assignees", {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = typeof payload?.error === "string" ? payload.error : "Falha ao carregar responsáveis";
    throw new Error(message);
  }

  const raw = (await response.json()) as { items?: Array<Record<string, unknown>> };
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return items
    .map(item => {
      const id = typeof item.id === "string" ? item.id : null;
      if (!id) return null;
      const nome = typeof item.nome === "string" ? item.nome : null;
      const matricula = typeof item.matricula === "string" ? item.matricula : null;
      const areaValue =
        typeof item.area === "string" && (item.area === "mechanical" || item.area === "electrical")
          ? item.area
          : null;
      const rawArea = typeof item.rawArea === "string" ? item.rawArea : null;
      return {
        id,
        nome,
        matricula,
        area: areaValue,
        rawArea,
      } satisfies CorrectiveAssigneeOption;
    })
    .filter((option): option is CorrectiveAssigneeOption => Boolean(option));
}

export function useCorrectiveAssignees(enabled: boolean) {
  return useQuery({
    queryKey: CORRECTIVE_ASSIGNEES_KEY,
    queryFn: ({ signal }) => fetchAssignees(signal),
    enabled,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}
