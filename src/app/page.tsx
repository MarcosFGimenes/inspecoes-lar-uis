"use client";

import Head from "next/head";
import Link from "next/link";

const modules = [
  {
    href: "/login",
    title: "Mantenedor",
    description: "Acesso dedicado à execução das inspeções de rota",
    icon: "fas fa-user-cog",
    accent: "bg-[color-mix(in_srgb,var(--primary)_16%,rgba(37,99,235,0.08)_84%)] text-[var(--primary)]",
    border: "border-[color-mix(in_srgb,var(--primary)_25%,transparent_75%)]",
  },
  {
    href: "/admin/login",
    title: "PCM",
    description: "Gestão completa de inspeções, ativos e tratativas",
    icon: "fas fa-user-shield",
    accent: "bg-[color-mix(in_srgb,var(--success)_20%,rgba(16,185,129,0.08)_80%)] text-[var(--success)]",
    border: "border-[color-mix(in_srgb,var(--success)_25%,transparent_75%)]",
  },
];

export default function Home() {
  return (
    <>
      <Head>
        <title>Lar Cooperativa Agroindustrial — Sistema de Inspeções</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </Head>

      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-12 px-6 py-20">
        <section className="glass-card relative w-full rounded-[34px] px-10 py-12 text-center">
          <span className="absolute left-10 top-8 inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--surface)_88%,rgba(37,99,235,0.12)_12%)] px-4 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
            <i className="fas fa-circle-dot" aria-hidden />
            Sistema integrado
          </span>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_20%,rgba(37,99,235,0.08)_80%)] text-2xl text-[var(--primary)] shadow-[0_18px_40px_-24px_rgba(37,99,235,0.6)]">
            <i className="fas fa-tools" aria-hidden />
          </div>
          <div className="mt-6 space-y-3">
            <h1 className="text-4xl font-semibold leading-tight text-[var(--text)] sm:text-5xl">
              Lar Cooperativa Agroindustrial
            </h1>
            <p className="text-base text-[var(--muted)] sm:text-lg">
              Escolha o módulo para iniciar ou administrar as inspeções de rota da Unidade Industrial de Soja.
            </p>
          </div>
        </section>

        <section className="grid w-full gap-6 sm:grid-cols-2">
          {modules.map(module => (
            <Link
              key={module.href}
              href={module.href}
              className="group h-full"
            >
              <article className={`glass-card flex h-full flex-col items-center gap-5 rounded-[28px] border px-8 py-10 text-center transition duration-200 hover:-translate-y-1 hover:shadow-elevated ${module.border}`}>
                <span className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl text-2xl shadow-[0_16px_32px_-22px_rgba(15,23,42,0.35)] ${module.accent}`}>
                  <i className={module.icon} aria-hidden />
                </span>
                <div className="space-y-2">
                  <h3 className="text-2xl font-semibold text-[var(--text)]">{module.title}</h3>
                  <p className="text-sm text-[var(--muted)]">{module.description}</p>
                </div>
                <span className="surface-pill text-sm text-[var(--text)]">
                  Acessar módulo
                  <i className="fas fa-arrow-right text-[var(--primary)]" aria-hidden />
                </span>
              </article>
            </Link>
          ))}
        </section>

        <footer className="text-center text-sm text-[var(--muted)]">
          <p>PCM — Lar Cooperativa Agroindustrial &copy; {new Date().getFullYear()}</p>
        </footer>
      </main>
    </>
  );
}