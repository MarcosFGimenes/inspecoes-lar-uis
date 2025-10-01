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
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Mantenedores</h1>
        <Link href="/admin/mantenedores/new">
          <button className="rounded bg-black text-white px-4 py-2">Novo mantenedor</button>
        </Link>
      </div>
      <input
        className="border rounded p-2 w-full mb-4"
        placeholder="Buscar por matrícula ou nome"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      {loading ? (
        <div>Carregando...</div>
      ) : (
        <table className="w-full border">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2">Matrícula</th>
              <th className="p-2">Nome</th>
              <th className="p-2">Setor</th>
              <th className="p-2">LAC</th>
              <th className="p-2">Ativo</th>
              <th className="p-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id} className="border-t">
                <td className="p-2">{m.matricula}</td>
                <td className="p-2">{m.nome}</td>
                <td className="p-2">{m.setor}</td>
                <td className="p-2">{m.lac}</td>
                <td className="p-2">{m.ativo ? "Sim" : "Não"}</td>
                <td className="p-2">
                  <div className="flex justify-end">
                    <Link
                      href={`/admin/mantenedores/${m.id}/machines`}
                      className="rounded bg-blue-600 text-white px-3 py-1 text-sm hover:bg-blue-700"
                    >
                      Gerenciar máquinas
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
