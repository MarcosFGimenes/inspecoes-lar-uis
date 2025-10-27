"use client";

export default function CorrectivesPlannedList() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
      <p className="font-medium text-[var(--text)]">Programações corretivas</p>
      <p className="mt-2">Aqui você acompanhará as ordens corretivas programadas e seus próximos compromissos.</p>
      <p className="mt-1">Filtros de período, área, responsável e status estarão disponíveis nesta seção.</p>
    </div>
  );
}
