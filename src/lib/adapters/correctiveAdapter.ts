import { adminDb } from "@/lib/firebase-admin";

const correctiveNonConformitiesCollection = adminDb.collection("corrective_nonConformities");
const correctiveWorkOrdersCollection = adminDb.collection("corrective_workOrders");
const correctiveNcOpenViewCollection = adminDb.collection("views_nc_open");
const correctiveWorkOrderViewCollection = adminDb.collection("views_os_corrective");
const maintainersCollection = adminDb.collection("mantenedores");
const maintenanceAreasCollection = adminDb.collection("maintenance_areas");

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface CorrectiveAssignees {
  owner: string;
  maintainer1?: string;
  maintainer2?: string;
}

export async function listOpenNCsView(params: {
  area?: string;
  severity?: Severity;
  limit: number;
  cursor?: string;
}) {
  void params;
  void correctiveNcOpenViewCollection;
  throw new Error("TODO: implement listOpenNCsView");
}

export async function createOrUpdateCorrectiveWO(input: {
  ncId?: string;
  description?: string;
  area: "mechanical" | "electrical";
  assignees: CorrectiveAssignees;
  scheduledDate: string;
  dueDate?: string;
}) {
  void input;
  void correctiveWorkOrdersCollection;
  void correctiveNonConformitiesCollection;
  void maintainersCollection;
  void maintenanceAreasCollection;
  throw new Error("TODO: implement createOrUpdateCorrectiveWO");
}

export async function listCorrectiveWOView(params: {
  from?: string;
  to?: string;
  area?: string;
  status?: string;
  limit: number;
  cursor?: string;
}) {
  void params;
  void correctiveWorkOrderViewCollection;
  throw new Error("TODO: implement listCorrectiveWOView");
}

type NcWithSeverity =
  | undefined
  | null
  | {
      severity?: {
        signer?: Severity;
        maintainer?: Severity;
      };
    };

export function getEffectiveSeverity(nc: NcWithSeverity): Severity {
  return (nc?.severity?.signer ?? nc?.severity?.maintainer) as Severity;
}

export async function linkNcToOs(ncId: string, osId: string) {
  void ncId;
  void osId;
  void correctiveNonConformitiesCollection;
  void correctiveWorkOrdersCollection;
  throw new Error("TODO: implement linkNcToOs");
}
