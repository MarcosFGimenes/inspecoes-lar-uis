"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const baseSchema = {
  matricula: z.string().min(1, "Informe a matrícula"),
  nome: z.string().min(2, "Informe o nome"),
  setor: z.string().min(2, "Informe o setor"),
  lac: z.string().regex(/^\d{3}$/, "LAC deve ter 3 dígitos"),
  ativo: z.boolean(),
};

const createSchema = z
  .object({
    ...baseSchema,
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string(),
  })
  .refine(data => data.password === data.confirm, {
    path: ["confirm"],
    message: "Senhas não conferem",
  });

const editSchema = z
  .object({
    ...baseSchema,
    password: z.string().optional(),
    confirm: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const password = data.password?.trim() ?? "";
    const confirm = data.confirm?.trim() ?? "";
    if (!password && !confirm) {
      return;
    }
    if (password.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mínimo 8 caracteres",
        path: ["password"],
      });
    }
    if (password !== confirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Senhas não conferem",
        path: ["confirm"],
      });
    }
  });

export type MaintainerFormMode = "create" | "edit";

type MaintainerFormValues = {
  matricula: string;
  nome: string;
  setor: string;
  lac: string;
  ativo: boolean;
  password?: string;
  confirm?: string;
};

export interface MaintainerFormProps {
  mode: MaintainerFormMode;
  maintainerId?: string;
  initialData?: Partial<MaintainerFormValues>;
}

type MaintainerResponse = MaintainerFormValues & {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  password?: never;
  confirm?: never;
};

export function MaintainerForm({ mode, maintainerId, initialData }: MaintainerFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loadingMaintainer, setLoadingMaintainer] = useState(mode === "edit" && !initialData);

  const schema = useMemo(() => (mode === "create" ? createSchema : editSchema), [mode]);

  const form = useForm<MaintainerFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      matricula: initialData?.matricula ?? "",
      nome: initialData?.nome ?? "",
      setor: initialData?.setor ?? "",
      lac: initialData?.lac ?? "",
      ativo: initialData?.ativo ?? true,
      password: "",
      confirm: "",
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  useEffect(() => {
    if (mode !== "edit" || !maintainerId || initialData) {
      return;
    }
    let cancelled = false;
    async function load() {
      setServerError(null);
      setLoadingMaintainer(true);
      try {
        const response = await fetch(`/api/mantenedores/${maintainerId}`, { cache: "no-store" });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Falha ao carregar mantenedor");
        }
        const data = (await response.json()) as MaintainerResponse;
        if (!cancelled) {
          const defaults: MaintainerFormValues = {
            matricula: data.matricula ?? "",
            nome: data.nome ?? "",
            setor: data.setor ?? "",
            lac: data.lac ?? "",
            ativo: data.ativo ?? true,
            password: "",
            confirm: "",
          } as MaintainerFormValues;
          reset(defaults);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          const message = error instanceof Error && error.message ? error.message : "Erro desconhecido";
          setServerError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingMaintainer(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [initialData, maintainerId, mode, reset]);

  useEffect(() => {
    if (!initialData) return;
    const defaults: MaintainerFormValues = {
      matricula: initialData.matricula ?? "",
      nome: initialData.nome ?? "",
      setor: initialData.setor ?? "",
      lac: initialData.lac ?? "",
      ativo: initialData.ativo ?? true,
      password: "",
      confirm: "",
    } as MaintainerFormValues;
    reset(defaults);
  }, [initialData, reset]);

  const ativoValue = watch("ativo");

  const onSubmit = handleSubmit(async values => {
    setServerError(null);
    setSuccessMessage(null);
    const payload = {
      matricula: values.matricula.trim(),
      nome: values.nome.trim(),
      setor: values.setor.trim(),
      lac: values.lac.trim(),
      ativo: values.ativo,
    };

    try {
      if (mode === "create") {
        const response = await fetch("/api/mantenedores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, password: (values.password ?? "").trim() }),
        });
        if (response.status === 409) {
          form.setError("matricula", { message: "Matrícula já existe" });
          return;
        }
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "Falha ao criar mantenedor");
        }
        router.push("/admin/mantenedores");
        router.refresh();
        return;
      }

      if (!maintainerId) {
        throw new Error("Mantenedor não informado");
      }

      const trimmedPassword = values.password?.trim() ?? "";
      const response = await fetch(`/api/mantenedores/${maintainerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          password: trimmedPassword.length > 0 ? trimmedPassword : undefined,
        }),
      });
      if (response.status === 409) {
        form.setError("matricula", { message: "Matrícula já existe" });
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Falha ao atualizar mantenedor");
      }
      setSuccessMessage("Mantenedor atualizado com sucesso.");
      router.refresh();
      form.setValue("password", "");
      form.setValue("confirm", "");
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : "Erro desconhecido";
      setServerError(message);
    }
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-[var(--text)]">
            {mode === "create" ? "Novo mantenedor" : "Editar mantenedor"}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {mode === "create"
              ? "Cadastre um novo responsável pelas inspeções e defina sua senha de acesso."
              : "Atualize os dados cadastrais e, se necessário, redefina a senha do mantenedor."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/mantenedores" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
            <i className="fas fa-arrow-left" aria-hidden />
            Voltar para a lista
          </Link>
          {mode === "edit" && maintainerId && (
            <Link
              href={`/admin/mantenedores/${maintainerId}/machines`}
              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <i className="fas fa-cogs" aria-hidden />
              Gerenciar máquinas
            </Link>
          )}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Dados cadastrais</CardTitle>
          <CardDescription>Preencha as informações principais do mantenedor.</CardDescription>
        </CardHeader>
        <CardContent>
          {serverError && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <div className="flex items-start gap-3">
                <i className="fas fa-circle-exclamation mt-1" aria-hidden />
                <div>
                  <p className="font-medium">Não foi possível salvar as informações.</p>
                  <p className="text-rose-600">{serverError}</p>
                </div>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <div className="flex items-start gap-3">
                <i className="fas fa-check-circle mt-1" aria-hidden />
                <div>
                  <p className="font-medium">Tudo certo!</p>
                  <p className="text-emerald-600">{successMessage}</p>
                </div>
              </div>
            </div>
          )}

          {loadingMaintainer ? (
            <div className="space-y-4">
              <div className="h-12 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_88%,rgba(148,163,184,0.35)_12%)]" />
              <div className="h-12 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_88%,rgba(148,163,184,0.35)_12%)]" />
              <div className="h-12 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--surface)_88%,rgba(148,163,184,0.35)_12%)]" />
            </div>
          ) : (
            <form className="space-y-6" onSubmit={onSubmit}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-[var(--muted)]">Matrícula *</span>
                  <Input
                    placeholder="Ex: 12345"
                    {...register("matricula")}
                    aria-invalid={errors.matricula ? "true" : "false"}
                  />
                  {errors.matricula && (
                    <span className="block text-xs font-medium text-rose-600">{errors.matricula.message}</span>
                  )}
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-[var(--muted)]">LAC *</span>
                  <Input
                    placeholder="Ex: 123"
                    {...register("lac")}
                    aria-invalid={errors.lac ? "true" : "false"}
                  />
                  {errors.lac && <span className="block text-xs font-medium text-rose-600">{errors.lac.message}</span>}
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--muted)]">Nome completo *</span>
                <Input
                  placeholder="Digite o nome"
                  {...register("nome")}
                  aria-invalid={errors.nome ? "true" : "false"}
                />
                {errors.nome && <span className="block text-xs font-medium text-rose-600">{errors.nome.message}</span>}
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-[var(--muted)]">Setor *</span>
                  <Input
                    placeholder="Ex: Manutenção"
                    {...register("setor")}
                    aria-invalid={errors.setor ? "true" : "false"}
                  />
                  {errors.setor && <span className="block text-xs font-medium text-rose-600">{errors.setor.message}</span>}
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-[var(--muted)]">Status *</span>
                  <Select value={ativoValue ? "true" : "false"} onChange={event => form.setValue("ativo", event.target.value === "true")}>
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </Select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-[var(--muted)]">
                    {mode === "create" ? "Senha de acesso *" : "Nova senha (opcional)"}
                  </span>
                  <Input
                    type="password"
                    placeholder={mode === "create" ? "Crie uma senha" : "Informe uma nova senha"}
                    {...register("password")}
                    aria-invalid={errors.password ? "true" : "false"}
                  />
                  {errors.password && <span className="block text-xs font-medium text-rose-600">{errors.password.message}</span>}
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-[var(--muted)]">
                    {mode === "create" ? "Confirmar senha *" : "Confirmar nova senha"}
                  </span>
                  <Input
                    type="password"
                    placeholder="Repita a senha"
                    {...register("confirm")}
                    aria-invalid={errors.confirm ? "true" : "false"}
                  />
                  {errors.confirm && <span className="block text-xs font-medium text-rose-600">{errors.confirm.message}</span>}
                </label>
              </div>

              <div className="flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] pt-6 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={() => router.push("/admin/mantenedores")}>
                  Cancelar
                </Button>
                <Button type="submit" loading={isSubmitting} disabled={loadingMaintainer}>
                  {mode === "create" ? "Salvar mantenedor" : "Atualizar dados"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default MaintainerForm;
