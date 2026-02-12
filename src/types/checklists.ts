export type NonConformityStatus = "open" | "in_progress" | "resolved";

import type { StoredImage } from "./images";

export type IsoHeaderFontFamily = "helvetica" | "times" | "courier";
export type IsoHeaderFontStyle = "normal" | "bold" | "italic" | "bolditalic";

export interface IsoHeaderTextSegment {
  text: string;
  color?: string | null;
  fontFamily?: IsoHeaderFontFamily | null;
  fontStyle?: IsoHeaderFontStyle | null;
  fontSize?: number | null;
  letterSpacing?: number | null;
}

export interface IsoHeaderText {
  segments: IsoHeaderTextSegment[];
}

export interface InspectionIsoHeaderConfig {
  emissao: IsoHeaderText;
  revisao: IsoHeaderText;
  revisaoNumero: IsoHeaderText;
  foNumero: IsoHeaderText;
  orientacoes: IsoHeaderText;
}

export interface ChecklistAnswer {
  questionId: string;
  questionText?: string | null;
  response: "c" | "nc" | "na";
  observation?: string | null;
  photoUrls?: StoredImage[];
  recurrence?: boolean;
  itemOsNumero?: string | null;
}

export interface ChecklistNonConformityTreatment {
  questionId: string;
  summary?: string | null;
  responsible?: string | null;
  dueDate?: string | null;
  status: NonConformityStatus;
  createdAt: string;
  updatedAt?: string | null;
}

export interface ChecklistResponseMaintainer {
  maintId?: string | null;
  nome?: string | null;
  matricula?: string | null;
}

export interface ChecklistResponseMachine {
  machineId?: string | null;
  tag?: string | null;
  nome?: string | null;
  modelo?: string | null;
  setor?: string | null;
  unidade?: string | null;
  localUnidade?: string | null;
  lac?: string | null;
  fotoUrl?: string | null;
  templateId?: string | null;
}

export interface ChecklistResponseTemplate {
  id?: string | null;
  nome?: string | null;
  versao?: string | null;
}

export interface ChecklistResponse {
  id: string;
  machine?: ChecklistResponseMachine | null;
  template?: ChecklistResponseTemplate | null;
  maintainer?: ChecklistResponseMaintainer | null;
  answers?: ChecklistAnswer[];
  itens?: unknown;
  nonConformityTreatments?: ChecklistNonConformityTreatment[];
  observacoes?: string | null;
  osNumero?: string | null;
  assinaturaUrl?: string | null;
  pcmSign?: {
    nome?: string | null;
    cargo?: string | null;
    matricula?: string | null;
    assinaturaUrl?: string | null;
    signedAt?: string | null;
  } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  iniciadaEm?: string | null;
  finalizadaEm?: string | null;
  qtdNC?: number;
}
