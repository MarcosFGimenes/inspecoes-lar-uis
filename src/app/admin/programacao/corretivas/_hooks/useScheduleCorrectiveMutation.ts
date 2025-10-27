import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ScheduleResultPayload } from "../_types";
import type { CorrectiveOsItem } from "../_types";
import { removeNcFromOpenCaches, upsertCorrectiveOsCache } from "./cache-utils";

interface ScheduleRequestBody {
  ncId?: string;
  description?: string;
  area: "mechanical" | "electrical";
  assignees: {
    owner: string;
    maintainer1?: string;
    maintainer2?: string;
  };
  scheduledDate: string;
  dueDate?: string;
  ncContext?: Record<string, unknown> | null;
}

interface ScheduleVariables {
  request: ScheduleRequestBody;
  ncId: string | null;
  result: Omit<ScheduleResultPayload, "osId">;
  onSuccess?: (payload: ScheduleResultPayload) => void;
}

interface ScheduleResponse {
  osId?: string;
}

function makeOsItemFromResult(result: ScheduleResultPayload): CorrectiveOsItem {
  return {
    id: result.osId,
    osId: result.osId,
    ncId: result.ncId,
    description: result.description,
    ncDescription: result.description,
    area: result.area,
    effectiveSeverity: result.effectiveSeverity,
    scheduledDate: result.scheduledDate,
    status: result.status,
    updatedAt: result.updatedAt,
    owner: result.assignees.owner,
    maintainer1: result.assignees.maintainer1,
    maintainer2: result.assignees.maintainer2,
    assignees: {
      owner: result.assignees.owner,
      maintainer1: result.assignees.maintainer1,
      maintainer2: result.assignees.maintainer2,
    },
  } satisfies CorrectiveOsItem;
}

export function useScheduleCorrectiveMutation() {
  const queryClient = useQueryClient();

  return useMutation<ScheduleResultPayload, Error, ScheduleVariables>({
    mutationFn: async variables => {
      const response = await fetch("/api/correctives/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(variables.request),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = typeof payload?.error === "string" ? payload.error : "Não foi possível programar a corretiva.";
        throw new Error(message);
      }

      const data = (await response.json()) as ScheduleResponse;
      if (!data?.osId) {
        throw new Error("Resposta inesperada do servidor.");
      }

      const result: ScheduleResultPayload = {
        ...variables.result,
        osId: data.osId,
      };

      return result;
    },
    onSuccess: (result, variables) => {
      removeNcFromOpenCaches(queryClient, variables.ncId);
      upsertCorrectiveOsCache(queryClient, result, makeOsItemFromResult);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent<ScheduleResultPayload>("correctives:schedule-success", {
            detail: result,
          })
        );
      }

      variables.onSuccess?.(result);
    },
  });
}
