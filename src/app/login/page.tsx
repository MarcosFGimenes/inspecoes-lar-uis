"use client";
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [matricula, setMatricula] = useState("");
    const [password, setPassword] = useState("");
    const [remember, setRemember] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage("");
        setError("");

        try {
            const response = await fetch("/api/auth/maint/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ matricula, password }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                const message = payload?.error ?? "Falha ao realizar login.";
                throw new Error(message);
            }

            setMessage("✅ Login OK. Redirecionando…");
            setTimeout(() => {
                router.push("/home");
            }, 1200);
        } catch (err: unknown) {
            if (err instanceof Error && err.message) {
                setError(err.message);
            } else {
                setError("Falha inesperada ao realizar login. Tente novamente.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>Lar Cooperativa Agroindustrial - Acesso do Mantenedor</title>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
            </Head>

            <main className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-20">
                <div className="grid w-full gap-10 lg:grid-cols-[1.1fr_0.9fr]">
                    <section className="glass-card hidden flex-col justify-center gap-6 rounded-[36px] px-10 py-12 text-left lg:flex">
                        <span className="surface-pill text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                            <i className="fas fa-route" aria-hidden />
                            Inspeções de rota
                        </span>
                        <h1 className="text-4xl font-semibold leading-tight text-[var(--text)]">
                            Conecte-se ao painel do mantenedor
                        </h1>
                        <p className="max-w-md text-base text-[var(--muted)]">
                            Acompanhe as rotas planejadas, registre inspeções com fotos e mantenha o histórico sempre disponível.
                        </p>
                        <div className="muted-card space-y-2 text-sm text-[var(--muted)]">
                            <div className="flex items-center gap-3">
                                <span className="status-dot success" />
                                Sincronização automática com o PCM
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="status-dot warning" />
                                Alertas instantâneos de não conformidades
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="status-dot" style={{ background: "var(--primary)" }} />
                                Checklist inteligente por máquina
                            </div>
                        </div>
                    </section>

                    <section className="glass-card rounded-[32px] px-8 py-10 shadow-elevated">
                        <div className="text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_20%,rgba(37,99,235,0.08)_80%)] text-2xl text-[var(--primary)] shadow-[0_18px_36px_-22px_rgba(37,99,235,0.5)]">
                                <i className="fas fa-user-cog" aria-hidden />
                            </div>
                            <div className="mt-4 space-y-1">
                                <h2 className="text-2xl font-semibold text-[var(--text)]">Login do mantenedor</h2>
                                <p className="text-sm text-[var(--muted)]">Acesse com sua matrícula e senha fornecidas pelo PCM.</p>
                            </div>
                        </div>

                        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                            <div className="space-y-2">
                                <label htmlFor="matricula" className="text-sm font-medium text-[var(--text)]">
                                    Matrícula
                                </label>
                                <div className="relative">
                                    <input
                                        id="matricula"
                                        name="matricula"
                                        type="text"
                                        required
                                        className="w-full rounded-2xl border border-[color-mix(in_srgb,var(--primary)_15%,transparent_85%)] bg-[color-mix(in_srgb,var(--surface)_95%,rgba(255,255,255,0.85)_5%)] px-4 py-3 text-sm text-[var(--text)] shadow-[0_12px_32px_-24px_rgb(var(--shadow-color)/55%)] outline-none transition focus:border-[var(--primary)] focus:shadow-ring"
                                        placeholder="Digite sua matrícula"
                                        value={matricula}
                                        onChange={e => setMatricula(e.target.value)}
                                    />
                                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--hint)]">
                                        <i className="fas fa-id-card" aria-hidden />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="password" className="text-sm font-medium text-[var(--text)]">
                                    Senha
                                </label>
                                <div className="relative">
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        required
                                        className="w-full rounded-2xl border border-[color-mix(in_srgb,var(--primary)_15%,transparent_85%)] bg-[color-mix(in_srgb,var(--surface)_95%,rgba(255,255,255,0.85)_5%)] px-4 py-3 text-sm text-[var(--text)] shadow-[0_12px_32px_-24px_rgb(var(--shadow-color)/55%)] outline-none transition focus:border-[var(--primary)] focus:shadow-ring"
                                        placeholder="Digite sua senha"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                    />
                                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--hint)]">
                                        <i className="fas fa-lock" aria-hidden />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
                                <label className="inline-flex items-center gap-2 text-[var(--text)]">
                                    <input
                                        id="remember"
                                        name="remember"
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-[color-mix(in_srgb,var(--primary)_20%,transparent_80%)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                        checked={remember}
                                        onChange={e => setRemember(e.target.checked)}
                                    />
                                    Lembrar de mim
                                </label>
                                <a href="#" className="text-[var(--primary)] transition hover:underline">
                                    Esqueceu a senha?
                                </a>
                            </div>

                            <button
                                type="submit"
                                className="floating-action flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-70"
                                disabled={loading}
                            >
                                {!loading && <span>Entrar</span>}
                                {loading && (
                                    <span className="flex items-center gap-2">
                                        <i className="fas fa-spinner fa-spin" aria-hidden /> Entrando...
                                    </span>
                                )}
                            </button>

                            {message && (
                                <div className="rounded-2xl border border-[color-mix(in_srgb,var(--success)_30%,transparent_70%)] bg-[color-mix(in_srgb,var(--success)_12%,rgba(16,185,129,0.08)_88%)] px-4 py-3 text-center text-sm font-medium text-[var(--success)]">
                                    {message}
                                </div>
                            )}
                            {error && (
                                <div className="rounded-2xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent_65%)] bg-[color-mix(in_srgb,var(--danger)_12%,rgba(220,38,38,0.08)_88%)] px-4 py-3 text-center text-sm font-medium text-[var(--danger)]">
                                    {error}
                                </div>
                            )}
                        </form>

                        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
                            <span>Preferir outro módulo?</span>
                            <Link href="/" className="font-medium text-[var(--primary)] hover:underline">
                                Voltar à seleção
                            </Link>
                        </div>
                    </section>
                </div>
            </main>
        </>
    );
}
