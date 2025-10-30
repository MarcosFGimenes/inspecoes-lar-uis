import { useInfiniteQuery } from "@tanstack/react-query";

import type { CorrectiveOsItem } from "../_types";
import { CORRECTIVE_OS_KEY } from "./cache-utils";

interface FetchParams {
  from?: string;
  to?: string;
  area?: string;
  status?: string;
  responsible?: string;
}

interface OsPage {
  items: CorrectiveOsItem[];
  nextCursor: string | null;
}

async function fetchCorrectiveOs(
  params: FetchParams,
  cursor: string | null,
  signal?: AbortSignal
): Promise<OsPage> {
  const search = new URLSearchParams();
  search.set("limit", "20");
  if (params.area) {
    search.set("area", params.area);
  }
  if (params.status) {
    search.set("status", params.status);
  }
  if (params.responsible) {
    search.set("responsible", params.responsible);
  }
  if (params.from) {
    search.set("from", params.from);
  }
  if (params.to) {
    search.set("to", params.to);
  }
  if (cursor) {
    search.set("cursor", cursor);
  }

  const response = await fetch(`/api/correctives/os?${search.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = typeof payload?.error === "string" ? payload.error : "Falha ao carregar corretivas";
    throw new Error(message);
  }

  const data = (await response.json()) as OsPage;
  return {
    items: Array.isArray(data.items) ? data.items : [],
    nextCursor: data.nextCursor ?? null,
  };
}

export function useCorrectiveOsQuery(filters: FetchParams, options?: { enabled?: boolean }) {
  return useInfiniteQuery<OsPage, Error>({
    queryKey: [...CORRECTIVE_OS_KEY, filters],
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchCorrectiveOs(
        filters,
        typeof pageParam === "string" ? pageParam : null,
        signal
      ),
    enabled: options?.enabled ?? true,
  });
}
