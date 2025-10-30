import { useQuery } from "@tanstack/react-query";

import type { CorrectiveAssigneeOption } from "../_types";
import { CORRECTIVE_ASSIGNEES_KEY } from "./cache-utils";
import { fetchCorrectiveAssignees } from "@/lib/correctives/assignees";

export function useCorrectiveAssignees(enabled: boolean) {
  return useQuery({
    queryKey: CORRECTIVE_ASSIGNEES_KEY,
    queryFn: ({ signal }) => fetchCorrectiveAssignees({ signal }),
    enabled,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}
