
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function AdminDashboard() {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin-session", { method: "GET", cache: "no-store" });
        if (r.ok) setOk(true);
      } catch {}
    })();
  }, []);

  async function logout() {
    await fetch("/api/admin-session", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Dashboard — Admin (PCM)</h1>
      {ok ? (
        <div className="space-y-2">
          <p>✅ Sessão válida.</p>
          <div className="flex gap-2">
            <Link href="/admin/mantenedores">
              <button className="rounded bg-black text-white px-4 py-2">Mantenedores</button>
            </Link>
            <Link href="/admin/mantenedores/new">
              <button className="rounded bg-black text-white px-4 py-2">Novo mantenedor</button>
            </Link>
            <button onClick={logout} className="rounded bg-black text-white px-4 py-2">Sair</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p>⚠️ Não autenticado.</p>
          <a className="text-blue-600 underline" href="/admin/login">Ir para login</a>
        </div>
      )}
    </main>
  );
}
