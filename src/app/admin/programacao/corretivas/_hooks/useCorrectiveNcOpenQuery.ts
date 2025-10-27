import { useInfiniteQuery } from "@tanstack/react-query";

import type { CorrectiveOpenNcItem } from "../_types";
import { CORRECTIVE_NC_OPEN_KEY } from "./cache-utils";

interface FetchParams {
  area?: string;
  severity?: number;
  source?: string;
}

interface NcOpenPage {
  items: CorrectiveOpenNcItem[];
  nextCursor: string | null;
}

async function fetchNcOpenPage(
  params: FetchParams,
  cursor: string | null,
  signal?: AbortSignal
): Promise<NcOpenPage> {
  const search = new URLSearchParams();
  search.set("limit", "20");
  if (params.area) {
    search.set("area", params.area);
  }
  if (params.severity) {
    search.set("severity", String(params.severity));
  }
  if (params.source) {
    search.set("source", params.source);
  }
  if (cursor) {
    search.set("cursor", cursor);
  }

  const response = await fetch(`/api/correctives/nc-open?${search.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = typeof payload?.error === "string" ? payload.error : "Erro ao carregar NCs";
    throw new Error(message);
  }

  const data = (await response.json()) as NcOpenPage;
  return {
    items: Array.isArray(data.items) ? data.items : [],
    nextCursor: data.nextCursor ?? null,
  };
}

export function useCorrectiveNcOpenQuery(filters: FetchParams & { source?: string }) {
  return useInfiniteQuery<NcOpenPage, Error>({
    queryKey: [...CORRECTIVE_NC_OPEN_KEY, filters],
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    queryFn: ({ pageParam, signal }) => fetchNcOpenPage(filters, pageParam ?? null, signal),
  });
}
