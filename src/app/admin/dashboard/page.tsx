"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type NavigationItem = {
  href: string;
  title: string;
  description: string;
  icon: string;
  accentClass: string;
};

const navigationItems: NavigationItem[] = [
  {
    href: "/admin/nc",
    title: "Tratativas de NCs",
    description: "Priorize e acompanhe não conformidades",
    icon: "fas fa-exclamation-triangle",
    accentClass: "bg-red-100 text-red-600",
  },
  {
    href: "/admin/inspecoes/assinar",
    title: "Assinaturas pendentes",
    description: "Assine inspeções do PCM com destaque para NCs",
    icon: "fas fa-file-signature",
    accentClass: "bg-amber-100 text-amber-600",
  },
  {
    href: "/admin/templates",
    title: "Templates de checklist",
    description: "Mantenha os modelos de inspeção atualizados",
    icon: "fas fa-clipboard-list",
    accentClass: "bg-purple-100 text-purple-600",
  },
  {
    href: "/admin/maquinas",
    title: "Máquinas",
    description: "Gerencie cadastro e status dos equipamentos",
    icon: "fas fa-cogs",
    accentClass: "bg-blue-100 text-blue-600",
  },
  {
    href: "/admin/mantenedores",
    title: "Mantenedores",
    description: "Controle o acesso e as equipes de manutenção",
    icon: "fas fa-users-cog",
    accentClass: "bg-green-100 text-green-600",
  },
];

export default function AdminDashboard() {
  const [sessionOk, setSessionOk] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/admin-session", { method: "GET", cache: "no-store" });
        if (response.ok) setSessionOk(true);
      } catch {
        setSessionOk(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const footerYear = useMemo(() => new Date().getFullYear(), []);

  async function logout() {
    await fetch("/api/admin-session", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
        <header className="flex flex-col gap-6 border-b border-[var(--border)] pb-8 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-[var(--muted)] text-sm">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-white">
                <i className="fas fa-user-shield" aria-hidden />
              </span>
              <div>
                <p className="font-medium text-[var(--text)]">Dashboard do PCM</p>
                <p className="text-[var(--muted)]">Controle central das inspeções e ativos</p>
              </div>
            </div>
            <h1 className="text-3xl font-semibold text-[var(--text)]">Painel administrativo</h1>
          </div>

          {sessionOk && (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
                <i className="fas fa-check-circle" aria-hidden />
                Sessão validada
              </span>
              <Button variant="destructive" onClick={logout} type="button">
                <i className="fas fa-sign-out-alt" aria-hidden />
                Sair
              </Button>
            </div>
          )}
        </header>

        {loading ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--primary)]">
                <i className="fas fa-spinner fa-spin" aria-hidden />
              </span>
              <p className="text-sm text-[var(--muted)]">Validando sessão do PCM...</p>
            </CardContent>
          </Card>
        ) : sessionOk ? (
          <div className="space-y-8">
            <section>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text)]">Acesso rápido</h2>
                  <p className="text-sm text-[var(--muted)]">Principais rotinas do PCM em um só lugar</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href="/admin/nc" className={buttonStyles({ variant: "secondary" })}>
                    <i className="fas fa-exclamation-circle" aria-hidden />
                    Abrir tratativas
                  </Link>
                  <Link href="/admin/inspecoes/assinar" className={buttonStyles()}>
                    <i className="fas fa-pen-fancy" aria-hidden />
                    Assinar inspeções
                  </Link>
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {navigationItems.map(item => (
                  <Link key={item.href} href={item.href} className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2">
                    <Card className="h-full transition-all duration-150 group-hover:border-[var(--primary)] group-hover:shadow-md">
                      <CardHeader className="flex flex-row items-start gap-4 pb-4">
                        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${item.accentClass}`}>
                          <i className={item.icon} aria-hidden />
                        </span>
                        <div>
                          <CardTitle className="text-lg font-semibold text-[var(--text)]">{item.title}</CardTitle>
                          <CardDescription>{item.description}</CardDescription>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-[var(--primary)]">
                          Acessar painel
                          <i className="fas fa-arrow-right transition-transform duration-150 group-hover:translate-x-1" aria-hidden />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <Card>
                <CardHeader>
                  <CardTitle>Orientações</CardTitle>
                  <CardDescription>
                    Utilize os atalhos acima para cuidar das não conformidades, assinaturas e cadastro de ativos.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--muted)]">
                    <li>
                      Priorize inspeções com pendências em <strong>Tratativas de NCs</strong> para reduzir riscos operacionais.
                    </li>
                    <li>
                      Centralize as assinaturas da PCM no módulo <strong>Assinaturas pendentes</strong> para acelerar liberações.
                    </li>
                    <li>
                      Atualize templates, máquinas e equipes diretamente nos respectivos painéis conforme necessário.
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </section>
          </div>
        ) : (
          <Card>
            <CardHeader className="items-center text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                <i className="fas fa-exclamation-circle" aria-hidden />
              </span>
              <CardTitle className="text-xl">Sessão expirada</CardTitle>
              <CardDescription>Faça login novamente para acessar o painel administrativo.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-8">
              <Link href="/admin/login" className={buttonStyles()}>
                <i className="fas fa-sign-in-alt" aria-hidden />
                Ir para login
              </Link>
            </CardContent>
          </Card>
        )}

        <footer className="border-t border-[var(--border)] pt-6 text-center text-sm text-[var(--muted)]">
          Lar Cooperativa Agroindustrial &copy; {footerYear}
        </footer>
      </div>
    </div>
  );
}