import type { StoredImage } from "@/types";

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
  machineId: string | null;
  machineTag: string | null;
  machineName: string | null;
  osNumero: string | null;
  photos: StoredImage[] | null;
  questionId: string | null;
  questionLabel: string | null;
  inspectionResponseId: string | null;
  templateId: string | null;
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
  dueDate: string | null;
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
  completedAt: string | null;
  completedBy: string | null;
  completedByName: string | null;
  completedByMatricula: string | null;
  completionNotes: string | null;
  machineId: string | null;
  machineTag: string | null;
  machineName: string | null;
  ncPhotos: StoredImage[] | null;
  inspectionId: string | null;
  inspectionResponseId: string | null;
  templateId: string | null;
  questionId: string | null;
  questionLabel: string | null;
  osNumero: string | null;
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
  dueDate: string | null;
  description: string | null;
  effectiveSeverity: number | null;
  inspectionId: string | null;
  source: string | null;
  status: string;
  updatedAt: string;
  machineId: string | null;
  machineTag: string | null;
  machineName: string | null;
  ncPhotos: StoredImage[] | null;
  osNumero: string | null;
  inspectionResponseId: string | null;
  templateId: string | null;
  questionId: string | null;
  questionLabel: string | null;
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
  machineId: string | null;
  machineTag: string | null;
  machineName: string | null;
  osNumero: string | null;
  photos: StoredImage[] | null;
  questionId: string | null;
  questionLabel: string | null;
  inspectionResponseId: string | null;
  templateId: string | null;
}

export const CORRECTIVE_PAGE_SIZE = 20;
