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
    label: "Relatórios",
    icon: "fas fa-list-check",
  },
  {
    href: "/admin/templates",
    label: "Cadastrar Inspeção",
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

const programacaoSubnav: AdminNavItem[] = [
  {
    href: "/admin/programacao",
    label: "Resumo e upload",
    icon: "fas fa-database",
  },
  {
    href: "/admin/programacao/detalhes",
    label: "Detalhamento",
    icon: "fas fa-clipboard-list",
  },
  {
    href: "/admin/programacao/kpis",
    label: "KPIs",
    icon: "fas fa-chart-line",
  },
  {
    href: "/admin/programacao/corretivas",
    label: "Corretivas",
    icon: "fas fa-screwdriver-wrench",
  },
];

interface AdminSidebarProps {
  open: boolean;
  onClose?: () => void;
  onNavigate?: () => void;
}

export function AdminSidebar({ open, onClose, onNavigate }: AdminSidebarProps) {
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
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-shrink-0 transform flex-col overflow-y-auto border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,rgba(255,255,255,0.9)_6%)] px-4 py-6 backdrop-blur-lg transition-transform duration-300 md:w-60 lg:w-72",
        open ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"
      )}
      aria-hidden={!open}
    >
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
                onClick={onNavigate}
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

        {pathname.startsWith("/admin/programacao") ? (
          <div className="mt-6 space-y-2">
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Programação
            </p>
            <div className="space-y-1">
              {programacaoSubnav.map(item => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-2 text-sm transition",
                      active
                        ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                        : "text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--surface)_88%,rgba(148,163,184,0.16)_12%)] hover:text-[var(--text)]",
                    )}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--surface)_92%,rgba(148,163,184,0.16)_8%)]">
                      <i className={cn(item.icon, "text-[13px]")} aria-hidden />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-auto space-y-2 px-2">
          <Link
            href="/admin/inspecoes"
            onClick={onNavigate}
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
              onClick={onNavigate}
              className={buttonStyles({
                className: "w-full justify-center gap-2",
              })}
            >
              <i className="fas fa-arrow-right-to-bracket" aria-hidden />
              Acessar painel
            </Link>
          )}
        </div>
      <button
        type="button"
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--border)_75%,transparent_25%)] bg-[color-mix(in_srgb,var(--surface)_96%,rgba(148,163,184,0.12)_4%)] text-[var(--muted)] transition hover:text-[var(--text)] lg:hidden"
        onClick={() => onClose?.()}
        aria-label="Fechar menu"
      >
        <i className="fas fa-xmark" aria-hidden />
      </button>
    </aside>
  );
}

export default AdminSidebar;
