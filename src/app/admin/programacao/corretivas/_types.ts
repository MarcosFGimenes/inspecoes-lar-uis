export interface CorrectiveOpenNcItem {
  id: string;
  ncId: string;
  description: string | null;
  area: string | null;
  effectiveSeverity: number | null;
  updatedAt: string | null;
  status: string | null;
  inspectionId: string | null;
  source: string | null;
}

export interface CorrectiveOsItem {
  id: string;
  osId: string;
  ncId: string | null;
  description: string | null;
  ncDescription: string | null;
  area: string | null;
  effectiveSeverity: number | null;
  scheduledDate: string | null;
  status: string | null;
  updatedAt: string | null;
  owner: string | null;
  maintainer1: string | null;
  maintainer2: string | null;
  assignees: {
    owner: string | null;
    maintainer1: string | null;
    maintainer2: string | null;
  } | null;
}

export interface CorrectiveAssigneeOption {
  id: string;
  nome: string | null;
  matricula: string | null;
  area: "mechanical" | "electrical" | null;
  rawArea: string | null;
}

export interface ScheduleResultPayload {
  osId: string;
  ncId: string | null;
  area: "mechanical" | "electrical";
  scheduledDate: string;
  description: string | null;
  effectiveSeverity: number | null;
  inspectionId: string | null;
  source: string | null;
  status: string;
  updatedAt: string;
  assignees: {
    owner: string;
    maintainer1: string | null;
    maintainer2: string | null;
  };
}

export interface CorrectiveScheduleContext {
  ncId: string | null;
  description: string | null;
  area: string | null;
  effectiveSeverity: number | null;
  inspectionId: string | null;
  source: string | null;
}

export const CORRECTIVE_PAGE_SIZE = 20;
