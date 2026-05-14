"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { AdminReadCounterProvider } from "@/lib/admin-read-counter";

import AdminSidebar from "./_components/admin-sidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setSidebarOpen(media.matches);
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
    };
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const handleNavigate = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    setSidebarOpen(false);
  }, []);

  return (
    <AdminReadCounterProvider>
      <div className="relative min-h-screen bg-[var(--surface)]">
        <AdminSidebar open={sidebarOpen} onClose={closeSidebar} onNavigate={handleNavigate} />

        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/35 backdrop-blur-sm lg:hidden"
            onClick={closeSidebar}
            aria-label="Fechar menu lateral"
          />
        )}

        <div
          className={cn(
            "relative min-h-screen transition-[margin] duration-300",
            sidebarOpen ? "lg:ml-72 md:ml-60" : "lg:ml-0 md:ml-0"
          )}
        >
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,rgba(255,255,255,0.85)_8%)] px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full border-[color-mix(in_srgb,var(--border)_80%,transparent_20%)]"
                onClick={toggleSidebar}
              >
                <i className={cn("fas", sidebarOpen ? "fa-xmark" : "fa-bars")} aria-hidden />
                <span className="sr-only">Alternar menu</span>
              </Button>
              <Link href="/admin/dashboard" className="flex items-center gap-3 text-sm font-semibold text-[var(--text)]">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--primary)] text-white shadow-[0_18px_36px_-22px_rgba(37,99,235,0.45)]">
                  <i className="fas fa-shield-halved" aria-hidden />
                </span>
                <span className="hidden flex-col text-left leading-tight sm:flex">
                  <span className="text-xs uppercase tracking-wide text-[var(--muted)]">PCM</span>
                  <span>Painel administrativo</span>
                </span>
              </Link>
            </div>
          </header>

          <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10">{children}</main>
        </div>
      </div>
    </AdminReadCounterProvider>
  );
}
