"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: (active: boolean) => ReactNode;
};

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-6 w-6 ${active ? "fill-blue-600" : "fill-none"} ${active ? "stroke-blue-600" : "stroke-slate-500"}`}
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-4H9v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"
      />
    </svg>
  );
}

function DraftsIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-6 w-6 ${active ? "fill-blue-600" : "fill-none"} ${active ? "stroke-blue-600" : "stroke-slate-500"}`}
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm9 1v4h4"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 13h8M8 17h5M8 9h4" />
    </svg>
  );
}

function InspectionsIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-6 w-6 ${active ? "fill-blue-600" : "fill-none"} ${active ? "stroke-blue-600" : "stroke-slate-500"}`}
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6a6 6 0 1 1-4.243 1.757M12 12V7M5 12h2m10 0h2"
      />
    </svg>
  );
}

export default function HomeNavigation() {
  const pathname = usePathname();

  const items: NavItem[] = useMemo(
    () => [
      {
        href: "/home",
        label: "Início",
        icon: active => <HomeIcon active={active} />,
      },
      {
        href: "/home/rascunhos",
        label: "Rascunhos",
        icon: active => <DraftsIcon active={active} />,
      },
      {
        href: "/home/inspecoes",
        label: "Inspeções",
        icon: active => <InspectionsIcon active={active} />,
      },
    ],
    []
  );

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 pb-5">
      <div className="pointer-events-auto mx-auto w-[calc(100%-2rem)] max-w-3xl rounded-[26px] border border-[color-mix(in_srgb,var(--border)_80%,transparent_20%)] bg-[color-mix(in_srgb,var(--surface)_94%,rgba(255,255,255,0.75)_6%)] px-4 py-3 text-sm font-medium text-[var(--muted)] shadow-[0_-12px_45px_-28px_rgb(var(--shadow-color)/55%)] backdrop-blur-xl">
        <div className="flex items-center justify-around gap-2">
          {items.map(item => {
            const active =
              pathname === item.href ||
              (item.href !== "/home" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-[5.5rem] flex-col items-center gap-1 rounded-xl px-3 py-2 transition ${
                  active
                    ? "bg-[color-mix(in_srgb,var(--primary)_14%,rgba(37,99,235,0.08)_86%)] text-[var(--primary)] shadow-[0_12px_30px_-20px_rgba(37,99,235,0.45)]"
                    : "hover:bg-[color-mix(in_srgb,var(--surface)_88%,rgba(148,163,184,0.08)_12%)]"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {item.icon(active)}
                <span className="text-xs font-semibold uppercase tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
