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
                <title>Lar Cooperativa Agroindustrial - Sistema de Inspeção</title>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
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
                    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
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
                            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center mr-3">
                                <i className="fas fa-tractor text-white text-xl"></i>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900">Unidade Indsutrial de Soja</h1>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-700">Sistema de Inspeção de Rotas</h2>
                    </div>

                    {/* Card de Login */}
                    <div className="bg-white rounded-2xl card-shadow p-8">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                                <i className="fas fa-user-cog text-blue-600 text-2xl"></i>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">Login — Mantenedor</h3>
                            <p className="text-gray-600 mt-2">Acesso para mantenedores</p>
                        </div>

                        <form className="space-y-5" onSubmit={handleSubmit}>
                            <div>
                                <label htmlFor="matricula" className="block text-sm font-medium text-gray-700 mb-2">Matrícula</label>
                                <div className="relative">
                                    <input
                                        id="matricula"
                                        name="matricula"
                                        type="text"
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
                                        placeholder="Digite sua matrícula"
                                        value={matricula}
                                        onChange={e => setMatricula(e.target.value)}
                                    />
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                        <i className="fas fa-id-card text-gray-400"></i>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Senha</label>
                                <div className="relative">
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        required
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out"
                                        placeholder="Digite sua senha"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                    />
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                        <i className="fas fa-lock text-gray-400"></i>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <input
                                        id="remember"
                                        name="remember"
                                        type="checkbox"
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                        checked={remember}
                                        onChange={e => setRemember(e.target.checked)}
                                    />
                                    <label htmlFor="remember" className="ml-2 block text-sm text-gray-700">
                                        Lembrar de mim
                                    </label>
                                </div>
                                <a href="#" className="text-sm font-medium text-blue-600 hover:text-blue-500 transition duration-150 ease-in-out">
                                    Esqueceu a senha?
                                </a>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-3 px-4 rounded-lg text-white font-medium btn-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
                                disabled={loading}
                            >
                                {!loading && <span>Entrar</span>}
                                {loading && (
                                    <span>
                                        <i className="fas fa-spinner fa-spin mr-2"></i> Entrando...
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
                                <Link href="/" className="font-medium text-blue-600 hover:text-blue-500 ml-1 transition duration-150 ease-in-out">
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
