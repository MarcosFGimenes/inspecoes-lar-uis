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
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-around px-4 py-3 text-sm font-medium text-slate-500">
        {items.map(item => {
          const active =
            pathname === item.href ||
            (item.href !== "/home" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[5rem] flex-col items-center gap-1 rounded-xl px-3 py-2 transition ${
                active
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "hover:bg-slate-100"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {item.icon(active)}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
