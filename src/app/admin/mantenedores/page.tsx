"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Maintainer = {
  id: string;
  matricula: string;
  nome: string;
  setor: string;
  lac: string;
  ativo: boolean;
};

export default function MantenedoresPage() {
  const [data, setData] = useState<Maintainer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin-session", { cache: "no-store" }).then(r => {
      if (r.status === 401) window.location.href = "/admin/login";
    });
    fetch("/api/mantenedores", { cache: "no-store" }).then(async r => {
      if (r.ok) {
        const payload = (await r.json()) as Maintainer[];
        setData(payload);
      }
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(
    () => data.filter(m => m.matricula.includes(q) || m.nome.toLowerCase().includes(q.toLowerCase())),
    [data, q]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[var(--text)]">Mantenedores</h1>
          <p className="text-sm text-[var(--muted)]">Administre os profissionais responsáveis pelas inspeções.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/dashboard" className={buttonStyles({ variant: "secondary" })}>
            <i className="fas fa-arrow-left" aria-hidden />
            Voltar ao dashboard
          </Link>
          <Link href="/admin/mantenedores/new" className={buttonStyles()}>
            <i className="fas fa-plus" aria-hidden />
            Novo mantenedor
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Equipe cadastrada</CardTitle>
            <CardDescription>Filtre por matrícula ou nome para localizar rapidamente um profissional.</CardDescription>
          </div>
          <div className="w-full sm:max-w-sm">
            <Input
              placeholder="Buscar por matrícula ou nome"
              value={q}
              onChange={event => setQ(event.target.value)}
              aria-label="Buscar mantenedor"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Nenhum mantenedor encontrado"
              description={
                q
                  ? "Ajuste os termos de busca para encontrar quem procura."
                  : "Cadastre um mantenedor para gerenciar inspeções."
              }
              icon={<i className="fas fa-user-cog" aria-hidden />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>LAC</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.matricula}</TableCell>
                    <TableCell>{m.nome}</TableCell>
                    <TableCell className="text-[var(--muted)]">{m.setor}</TableCell>
                    <TableCell className="text-[var(--muted)]">{m.lac}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                          m.ativo ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {m.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/mantenedores/${m.id}/machines`}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        <i className="fas fa-cogs" aria-hidden />
                        Gerenciar máquinas
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}