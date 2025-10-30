import type { CorrectiveAssigneeOption } from "@/app/admin/programacao/corretivas/_types";

interface FetchOptions {
  signal?: AbortSignal;
  limit?: number;
}

function normalizeOption(record: Record<string, unknown>): CorrectiveAssigneeOption | null {
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) {
    return null;
  }

  const nome = typeof record.nome === "string" ? record.nome : null;
  const matricula = typeof record.matricula === "string" ? record.matricula : null;

  const area =
    typeof record.area === "string" &&
    (record.area === "mechanical" || record.area === "electrical")
      ? record.area
      : null;

  const rawArea = typeof record.rawArea === "string" ? record.rawArea : null;

  return {
    id,
    nome,
    matricula,
    area,
    rawArea,
  } satisfies CorrectiveAssigneeOption;
}

export async function fetchCorrectiveAssignees(options: FetchOptions = {}): Promise<CorrectiveAssigneeOption[]> {
  const search = new URLSearchParams();
  if (options.limit) {
    search.set("limit", String(options.limit));
  }

  const response = await fetch(`/api/correctives/assignees?${search.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal: options.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = typeof payload?.error === "string" ? payload.error : "Falha ao carregar responsáveis";
    throw new Error(message);
  }

  const raw = (await response.json()) as { items?: Array<Record<string, unknown>> };
  const items = Array.isArray(raw?.items) ? raw.items : [];

  return items
    .map(record => normalizeOption(record))
    .filter((option): option is CorrectiveAssigneeOption => Boolean(option));
}
