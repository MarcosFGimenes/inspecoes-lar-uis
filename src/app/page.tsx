"use client";
import Head from "next/head";
import { Icon } from "@/components/icon";

export default function Home() {
    return (
        <>
            <Head>
                <title>Lar Cooperativa Agroindustrial- Sistema de Manutenção</title>
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
                .module-card {
                    transition: all 0.3s ease;
                }
                .module-card:hover {
                    transform: translateY(-5px);
                }
            `}</style>
            <main className="min-h-screen flex items-center justify-center p-4">
                <div className="max-w-lg w-full space-y-8">
                    {/* Cabeçalho */}
                    <div className="text-center">
                        <div className="flex items-center justify-center mb-4">
                            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center mr-3">
                                <Icon name="tools" className="text-white text-xl" />
                            </div>
                            <h1 className="text-3xl font-bold text-gray-900">Lar Cooperativa Agroindustrial</h1>
                        </div>
                        <h2 className="mt-2 text-2xl font-bold text-gray-900">Sistema de Inspeção de rota</h2>
                        <p className="mt-2 text-gray-600">Selecione o módulo que deseja acessar</p>
                    </div>

                    {/* Cards de Seleção de Módulo */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Card Mantenedor */}
                        <a href="/login" className="module-card block">
                            <div className="bg-white rounded-2xl card-shadow p-6 h-full border-l-4 border-blue-500 hover:border-blue-700">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                                        <Icon name="user-cog" className="text-blue-600 text-2xl" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Mantenedor</h3>
                                    <p className="text-gray-600 text-sm">Acesso para mantenedores</p>
                                    <div className="mt-4 text-blue-600 font-medium">
                                        Acessar <Icon name="arrow-right" className="ml-1" />
                                    </div>
                                </div>
                            </div>
                        </a>

                        {/* Card PCM */}
                        <a href="/admin/login" className="module-card block">
                            <div className="bg-white rounded-2xl card-shadow p-6 h-full border-l-4 border-green-500 hover:border-green-700">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                                        <Icon name="user-shield" className="text-green-600 text-2xl" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">PCM</h3>
                                    <p className="text-gray-600 text-sm">Acesso para planejamento e controle de manutenção</p>
                                    <div className="mt-4 text-green-600 font-medium">
                                        Acessar <Icon name="arrow-right" className="ml-1" />
                                    </div>
                                </div>
                            </div>
                        </a>
                    </div>

                    {/* Rodapé */}
                    <div className="text-center text-gray-500 text-sm mt-8">
                        <p>PCM - Lar Cooperativa Agroindustrial &copy; 2025</p>
                    </div>
                </div>
            </main>
        </>
    );
}