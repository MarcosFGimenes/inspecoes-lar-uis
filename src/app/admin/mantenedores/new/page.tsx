"use client";
import { useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  const form = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: { ativo: true },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = form;
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onSubmit: SubmitHandler<FormData> = async data => {
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
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 pt-6">
          <div className="flex items-center mb-4 md:mb-0">
            <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center mr-3">
              <i className="fas fa-tractor text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Lar Cooperativa Agroindustrial</h1>
              <p className="text-gray-600">Sistema de Manutenção de Rotas</p>
            </div>
          </div>
          
          <Link 
            href="/admin/mantenedores"
            className="flex items-center justify-center px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition duration-150 ease-in-out"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Voltar
          </Link>
        </div>

        {/* Card do Formulário */}
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-user-plus text-blue-600 text-2xl"></i>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Novo Mantenedor</h2>
            <p className="text-gray-600">Cadastre um novo técnico no sistema</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Informações Básicas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Matrícula *
                </label>
                <input 
                  className={`w-full px-4 py-3 border rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out ${
                    errors.matricula ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Digite a matrícula"
                  {...register("matricula")}
                />
                {errors.matricula && (
                  <div className="flex items-center mt-1 text-red-600 text-sm">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {errors.matricula.message}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  LAC *
                </label>
                <input 
                  className={`w-full px-4 py-3 border rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out ${
                    errors.lac ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="3 dígitos"
                  {...register("lac")}
                />
                {errors.lac && (
                  <div className="flex items-center mt-1 text-red-600 text-sm">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {errors.lac.message}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome Completo *
              </label>
              <input 
                className={`w-full px-4 py-3 border rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out ${
                  errors.nome ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Digite o nome completo"
                {...register("nome")}
              />
              {errors.nome && (
                <div className="flex items-center mt-1 text-red-600 text-sm">
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  {errors.nome.message}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Setor *
              </label>
              <input 
                className={`w-full px-4 py-3 border rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out ${
                  errors.setor ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Digite o setor"
                {...register("setor")}
              />
              {errors.setor && (
                <div className="flex items-center mt-1 text-red-600 text-sm">
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  {errors.setor.message}
                </div>
              )}
            </div>

            {/* Senha */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Senha *
                </label>
                <input 
                  type="password"
                  className={`w-full px-4 py-3 border rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out ${
                    errors.password ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Mínimo 8 caracteres"
                  {...register("password")}
                />
                {errors.password && (
                  <div className="flex items-center mt-1 text-red-600 text-sm">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {errors.password.message}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirmar Senha *
                </label>
                <input 
                  type="password"
                  className={`w-full px-4 py-3 border rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out ${
                    errors.confirm ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Digite novamente a senha"
                  {...register("confirm")}
                />
                {errors.confirm && (
                  <div className="flex items-center mt-1 text-red-600 text-sm">
                    <i className="fas fa-exclamation-circle mr-1"></i>
                    {errors.confirm.message}
                  </div>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center p-4 bg-gray-50 rounded-lg">
              <input 
                type="checkbox" 
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                {...register("ativo")}
              />
              <label className="ml-3 block text-sm font-medium text-gray-700">
                Mantenedor ativo no sistema
              </label>
            </div>

            {/* Erro Geral */}
            {errors.root && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                <i className="fas fa-exclamation-triangle text-red-600 mt-0.5 mr-3"></i>
                <div>
                  <p className="text-red-800 font-medium">Erro ao cadastrar</p>
                  <p className="text-red-600 text-sm mt-1">{errors.root.message}</p>
                </div>
              </div>
            )}

            {/* Botões */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button 
                type="submit" 
                disabled={loading}
                className="flex-1 flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition duration-150 ease-in-out"
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Salvando...
                  </>
                ) : (
                  <>
                    <i className="fas fa-save mr-2"></i>
                    Criar Mantenedor
                  </>
                )}
              </button>
              
              <Link 
                href="/admin/mantenedores"
                className="flex-1 flex items-center justify-center px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition duration-150 ease-in-out"
              >
                <i className="fas fa-times mr-2"></i>
                Cancelar
              </Link>
            </div>
          </form>
        </div>

        {/* Rodapé */}
        <div className="text-center text-gray-500 text-sm mt-8 pb-4">
          <p>Lar Cooperativa Agroindustrial &copy; {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}