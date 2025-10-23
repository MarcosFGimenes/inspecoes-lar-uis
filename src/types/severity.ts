export type Severity = 1 | 2 | 3 | 4 | 5 | 6;

export interface SeverityAudit {
  role: "maint" | "pcm";
  id?: string | null;
  updatedAt?: string | Date | null;
}

export interface SeverityState {
  maintainer?: Severity;
  maintainerAt?: string | Date | null;
  signer?: Severity | null;
  signerAt?: string | Date | null;
  effective?: Severity;
  audit?: SeverityAudit;
}

export type SeverityFilter = {
  min?: Severity;
  max?: Severity;
};
