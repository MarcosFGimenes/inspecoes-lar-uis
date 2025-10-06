"use client";
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    browserLocalPersistence,
    browserSessionPersistence,
    setPersistence,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { firebaseAuth } from "@/lib/firebase-client";

export default function AdminLoginPage() {
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
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
            await setPersistence(
                firebaseAuth,
                remember ? browserLocalPersistence : browserSessionPersistence,
            );

            const credentials = await signInWithEmailAndPassword(firebaseAuth, email, senha);
            const idToken = await credentials.user.getIdToken(true);

            const response = await fetch("/api/admin-session", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ idToken }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                const message = payload?.error ?? "Falha ao iniciar sessão.";
                await signOut(firebaseAuth);
                throw new Error(message);
            }

            setMessage("✅ Sessão criada. Redirecionando…");
            setTimeout(() => {
                router.push("/admin/dashboard");
            }, 1200);
        } catch (err: unknown) {
            await signOut(firebaseAuth).catch(() => undefined);
            if (err instanceof FirebaseError) {
                switch (err.code) {
                    case "auth/invalid-email":
                        setError("E-mail inválido.");
                        break;
                    case "auth/user-disabled":
                        setError("Usuário desativado.");
                        break;
                    case "auth/user-not-found":
                    case "auth/wrong-password":
                        setError("Credenciais inválidas.");
                        break;
                    default:
                        setError("Falha ao autenticar: " + err.message);
                        break;
                }
            } else if (err instanceof Error && err.message) {
                setError(err.message);
            } else {
                setError("Falha inesperada ao iniciar sessão. Tente novamente.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>Lar Cooperativa Agroindustrial - Acesso PCM</title>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
            </Head>

            <main className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-20">
                <div className="grid w-full gap-10 lg:grid-cols-[1.05fr_0.95fr]">
                    <section className="glass-card hidden flex-col justify-center gap-6 rounded-[36px] px-10 py-12 text-left lg:flex">
                        <span className="surface-pill text-xs font-semibold uppercase tracking-wide text-[var(--success)]">
                            <i className="fas fa-chart-line" aria-hidden />
                            Planejamento PCM
                        </span>
                        <h1 className="text-4xl font-semibold leading-tight text-[var(--text)]">
                            Administre inspeções e tratativas com precisão
                        </h1>
                        <p className="max-w-md text-base text-[var(--muted)]">
                            Valide assinaturas, acompanhe não conformidades e mantenha templates atualizados em um ambiente seguro.
                        </p>
                        <div className="muted-card space-y-2 text-sm text-[var(--muted)]">
                            <div className="flex items-center gap-3">
                                <span className="status-dot" style={{ background: "var(--success)" }} />
                                Gestão centralizada das inspeções concluídas
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="status-dot warning" />
                                Priorize NCs críticas com filtros inteligentes
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="status-dot" style={{ background: "var(--primary)" }} />
                                Assinatura digital integrada ao fluxo PCM
                            </div>
                        </div>
                    </section>

                    <section className="glass-card rounded-[32px] px-8 py-10 shadow-elevated">
                        <div className="text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--success)_22%,rgba(16,185,129,0.08)_78%)] text-2xl text-[var(--success)] shadow-[0_18px_36px_-22px_rgba(16,185,129,0.55)]">
                                <i className="fas fa-user-shield" aria-hidden />
                            </div>
                            <div className="mt-4 space-y-1">
                                <h2 className="text-2xl font-semibold text-[var(--text)]">Login — PCM</h2>
                                <p className="text-sm text-[var(--muted)]">Utilize seu e-mail corporativo e senha cadastrada para entrar.</p>
                            </div>
                        </div>

                        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                            <div className="space-y-2">
                                <label htmlFor="email" className="text-sm font-medium text-[var(--text)]">
                                    E-mail
                                </label>
                                <div className="relative">
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        required
                                        className="w-full rounded-2xl border border-[color-mix(in_srgb,var(--success)_18%,transparent_82%)] bg-[color-mix(in_srgb,var(--surface)_95%,rgba(255,255,255,0.85)_5%)] px-4 py-3 text-sm text-[var(--text)] shadow-[0_12px_32px_-24px_rgb(var(--shadow-color)/55%)] outline-none transition focus:border-[var(--success)] focus:shadow-ring"
                                        placeholder="seu.email@cooperativa.com.br"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                    />
                                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--hint)]">
                                        <i className="fas fa-envelope" aria-hidden />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="senha" className="text-sm font-medium text-[var(--text)]">
                                    Senha
                                </label>
                                <div className="relative">
                                    <input
                                        id="senha"
                                        name="senha"
                                        type="password"
                                        required
                                        className="w-full rounded-2xl border border-[color-mix(in_srgb,var(--success)_18%,transparent_82%)] bg-[color-mix(in_srgb,var(--surface)_95%,rgba(255,255,255,0.85)_5%)] px-4 py-3 text-sm text-[var(--text)] shadow-[0_12px_32px_-24px_rgb(var(--shadow-color)/55%)] outline-none transition focus:border-[var(--success)] focus:shadow-ring"
                                        placeholder="Digite sua senha"
                                        value={senha}
                                        onChange={e => setSenha(e.target.value)}
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
                                        className="h-4 w-4 rounded border-[color-mix(in_srgb,var(--success)_25%,transparent_75%)] text-[var(--success)] focus:ring-[var(--success)]"
                                        checked={remember}
                                        onChange={e => setRemember(e.target.checked)}
                                    />
                                    Manter sessão ativa
                                </label>
                                <a href="#" className="text-[var(--success)] transition hover:underline">
                                    Esqueceu a senha?
                                </a>
                            </div>

                            <button
                                type="submit"
                                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--success)] to-[color-mix(in_srgb,var(--success)_75%,rgba(5,150,105,1)_25%)] px-4 py-3 text-base font-semibold text-white shadow-[0_20px_38px_-24px_rgba(5,150,105,0.6)] transition hover:shadow-elevated disabled:cursor-not-allowed disabled:opacity-70"
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
                                <div className="rounded-2xl border border-[color-mix(in_srgb,var(--success)_32%,transparent_68%)] bg-[color-mix(in_srgb,var(--success)_12%,rgba(16,185,129,0.08)_88%)] px-4 py-3 text-center text-sm font-medium text-[var(--success)]">
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
                            <span>Precisa voltar?</span>
                            <Link href="/" className="font-medium text-[var(--success)] hover:underline">
                                Seleção de módulos
                            </Link>
                        </div>
                    </section>
                </div>
            </main>
        </>
    );
}
