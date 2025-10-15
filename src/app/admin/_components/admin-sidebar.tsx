"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";

import { Button, buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface AdminNavItem {
  href: string;
  label: string;
  icon: string;
}

const navItems: AdminNavItem[] = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
    icon: "fas fa-gauge-high",
  },
  {
    href: "/admin/inspecoes",
    label: "Inspeções",
    icon: "fas fa-clipboard-check",
  },
  {
    href: "/admin/inspecoes/assinar",
    label: "Assinaturas",
    icon: "fas fa-file-signature",
  },
  {
    href: "/admin/programacao",
    label: "Programação",
    icon: "fas fa-calendar-check",
  },
  {
    href: "/admin/nc",
    label: "Tratativas",
    icon: "fas fa-exclamation-triangle",
  },
  {
    href: "/admin/checklists",
    label: "Checklists",
    icon: "fas fa-list-check",
  },
  {
    href: "/admin/templates",
    label: "Templates",
    icon: "fas fa-clipboard-list",
  },
  {
    href: "/admin/maquinas",
    label: "Máquinas",
    icon: "fas fa-cogs",
  },
  {
    href: "/admin/mantenedores",
    label: "Mantenedores",
    icon: "fas fa-users-cog",
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const showSessionActions = pathname !== "/admin/login";

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/admin-session", { method: "DELETE" });
    } catch (error) {
      console.error("Erro ao encerrar sessão", error);
    } finally {
      setLoggingOut(false);
      window.location.href = "/admin/login";
    }
  }, [loggingOut]);

  const isActive = useCallback(
    (href: string) => pathname === href || pathname.startsWith(`${href}/`),
    [pathname]
  );

  return (
    <>
      <nav className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,rgba(255,255,255,0.85)_8%)] px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between">
          <Link href="/admin/dashboard" className="flex items-center gap-3 text-sm font-semibold text-[var(--text)]">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--primary)] text-white shadow-[0_18px_36px_-22px_rgba(37,99,235,0.45)]">
              <i className="fas fa-shield-halved" aria-hidden />
            </span>
            <span>
              <span className="block text-xs uppercase tracking-wide text-[var(--muted)]">PCM</span>
              <span>Painel administrativo</span>
            </span>
          </Link>
          {showSessionActions ? (
            <Button type="button" variant="outline" size="sm" onClick={handleLogout} loading={loggingOut}>
              <i className="fas fa-arrow-right-from-bracket" aria-hidden />
              Sair
            </Button>
          ) : (
            <Link
              href="/admin/login"
              className={buttonStyles({ variant: "outline", size: "sm", className: "gap-2" })}
            >
              <i className="fas fa-arrow-right-to-bracket" aria-hidden />
              Entrar
            </Link>
          )}
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {navItems.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={buttonStyles({
                  variant: active ? "default" : "outline",
                  size: "sm",
                  className: cn(
                    "min-w-fit rounded-2xl border border-[color-mix(in_srgb,var(--border)_80%,transparent_20%)] px-4",
                    active ? "shadow-elevated" : "text-[var(--muted)]"
                  ),
                })}
              >
                <i className={cn(item.icon, "text-sm")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <aside className="sticky top-0 hidden max-h-screen w-full flex-shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,rgba(255,255,255,0.9)_6%)] px-4 py-6 backdrop-blur-lg md:flex md:w-60 md:flex-col lg:w-72">
        <div className="flex items-center gap-3 px-2">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary)] text-white shadow-[0_18px_36px_-22px_rgba(37,99,235,0.45)]">
            <i className="fas fa-shield-halved" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">PCM</p>
            <p className="text-base font-semibold text-[var(--text)]">Painel administrativo</p>
          </div>
        </div>

        <nav className="mt-8 flex-1 space-y-1">
          {navItems.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-2 text-sm font-medium transition",
                  active
                    ? "bg-[var(--primary)] text-white shadow-[0_18px_36px_-22px_rgba(37,99,235,0.45)]"
                    : "text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--surface)_88%,rgba(148,163,184,0.16)_12%)] hover:text-[var(--text)]"
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.16)_8%)] text-[color-mix(in_srgb,var(--primary)_65%,rgba(37,99,235,0.4)_35%)]">
                  <i className={cn(item.icon, "text-sm")} aria-hidden />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 px-2">
          <Link
            href="/admin/inspecoes"
            className={buttonStyles({
              variant: "secondary",
              className: "w-full justify-center gap-2",
            })}
          >
            <i className="fas fa-magnifying-glass-chart" aria-hidden />
            Ver inspeções
          </Link>
          {showSessionActions ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleLogout}
              loading={loggingOut}
            >
              <i className="fas fa-arrow-right-from-bracket" aria-hidden />
              Encerrar sessão
            </Button>
          ) : (
            <Link
              href="/admin/login"
              className={buttonStyles({
                className: "w-full justify-center gap-2",
              })}
            >
              <i className="fas fa-arrow-right-to-bracket" aria-hidden />
              Acessar painel
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}

export default AdminSidebar;
