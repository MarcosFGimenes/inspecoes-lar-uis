"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useRouter } from "next/navigation";

const schema = z.object({
  matricula: z.string().min(1, "Obrigatório"),
  nome: z.string().min(2, "Obrigatório"),
  setor: z.string().min(2, "Obrigatório"),
  lac: z.string().regex(/^\d{3}$/, "LAC deve ter 3 dígitos"),
  ativo: z.boolean().optional().default(true),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  confirm: z.string(),
}).refine(data => data.password === data.confirm, {
  message: "Senhas não conferem",
  path: ["confirm"],
});

type FormData = z.infer<typeof schema>;

export default function NewMaintainerPage() {
  const { register, handleSubmit, formState: { errors }, setError } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { ativo: true }
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(data: FormData) {
    setLoading(true);
    const res = await fetch("/api/mantenedores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.status === 409) {
      setError("matricula", { message: "Matrícula já existe" });
    } else if (!res.ok) {
      const err = await res.json();
      setError("root", { message: err.error || "Erro desconhecido" });
    } else {
      router.push("/admin/mantenedores");
    }
    setLoading(false);
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Novo mantenedor</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label>Matrícula</label>
          <input className="border rounded p-2 w-full" {...register("matricula")} />
          {errors.matricula && <div className="text-red-600 text-sm">{errors.matricula.message}</div>}
        </div>
        <div>
          <label>Nome</label>
          <input className="border rounded p-2 w-full" {...register("nome")} />
          {errors.nome && <div className="text-red-600 text-sm">{errors.nome.message}</div>}
        </div>
        <div>
          <label>Setor</label>
          <input className="border rounded p-2 w-full" {...register("setor")} />
          {errors.setor && <div className="text-red-600 text-sm">{errors.setor.message}</div>}
        </div>
        <div>
          <label>LAC</label>
          <input className="border rounded p-2 w-full" {...register("lac")} />
          {errors.lac && <div className="text-red-600 text-sm">{errors.lac.message}</div>}
        </div>
        <div>
          <label>
            <input type="checkbox" {...register("ativo")} className="mr-2" /> Ativo
          </label>
        </div>
        <div>
          <label>Senha</label>
          <input type="password" className="border rounded p-2 w-full" {...register("password")} />
          {errors.password && <div className="text-red-600 text-sm">{errors.password.message}</div>}
        </div>
        <div>
          <label>Confirmar senha</label>
          <input type="password" className="border rounded p-2 w-full" {...register("confirm")} />
          {errors.confirm && <div className="text-red-600 text-sm">{errors.confirm.message}</div>}
        </div>
        {errors.root && <div className="text-red-600 text-sm">{errors.root.message}</div>}
        <button type="submit" className="rounded bg-black text-white px-4 py-2 disabled:opacity-50" disabled={loading}>
          {loading ? "Salvando..." : "Criar mantenedor"}
        </button>
      </form>
    </div>
  );
}
