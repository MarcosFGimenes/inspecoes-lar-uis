"use client";

export default function NCsAbertasList() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
      <p className="font-medium text-[var(--text)]">NCs abertas</p>
      <p className="mt-2">A lista de não conformidades corretivas será exibida aqui.</p>
      <p className="mt-1">
        Utilize os filtros para priorizar as tratativas e programe novas ordens corretivas quando necessário.
      </p>
    </div>
  );
}
