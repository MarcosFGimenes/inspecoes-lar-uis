import Head from "next/head";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [remember, setRemember] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage("");
        // Simular requisição de login
        setTimeout(() => {
            setMessage("✅ Sessão criada. Redirecionando…");
            setLoading(false);
            setTimeout(() => {
                router.push("/admin/dashboard");
            }, 1500);
        }, 2000);
    };

    return (
        <>
            <Head>
                <title>Unidade Industrial de Soja - Admin PCM</title>
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
                                <i className="fas fa-tractor text-white text-xl"></i>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900">Unidade Indsutrial de Soja</h1>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-700">Sistema de Inspeção de Rotas</h2>
                    </div>

                    {/* Card de Login */}
                    <div className="bg-white rounded-2xl card-shadow p-8">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                                <i className="fas fa-user-shield text-green-600 text-2xl"></i>
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
                                        <i className="fas fa-envelope text-gray-400"></i>
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
                                        <i className="fas fa-spinner fa-spin mr-2"></i> Entrando...
                                    </span>
                                )}
                            </button>

                            {message && (
                                <div className="text-center text-sm mt-4 text-green-600">{message}</div>
                            )}
                        </form>

                        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
                            <p className="text-sm text-gray-600">
                                Voltar para
                                <a href="/" className="font-medium text-green-600 hover:text-green-500 ml-1 transition duration-150 ease-in-out">
                                    seleção de módulos
                                </a>
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </>
    );
}