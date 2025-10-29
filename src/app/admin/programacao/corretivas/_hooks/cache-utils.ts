import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";

import type {
  CorrectiveOpenNcItem,
  CorrectiveOsItem,
  ScheduleResultPayload,
} from "../_types";
import { CORRECTIVE_PAGE_SIZE } from "../_types";

export const CORRECTIVE_NC_OPEN_KEY = ["correctives", "nc-open"] as const;
export const CORRECTIVE_OS_KEY = ["correctives", "os"] as const;
export const CORRECTIVE_ASSIGNEES_KEY = ["correctives", "assignees"] as const;

type NcOpenPage = {
  items: CorrectiveOpenNcItem[];
  nextCursor: string | null;
};

type OsPage = {
  items: CorrectiveOsItem[];
  nextCursor: string | null;
};

type InfiniteNcOpen = InfiniteData<NcOpenPage, string | null>;
type InfiniteOs = InfiniteData<OsPage, string | null>;

export function removeNcFromOpenCaches(queryClient: QueryClient, ncId: string | null) {
  if (!ncId) return;
  const targets = queryClient.getQueriesData<InfiniteNcOpen>({ queryKey: CORRECTIVE_NC_OPEN_KEY });
  for (const [key, data] of targets) {
    if (!data) continue;
    const nextPages = data.pages.map(page => ({
      ...page,
      items: page.items.filter(item => item.ncId !== ncId && item.id !== ncId),
    }));
    queryClient.setQueryData<InfiniteNcOpen>(key as QueryKey, {
      ...data,
      pages: nextPages,
    });
  }
}

function matchesFilters(filters: Record<string, unknown>, payload: ScheduleResultPayload) {
  const area = typeof filters.area === "string" ? filters.area : "";
  if (area && payload.area !== area) {
    return false;
  }

  const status = typeof filters.status === "string" ? filters.status : "";
  if (status && payload.status !== status) {
    return false;
  }

  const responsible = typeof filters.responsible === "string" ? filters.responsible : "";
  if (responsible && payload.assignees.owner !== responsible) {
    return false;
  }

  const from = typeof filters.from === "string" ? filters.from : "";
  if (from && payload.scheduledDate < from) {
    return false;
  }

  const to = typeof filters.to === "string" ? filters.to : "";
  if (to && payload.scheduledDate > to) {
    return false;
  }

  return true;
}

export function upsertCorrectiveOsCache(
  queryClient: QueryClient,
  payload: ScheduleResultPayload,
  makeItem: (result: ScheduleResultPayload) => CorrectiveOsItem
) {
  const targets = queryClient.getQueriesData<InfiniteOs>({ queryKey: CORRECTIVE_OS_KEY });
  for (const [key, data] of targets) {
    if (!data) continue;
    const filters = (Array.isArray(key) ? key[key.length - 1] : undefined) as Record<string, unknown> | undefined;
    if (filters && !matchesFilters(filters, payload)) {
      continue;
    }

    const item = makeItem(payload);
    const pages = data.pages.map(page => ({
      ...page,
      items: page.items.filter(existing => existing.osId !== item.osId && existing.id !== item.id),
    }));
    if (pages.length === 0) {
      pages.push({ items: [], nextCursor: null });
    }
    pages[0] = {
      ...pages[0],
      items: [item, ...pages[0]!.items].slice(0, CORRECTIVE_PAGE_SIZE),
    };

    queryClient.setQueryData<InfiniteOs>(key as QueryKey, {
      ...data,
      pages,
    });
  }
}
