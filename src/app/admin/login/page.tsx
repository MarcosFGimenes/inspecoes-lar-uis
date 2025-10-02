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
import { Icon } from "@/components/icon";

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
                <title>Unidade Industrial de Soja - Admin PCM</title>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            </Head>
            <style jsx global>{`
                body {
                    font-family: 'Inter', sans-serif;
                    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
                }
                .card-shadow {
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                .btn-primary {
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    transition: all 0.3s ease;
                }
                .btn-primary:hover:not(:disabled) {
                    opacity: 0.9;
                    transform: translateY(-1px);
                }
            `}</style>
            <main className="min-h-screen flex items-center justify-center p-4">
                <div className="max-w-md w-full">
                    {/* Cabeçalho */}
                    <div className="text-center mb-8">
                        <div className="flex items-center justify-center mb-4">
                            <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center mr-3">
                                <Icon name="tractor" className="text-white text-xl" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900">Unidade Indsutrial de Soja</h1>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-700">Sistema de Inspeção de Rotas</h2>
                    </div>

                    {/* Card de Login */}
                    <div className="bg-white rounded-2xl card-shadow p-8">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                                <Icon name="user-shield" className="text-green-600 text-2xl" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">Login — Admin (PCM)</h3>
                            <p className="text-gray-600 mt-2">Acesso para planejamento e controle de manutenção</p>
                        </div>

                        <form className="space-y-5" onSubmit={handleSubmit}>
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">E-mail</label>
                                <div className="relative">
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-150 ease-in-out"
                                        placeholder="seu.email@cooperativa.com.br"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                    />
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                        <Icon name="envelope" className="text-gray-400" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="senha" className="block text-sm font-medium text-gray-700 mb-2">Senha</label>
                                <div className="relative">
                                    <input
                                        id="senha"
                                        name="senha"
                                        type="password"
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition duration-150 ease-in-out"
                                        placeholder="Digite sua senha"
                                        value={senha}
                                        onChange={e => setSenha(e.target.value)}
                                    />
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                        <Icon name="lock" className="text-gray-400" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <input
                                        id="remember"
                                        name="remember"
                                        type="checkbox"
                                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                                        checked={remember}
                                        onChange={e => setRemember(e.target.checked)}
                                    />
                                    <label htmlFor="remember" className="ml-2 block text-sm text-gray-700">
                                        Lembrar de mim
                                    </label>
                                </div>
                                <a href="#" className="text-sm font-medium text-green-600 hover:text-green-500 transition duration-150 ease-in-out">
                                    Esqueceu a senha?
                                </a>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-3 px-4 rounded-lg text-white font-medium btn-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 ease-in-out"
                                disabled={loading}
                            >
                                {!loading && <span>Entrar</span>}
                                {loading && (
                                    <span>
                                        <Icon name="spinner" spin className="mr-2" /> Entrando...
                                    </span>
                                )}
                            </button>

                            {message && (
                                <div className="text-center text-sm mt-4 text-green-600">{message}</div>
                            )}
                            {error && (
                                <div className="text-center text-sm mt-4 text-red-600">{error}</div>
                            )}
                        </form>

                        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
                            <p className="text-sm text-gray-600">
                                Voltar para
                                <Link href="/" className="font-medium text-green-600 hover:text-green-500 ml-1 transition duration-150 ease-in-out">
                                    seleção de módulos
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </>
    );
}
