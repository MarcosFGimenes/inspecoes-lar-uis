"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminDashboard() {
  const [sessionOk, setSessionOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/admin-session", { method: "GET", cache: "no-store" });
        if (response.ok) setSessionOk(true);
      } catch {
        setSessionOk(false);
      }
    })();
  }, []);

  async function logout() {
    await fetch("/api/admin-session", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Dashboard Admin (PCM)</h1>
      {sessionOk ? (
        <div className="space-y-3">
          <p>Bem-vindo! Sessao valida.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/mantenedores">
              <button className="rounded bg-black text-white px-4 py-2">Mantenedores</button>
            </Link>
            <Link href="/admin/mantenedores/new">
              <button className="rounded bg-black text-white px-4 py-2">Novo mantenedor</button>
            </Link>
            <Link href="/admin/templates">
              <button className="rounded bg-black text-white px-4 py-2">Templates</button>
            </Link>
            <Link href="/admin/templates/new">
              <button className="rounded bg-black text-white px-4 py-2">Novo template</button>
            </Link>
            <Link href="/admin/maquinas">
              <button className="rounded bg-black text-white px-4 py-2">Maquinas</button>
            </Link>
            <Link href="/admin/maquinas/new">
              <button className="rounded bg-black text-white px-4 py-2">Nova maquina</button>
            </Link>
            <button onClick={logout} className="rounded bg-black text-white px-4 py-2">
              Sair
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p>Ops! Nao autenticado.</p>
          <a className="text-blue-600 underline" href="/admin/login">
            Ir para login
          </a>
        </div>
      )}
    </main>
  );
}
