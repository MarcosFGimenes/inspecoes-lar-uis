"use client";

import { useEffect, useState } from "react";

export default function HomeMaint() {
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/maint/me", { cache: "no-store" });
        if (r.ok) setInfo(await r.json());
      } catch {}
    })();
  }, []);

  async function logout() {
    await fetch("/api/auth/maint/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Home — Mantenedor</h1>
      {info?.ok ? (
        <div className="space-y-2">
          <p>✅ Sessão ativa para: <b>{info.store?.nome}</b> (matrícula {info.store?.matricula})</p>
          <button onClick={logout} className="rounded bg-black text-white px-4 py-2">
            Sair
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p>⚠️ Não autenticado.</p>
          <a className="text-blue-600 underline" href="/login">Ir para login</a>
        </div>
      )}
    </main>
  );
}
