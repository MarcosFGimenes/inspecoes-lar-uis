"use client";

import { useState } from "react";

export default function MaintLoginPage() {
  const [matricula, setMatricula] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/maint/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricula, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha no login");
      setMsg("✅ Login OK. Redirecionando…");
      window.location.href = "/home";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setMsg("❌ " + message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3 border p-6 rounded-lg">
        <h1 className="text-xl font-semibold">Login — Mantenedor</h1>
        <input
          className="w-full border rounded p-2"
          placeholder="Matrícula"
          value={matricula}
          onChange={e => setMatricula(e.target.value)}
        />
        <input
          className="w-full border rounded p-2"
          placeholder="Senha"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button
          disabled={loading}
          className="w-full rounded bg-black text-white py-2 disabled:opacity-50"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </main>
  );
}
