"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminDashboard() {
  const [sessionOk, setSessionOk] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/admin-session", { method: "GET", cache: "no-store" });
        if (response.ok) setSessionOk(true);
      } catch {
        setSessionOk(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function logout() {
    await fetch("/api/admin-session", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-spinner fa-spin text-green-600 text-xl"></i>
          </div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
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
          
          {sessionOk && (
            <button 
              onClick={logout}
              className="flex items-center justify-center px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition duration-150 ease-in-out"
            >
              <i className="fas fa-sign-out-alt mr-2"></i>
              Sair
            </button>
          )}
        </div>

        {/* Conteúdo Principal */}
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-user-shield text-green-600 text-2xl"></i>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Dashboard Admin (PCM)</h2>
            <p className="text-gray-600">Painel de controle e gestão</p>
          </div>

          {sessionOk ? (
            <div className="space-y-8">
              {/* Status de Sessão */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
                <i className="fas fa-check-circle text-green-600 text-xl mr-3"></i>
                <div>
                  <p className="font-medium text-green-800">Sessão válida</p>
                  <p className="text-green-600 text-sm">Bem-vindo ao painel administrativo</p>
                </div>
              </div>

              {/* Grid de Módulos */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Mantenedores */}
                <Link href="/admin/mantenedores">
                  <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition duration-150 ease-in-out cursor-pointer group">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4 group-hover:bg-blue-200 transition duration-150 ease-in-out">
                      <i className="fas fa-users-cog text-blue-600 text-xl"></i>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Mantenedores</h3>
                    <p className="text-gray-600 text-sm">Gerencie técnicos e mantenedores do sistema</p>
                    <div className="mt-4 text-blue-600 font-medium flex items-center">
                      Acessar <i className="fas fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform duration-150 ease-in-out"></i>
                    </div>
                  </div>
                </Link>

                {/* Templates */}
                <Link href="/admin/templates">
                  <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition duration-150 ease-in-out cursor-pointer group">
                    <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mb-4 group-hover:bg-purple-200 transition duration-150 ease-in-out">
                      <i className="fas fa-clipboard-list text-purple-600 text-xl"></i>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Templates</h3>
                    <p className="text-gray-600 text-sm">Modelos de checklists e formulários</p>
                    <div className="mt-4 text-purple-600 font-medium flex items-center">
                      Acessar <i className="fas fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform duration-150 ease-in-out"></i>
                    </div>
                  </div>
                </Link>

                {/* Máquinas */}
                <Link href="/admin/maquinas">
                  <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition duration-150 ease-in-out cursor-pointer group">
                    <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mb-4 group-hover:bg-orange-200 transition duration-150 ease-in-out">
                      <i className="fas fa-cogs text-orange-600 text-xl"></i>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Máquinas</h3>
                    <p className="text-gray-600 text-sm">Cadastro e gestão de equipamentos</p>
                    <div className="mt-4 text-orange-600 font-medium flex items-center">
                      Acessar <i className="fas fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform duration-150 ease-in-out"></i>
                    </div>
                  </div>
                </Link>

                {/* Não Conformidades */}
                <Link href="/admin/nao-conformidades">
                  <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition duration-150 ease-in-out cursor-pointer group">
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 group-hover:bg-red-200 transition duration-150 ease-in-out">
                      <i className="fas fa-exclamation-triangle text-red-600 text-xl"></i>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Não Conformidades</h3>
                    <p className="text-gray-600 text-sm">Visualize e gerencie inconformidades</p>
                    <div className="mt-4 text-red-600 font-medium flex items-center">
                      Acessar <i className="fas fa-arrow-right ml-2 group-hover:translate-x-1 transition-transform duration-150 ease-in-out"></i>
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-exclamation-circle text-red-600 text-2xl"></i>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Ops! Não autenticado</h3>
              <p className="text-gray-600 mb-6">Sua sessão expirou ou você não está autorizado</p>
              <Link 
                href="/admin/login"
                className="inline-flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition duration-150 ease-in-out"
              >
                <i className="fas fa-sign-in-alt mr-2"></i>
                Ir para login
              </Link>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="text-center text-gray-500 text-sm mt-8 pb-4">
          <p>Lar Cooperativa Agroindustrial &copy; {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}