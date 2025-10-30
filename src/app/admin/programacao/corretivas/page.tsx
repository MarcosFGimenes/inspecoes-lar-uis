"use client";

import { useState } from "react";

import { buttonStyles } from "@/components/ui/button";

import CorrectivesPlannedList from "./_components/correctives-planned-list";
import NCsAbertasList from "./_components/ncs-abertas-list";

const sections = [
  { id: "nc-open", label: "NCs abertas" },
  { id: "planned", label: "Minhas corretivas programadas" },
] as const;

type SectionId = (typeof sections)[number]["id"];

export default function CorrectiveMaintenancePage() {
  const [activeSection, setActiveSection] = useState<SectionId>(sections[0]!.id);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">Corretivas</h1>
            <p className="text-sm text-[var(--muted)]">
              Gerencie as não conformidades corretivas, programe ordens de serviço e acompanhe sua agenda.
            </p>
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {sections.map(section => {
          const active = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={buttonStyles({
                variant: "ghost",
                size: "sm",
                className: `rounded-2xl px-4 text-sm font-semibold transition ${
                  active
                    ? "bg-[color-mix(in_srgb,var(--primary)_18%,rgba(37,99,235,0.12)_82%)] text-[var(--primary)] shadow-[0_12px_30px_-20px_rgba(37,99,235,0.45)]"
                    : "text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--surface)_88%,rgba(148,163,184,0.16)_12%)] hover:text-[var(--text)]"
                }`,
              })}
              aria-current={active ? "page" : undefined}
            >
              {section.label}
            </button>
          );
        })}
      </nav>

      <section>
        {activeSection === "planned" ? <CorrectivesPlannedList /> : <NCsAbertasList />}
      </section>
    </div>
  );
}
