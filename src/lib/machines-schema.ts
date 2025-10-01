import { z } from "zod";

export const machineSchema = z.object({
  tag: z.string().trim().min(1, "TAG obrigatoria"),
  nome: z.string().trim().min(1, "Nome obrigatorio"),
  setor: z.string().trim().min(1, "Setor obrigatorio"),
  unidade: z.string().trim().min(1, "Unidade obrigatoria"),
  localUnidade: z.string().trim().min(1, "Local da unidade obrigatorio"),
  lac: z.string().regex(/^\d{3}$/, "LAC deve ter 3 digitos"),
  fotoUrl: z.string().url("URL invalida").optional(),
  templateId: z.string().trim().min(1, "Selecione um template"),
  ativo: z.boolean(),
});

export type MachineInput = z.infer<typeof machineSchema>;

export type MachineRecord = MachineInput & {
  id: string;
  createdAt: string;
};
