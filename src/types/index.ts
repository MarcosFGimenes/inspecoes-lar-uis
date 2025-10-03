export type Resultado = "C" | "NC" | "NA";

export type TemplateItem = {
  id: string;
  componente: string;
  oQueChecar: string;
  instrumento: string;
  criterio: string;
  oQueFazer: string;
  imagemItemUrl?: string;
  ordem: number;
};

export type Template = {
  id: string;
  nome: string;
  imagemUrl?: string;
  itens: TemplateItem[];
  createdAt?: string;
};

export type Machine = {
  id: string;
  tag: string;           // única
  nome: string;
  setor: string;
  unidade: string;
  localUnidade: string;
  lac: string;           // ex: "012"
  fotoUrl?: string;
  templateId?: string;
  ativo: boolean;
  createdAt?: string;
};

export type Maintainer = {
  id: string;
  matricula: string;     // única
  nome: string;
  setor: string;
  lac: string;
  ativo: boolean;
  passwordHash: string;  // bcrypt
  machines?: string[];   // opcional se não usar coleção "atribuicoes"
  createdAt?: string;
};

export type InspectionItemAnswer = {
  templateItemId: string;
  resultado: Resultado;
  observacaoItem?: string;
  fotos?: string[];
};

export type Inspection = {
  id: string;
  machineId: string;
  tag: string;
  nomeMaquina: string;
  setor: string;
  unidade: string;
  localUnidade: string;
  fotoUrl?: string;
  templateId?: string;

  maintId: string;
  matricula: string;
  nome: string;

  osNumero?: string;
  observacoes?: string;
  assinaturaUrl?: string;

  itens: InspectionItemAnswer[];
  qtdNC: number;

  iniciadaEm: string;
  finalizadaEm: string;

  issuesCriadas?: string[];
  issuesResolvidas?: string[];
};

export type Issue = {
  id: string;
  machineId: string;
  tag: string;
  templateItemId: string;
  descricao: string;
  osNumero?: string;
  status: "aberta" | "resolvida";
  abertaEmInspecaoId: string;
  resolvidaEmInspecaoId?: string;
  createdAt: string;
  resolvedAt?: string;
};

export * from "./checklists";
