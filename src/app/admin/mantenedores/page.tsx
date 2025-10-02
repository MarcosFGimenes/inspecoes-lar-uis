"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Maintainer = {
  id: string;
  matricula: string;
  nome: string;
  setor: string;
  lac: string;
  ativo: boolean;
};

export default function MantenedoresPage() {
  const [data, setData] = useState<Maintainer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin-session").then(r => {
      if (r.status === 401) window.location.href = "/admin/login";
    });
    fetch("/api/mantenedores").then(async r => {
      if (r.ok) {
        const payload = (await r.json()) as Maintainer[];
        setData(payload);
      }
      setLoading(false);
    });
  }, []);

  const filtered = data.filter(m =>
    m.matricula.includes(q) || m.nome.toLowerCase().includes(q.toLowerCase())
  );

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
          
          <Link 
            href="/admin/dashboard"
            className="flex items-center justify-center px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition duration-150 ease-in-out"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Voltar ao Dashboard
          </Link>
        </div>

        {/* Conteúdo Principal */}
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
            <div className="mb-4 md:mb-0">
              <div className="flex items-center mb-2">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                  <i className="fas fa-users-cog text-blue-600"></i>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Mantenedores</h2>
              </div>
              <p className="text-gray-600">Gerencie técnicos e mantenedores do sistema</p>
            </div>
            
            <Link href="/admin/mantenedores/new">
              <button className="flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition duration-150 ease-in-out">
                <i className="fas fa-plus mr-2"></i>
                Novo Mantenedor
              </button>
            </Link>
          </div>

          {/* Barra de Busca */}
          <div className="relative mb-6">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i className="fas fa-search text-gray-400"></i>
            </div>
            <input
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
              placeholder="Buscar por matrícula ou nome..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-spinner fa-spin text-blue-600 text-xl"></i>
              </div>
              <p className="text-gray-600">Carregando mantenedores...</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Matrícula
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Setor
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      LAC
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filtered.map((m, index) => (
                    <tr 
                      key={m.id} 
                      className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{m.matricula}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{m.nome}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{m.setor}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{m.lac}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          m.ativo 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {m.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          href={`/admin/mantenedores/${m.id}/machines`}
                          className="inline-flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition duration-150 ease-in-out"
                        >
                          <i className="fas fa-cogs mr-1"></i>
                          Gerenciar Máquinas
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filtered.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-users text-gray-400 text-xl"></i>
                  </div>
                  <p className="text-gray-500 mb-2">Nenhum mantenedor encontrado</p>
                  <p className="text-gray-400 text-sm">
                    {q ? 'Tente ajustar os termos da busca' : 'Cadastre o primeiro mantenedor'}
                  </p>
                </div>
              )}
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