"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { Button, buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { firebaseDb } from "@/lib/firebase-client";
import { downloadInspectionPdf, downloadInspectionsBatch } from "@/lib/pdf";
import type { ChecklistAnswer } from "@/types";

type MachineOption = {
  id: string;
  nome: string | null;
  tag: string | null;
  setor: string | null;
  unidade: string | null;
};

type MaintainerOption = {
  id: string;
  nome: string | null;
  matricula: string | null;
};

type TemplateOption = {
  id: string;
  nome: string | null;
  versao: string | null;
};

type FilterState = {
  machineTag?: string;
  maintainerId: string | "all";
  templateId: string | "all";
  hasNc: "all" | "yes" | "no";
  matricula?: string;
  from?: string;
  to?: string;
};

type ChecklistRow = {
  id: string;
  createdAt: string | null;
  machineId: string | null;
  machineNome: string | null;
  machineTag: string | null;
  machineSetor: string | null;
  maintainerId: string | null;
  maintainerNome: string | null;
  maintainerMatricula: string | null;
  templateId: string | null;
  templateNome: string | null;
  templateVersao: string | null;
  osNumero: string | null;
  ncCount: number;
  hasNc: boolean;
};

function normalizeDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDateTime(value: string | null) {
  const date = normalizeDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatDateForFilename(value: string | null) {
  const date = normalizeDate(value);
  if (!date) {
    return "checklist";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}`;
}

function buildPdfFilename(row: ChecklistRow) {
  const datePart = formatDateForFilename(row.createdAt);
  const machine = row.machineTag ?? row.machineNome ?? "maquina";
  return `${datePart}_${machine.replace(/\s+/g, "-").toLowerCase()}_${row.id}.pdf`;
}

function ensureString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function ensureNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function normalizeTextKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}

function buildMaintainerFilterKeys(maintainer: MaintainerOption | null | undefined) {
  if (!maintainer) return new Set<string>();
  return new Set(
    [maintainer.id, maintainer.matricula, normalizeTextKey(maintainer.nome)]
      .map(value => value?.trim())
      .filter((value): value is string => Boolean(value)),
  );
}

function rowMatchesMaintainer(row: ChecklistRow, selectedMaintainer: MaintainerOption | null | undefined) {
  const selectedKeys = buildMaintainerFilterKeys(selectedMaintainer);
  if (selectedKeys.size === 0) return false;

  const rowKeys = [row.maintainerId, row.maintainerMatricula, normalizeTextKey(row.maintainerNome)]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value));

  return rowKeys.some(key => selectedKeys.has(key));
}

function computeNcCount(data: Record<string, unknown>): number {
  const qtdNc = ensureNumber(data.qtdNC);
  if (typeof qtdNc === "number" && !Number.isNaN(qtdNc)) {
    return qtdNc;
  }

  const answers = Array.isArray(data.answers) ? (data.answers as ChecklistAnswer[]) : [];
  if (answers.length > 0) {
    return answers.filter(answer => answer?.response?.toLowerCase() === "nc").length;
  }

  const itensRaw = Array.isArray(data.itens) ? (data.itens as Array<Record<string, unknown>>) : [];
  if (itensRaw.length === 0) return 0;
  return itensRaw.filter(item => String(item.resultado ?? item.response ?? "c").toLowerCase() === "nc").length;
}

const PAGE_SIZE = 20;
const FILTERED_PAGE_SIZE = 100;
type InspectionCursor = QueryDocumentSnapshot<DocumentData>;

export default function AdminChecklistsPage() {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [maintainers, setMaintainers] = useState<MaintainerOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [filter, setFilter] = useState<FilterState>({
    machineTag: "",
    maintainerId: "all",
    templateId: "all",
    hasNc: "all",
  });
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [loadingMoreRows, setLoadingMoreRows] = useState(false);
  const lastInspectionCursorRef = useRef<InspectionCursor | null>(null);
  const [hasMoreRows, setHasMoreRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodExporting, setPeriodExporting] = useState(false);
  const [periodDeleting, setPeriodDeleting] = useState(false);

  const machinesCol = useMemo(() => collection(firebaseDb, "machines"), []);
  const maintainersCol = useMemo(() => collection(firebaseDb, "mantenedores"), []);
  const templatesCol = useMemo(() => collection(firebaseDb, "templates"), []);
  const inspectionsCol = useMemo(() => collection(firebaseDb, "inspecoes"), []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const session = await fetch("/api/admin-session", { cache: "no-store" });
        if (session.status === 401) {
          window.location.href = "/admin/login";
          return;
        }

        const [machinesSnap, maintainersSnap, templatesSnap] = await Promise.all([
          getDocs(machinesCol),
          getDocs(maintainersCol),
          getDocs(templatesCol),
        ]);

        if (cancelled) return;

        const machineRecords: MachineOption[] = machinesSnap.docs
          .map(docSnap => {
            const data = docSnap.data() ?? {};
            return {
              id: docSnap.id,
              nome: ensureString(data.nome),
              tag: ensureString(data.tag),
              setor: ensureString(data.setor),
              unidade: ensureString(data.unidade),
            } satisfies MachineOption;
          })
          .sort((a, b) => {
            const labelA = (a.nome ?? a.tag ?? "").toLowerCase();
            const labelB = (b.nome ?? b.tag ?? "").toLowerCase();
            return labelA.localeCompare(labelB);
          });

        const maintainerRecords: MaintainerOption[] = maintainersSnap.docs
          .map(docSnap => {
            const data = docSnap.data() ?? {};
            return {
              id: docSnap.id,
              nome: ensureString(data.nome),
              matricula: ensureString(data.matricula),
            } satisfies MaintainerOption;
          })
          .sort((a, b) => {
            const labelA = `${a.matricula ?? ""} ${a.nome ?? ""}`.toLowerCase();
            const labelB = `${b.matricula ?? ""} ${b.nome ?? ""}`.toLowerCase();
            return labelA.localeCompare(labelB);
          });

        const templateRecords: TemplateOption[] = templatesSnap.docs
          .map(docSnap => {
            const data = docSnap.data() ?? {};
            return {
              id: docSnap.id,
              nome: ensureString(data.nome) ?? ensureString(data.title) ?? null,
              versao: ensureString(data.versao) ?? ensureString(data.version) ?? null,
            } satisfies TemplateOption;
          })
          .sort((a, b) => {
            const labelA = (a.nome ?? "").toLowerCase();
            const labelB = (b.nome ?? "").toLowerCase();
            return labelA.localeCompare(labelB);
          });

        setMachines(machineRecords);
        setMaintainers(maintainerRecords);
        setTemplates(templateRecords);
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Erro ao carregar dados";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingLookups(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [machinesCol, maintainersCol, templatesCol]);

  const machineById = useMemo(() => new Map(machines.map(machine => [machine.id, machine])), [machines]);
  const maintainerById = useMemo(() => new Map(maintainers.map(item => [item.id, item])), [maintainers]);
  const templateById = useMemo(() => new Map(templates.map(item => [item.id, item])), [templates]);

  const mapInspectionDoc = useCallback((docSnap: InspectionCursor) => {
    const data = docSnap.data() ?? {};
    const machine = (data.machine ?? {}) as Record<string, unknown>;
    const maintainer = (data.maintainer ?? {}) as Record<string, unknown>;
    const template = (data.template ?? {}) as Record<string, unknown>;

    const machineId = ensureString(machine.machineId) ?? ensureString(machine.id);
    const machineFallback = machineId ? machineById.get(machineId) : null;
    const maintainerId = ensureString(maintainer.maintId) ?? ensureString(maintainer.id);
    const maintainerFallback = maintainerId ? maintainerById.get(maintainerId) : null;
    const templateId = ensureString(template.id);
    const templateFallback = templateId ? templateById.get(templateId) : null;

    const ncCount = computeNcCount(data);

    return {
      id: docSnap.id,
      createdAt: ensureString(data.createdAt) ?? ensureString(data.finalizadaEm) ?? ensureString(data.iniciadaEm),
      machineId: machineId,
      machineNome: ensureString(machine.nome) ?? machineFallback?.nome ?? null,
      machineTag: ensureString(machine.tag) ?? machineFallback?.tag ?? null,
      machineSetor: ensureString(machine.setor) ?? machineFallback?.setor ?? null,
      maintainerId,
      maintainerNome: ensureString(maintainer.nome) ?? maintainerFallback?.nome ?? null,
      maintainerMatricula:
        ensureString(maintainer.matricula) ?? maintainerFallback?.matricula ?? null,
      templateId,
      templateNome:
        ensureString(template.nome) ?? ensureString(template.title) ?? templateFallback?.nome ?? null,
      templateVersao:
        ensureString(template.versao) ?? ensureString(template.version) ?? templateFallback?.versao ?? null,
      osNumero: ensureString(data.osNumero),
      ncCount,
      hasNc: ncCount > 0,
    } satisfies ChecklistRow;
  }, [machineById, maintainerById, templateById]);

  const applyCurrentFilters = useCallback((items: ChecklistRow[]) => {
    const machineQuery = filter.machineTag?.trim().toLowerCase();
    const selectedMaintainer =
      filter.maintainerId === "all" ? null : maintainerById.get(filter.maintainerId) ?? null;

    return items.filter(row => {
      if (machineQuery) {
        const tag = row.machineTag?.toLowerCase() ?? "";
        const name = row.machineNome?.toLowerCase() ?? "";
        const setor = row.machineSetor?.toLowerCase() ?? "";
        if (!tag.includes(machineQuery) && !name.includes(machineQuery) && !setor.includes(machineQuery)) {
          return false;
        }
      }
      if (filter.maintainerId !== "all" && !rowMatchesMaintainer(row, selectedMaintainer)) {
        return false;
      }
      if (filter.templateId !== "all" && row.templateId !== filter.templateId) {
        return false;
      }
      if (filter.hasNc === "yes" && !row.hasNc) {
        return false;
      }
      if (filter.hasNc === "no" && row.hasNc) {
        return false;
      }
      if (filter.matricula?.trim()) {
        const wanted = filter.matricula.trim().toLowerCase();
        const matricula = row.maintainerMatricula?.toLowerCase() ?? "";
        if (!matricula.includes(wanted)) {
          return false;
        }
      }
      if (filter.from) {
        const fromDate = new Date(`${filter.from}T00:00:00`);
        const createdAt = normalizeDate(row.createdAt);
        if (!createdAt || createdAt < fromDate) {
          return false;
        }
      }
      if (filter.to) {
        const toDate = new Date(`${filter.to}T23:59:59`);
        const createdAt = normalizeDate(row.createdAt);
        if (!createdAt || createdAt > toDate) {
          return false;
        }
      }
      return true;
    });
  }, [filter, maintainerById]);

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      filter.machineTag?.trim() ||
        filter.matricula?.trim() ||
        filter.from ||
        filter.to ||
        filter.maintainerId !== "all" ||
        filter.templateId !== "all" ||
        filter.hasNc !== "all"
    );
  }, [filter]);

  const fetchRows = useCallback(async (mode: "reset" | "append" = "reset") => {
    const shouldAppend = mode === "append";
    const cursor = lastInspectionCursorRef.current;
    if (shouldAppend && !cursor) return;

    if (shouldAppend) {
      setLoadingMoreRows(true);
    } else {
      setLoadingRows(true);
      lastInspectionCursorRef.current = null;
      setHasMoreRows(false);
    }
    setError(null);
    try {
      const pageSize = hasActiveFilters && !shouldAppend ? FILTERED_PAGE_SIZE : PAGE_SIZE;
      let queryCursor = shouldAppend ? cursor : null;
      let keepFetching = true;
      let lastSnapSize = 0;
      const nextRows: ChecklistRow[] = [];

      while (keepFetching) {
        const constraints = queryCursor
          ? [orderBy("createdAt", "desc"), startAfter(queryCursor), limit(pageSize)]
          : [orderBy("createdAt", "desc"), limit(pageSize)];
        const snap = await getDocs(query(inspectionsCol, ...constraints));
        lastSnapSize = snap.docs.length;
        nextRows.push(...applyCurrentFilters(snap.docs.map(mapInspectionDoc)));
        queryCursor = snap.docs.at(-1) ?? null;

        keepFetching = Boolean(hasActiveFilters && !shouldAppend && snap.docs.length === pageSize && queryCursor);
      }

      setRows(prev => (shouldAppend ? [...prev, ...nextRows] : nextRows));
      lastInspectionCursorRef.current = queryCursor;
      setHasMoreRows(!hasActiveFilters && lastSnapSize === PAGE_SIZE);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao carregar checklists";
      setError(message);
    } finally {
      if (shouldAppend) {
        setLoadingMoreRows(false);
      } else {
        setLoadingRows(false);
      }
    }
  }, [applyCurrentFilters, hasActiveFilters, inspectionsCol, mapInspectionDoc]);

  useEffect(() => {
    if (!loadingLookups) {
      fetchRows("reset");
    }
  }, [loadingLookups, fetchRows]);

  const onFilterChange = (patch: Partial<FilterState>) => {
    setFilter(prev => ({ ...prev, ...patch }));
  };

  const totalNc = useMemo(() => rows.reduce((sum, row) => sum + row.ncCount, 0), [rows]);
  const ncRows = useMemo(() => rows.filter(row => row.hasNc).length, [rows]);

  const handleExportSingle = async (row: ChecklistRow) => {
    try {
      await downloadInspectionPdf(row.id, { filename: buildPdfFilename(row) });
    } catch (err) {
      console.error("Erro ao exportar checklist", err);
      alert("Não foi possível exportar o PDF deste checklist.");
    }
  };

  const handleExportPeriod = async () => {
    if (!filter.from || !filter.to) {
      alert("Informe a data inicial e final para exportar o período.");
      return;
    }
    if (rows.length === 0) {
      alert("Nenhum checklist encontrado com os filtros selecionados.");
      return;
    }
    setPeriodExporting(true);
    try {
      await downloadInspectionsBatch(
        rows.map(row => ({ id: row.id, filename: buildPdfFilename(row) })),
      );
    } catch (err) {
      console.error("Erro ao exportar checklists", err);
      alert("Não foi possível exportar os PDFs deste período.");
    } finally {
      setPeriodExporting(false);
    }
  };

  const handleDeletePeriod = async () => {
    if (!filter.from || !filter.to) {
      alert("Informe a data inicial e final para excluir checklists do período.");
      return;
    }
    if (rows.length === 0) {
      alert("Nenhum checklist encontrado com os filtros selecionados.");
      return;
    }

    const confirmation = window.confirm(
      `Deseja realmente deletar ${rows.length} checklist(s) entre ${filter.from} e ${filter.to}? Esta ação não pode ser desfeita.`,
    );
    if (!confirmation) {
      return;
    }

    setPeriodDeleting(true);
    try {
      for (const row of rows) {
        await deleteDoc(doc(inspectionsCol, row.id));
      }
      alert(`Checklists deletados com sucesso (${rows.length}).`);
      await fetchRows("reset");
    } catch (err) {
      console.error("Erro ao deletar checklists", err);
      alert("Não foi possível deletar os checklists deste período. Tente novamente.");
    } finally {
      setPeriodDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4 py-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-[var(--muted)]">Monitoramento das inspeções concluídas</p>
          <h1 className="text-3xl font-semibold text-[var(--text)]">Inspeções enviadas</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/dashboard" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <i className="fas fa-arrow-left" aria-hidden />
            Voltar ao dashboard
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchRows("reset")}
            disabled={loadingRows}
            loading={loadingRows}
          >
            <i className="fas fa-rotate" aria-hidden />
            Atualizar
          </Button>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_80%)] px-4 py-3 text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Refine a listagem por período, equipe e dados das máquinas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingLookups ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-[var(--hint)]">Máquina</label>
                <Input
                  value={filter.machineTag ?? ""}
                  onChange={event => onFilterChange({ machineTag: event.target.value })}
                  placeholder="Digite a TAG ou nome"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-[var(--hint)]">Mantenedor</label>
                <select
                  value={filter.maintainerId}
                  onChange={event => onFilterChange({ maintainerId: event.target.value as FilterState["maintainerId"] })}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <option value="all">Todos</option>
                  {maintainers.map(maintainer => (
                    <option key={maintainer.id} value={maintainer.id}>
                      {maintainer.matricula ? `${maintainer.matricula} — ` : ""}
                      {maintainer.nome ?? maintainer.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-[var(--hint)]">Template</label>
                <select
                  value={filter.templateId}
                  onChange={event => onFilterChange({ templateId: event.target.value as FilterState["templateId"] })}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <option value="all">Todos</option>
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.nome ?? template.id}
                      {template.versao ? ` (v${template.versao})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-[var(--hint)]">Possui NC</label>
                <select
                  value={filter.hasNc}
                  onChange={event => onFilterChange({ hasNc: event.target.value as FilterState["hasNc"] })}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <option value="all">Todos</option>
                  <option value="yes">Somente com NC</option>
                  <option value="no">Somente sem NC</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-[var(--hint)]">Matrícula</label>
                <Input
                  value={filter.matricula ?? ""}
                  onChange={event => onFilterChange({ matricula: event.target.value || undefined })}
                  placeholder="ex.: 1001"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-[var(--hint)]">De</label>
                <Input
                  type="date"
                  value={filter.from ?? ""}
                  onChange={event => onFilterChange({ from: event.target.value || undefined })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-[var(--hint)]">Até</label>
                <Input
                  type="date"
                  value={filter.to ?? ""}
                  onChange={event => onFilterChange({ to: event.target.value || undefined })}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleExportPeriod}
                disabled={periodExporting || loadingRows || rows.length === 0}
                loading={periodExporting}
              >
                <i className="fas fa-file-export" aria-hidden />
                Exportar período (PDFs)
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDeletePeriod}
                disabled={periodDeleting || loadingRows || rows.length === 0}
                loading={periodDeleting}
              >
                <i className="fas fa-trash" aria-hidden />
                Excluir período
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setFilter({
                      machineTag: "",
                      maintainerId: "all",
                      templateId: "all",
                      hasNc: "all",
                      matricula: undefined,
                      from: undefined,
                      to: undefined,
                    })
                  }
                >
                  <i className="fas fa-eraser" aria-hidden />
                  Limpar filtros
                </Button>
                <Button size="sm" onClick={() => fetchRows("reset")} disabled={loadingRows} loading={loadingRows}>
                  <i className="fas fa-filter" aria-hidden />
                  Aplicar filtros
                </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Resumo</CardTitle>
            <CardDescription>Acompanhe rapidamente o volume de checklists filtrados.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,#fff_88%)] px-4 py-1 font-medium text-[var(--primary)]">
              <i className="fas fa-list-check mr-2" aria-hidden />
              {rows.length} resultados
            </span>
            <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--success)_12%,#fff_88%)] px-4 py-1 font-medium text-[var(--success)]">
              <i className="fas fa-circle-check mr-2" aria-hidden />
              {rows.length - ncRows} sem NC
            </span>
            <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--danger)_12%,#fff_88%)] px-4 py-1 font-medium text-[var(--danger)]">
              <i className="fas fa-triangle-exclamation mr-2" aria-hidden />
              {ncRows} com NC ({totalNc} NCs)
            </span>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checklists</CardTitle>
          <CardDescription>Consulte os registros enviados pelos mantenedores e exporte relatórios detalhados.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRows ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nenhum checklist encontrado"
              description="Ajuste os filtros ou amplie o período selecionado para visualizar registros."
              icon={<i className="fas fa-clipboard-list" aria-hidden />}
            />
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Máquina</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Mantenedor</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>NC</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{formatDateTime(row.createdAt)}</div>
                      <div className="text-xs text-[var(--hint)]">ID: {row.id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.machineNome ?? "—"}</div>
                      <div className="text-xs text-[var(--hint)]">
                        {row.machineTag ? `TAG ${row.machineTag}` : "TAG não informada"}
                        {row.machineSetor ? ` • ${row.machineSetor}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.templateNome ?? "—"}</div>
                      <div className="text-xs text-[var(--hint)]">
                        {row.templateVersao ? `Versão ${row.templateVersao}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.maintainerNome ?? "—"}</div>
                      <div className="text-xs text-[var(--hint)]">
                        {row.maintainerMatricula ? `Matrícula ${row.maintainerMatricula}` : "Matrícula não informada"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.osNumero ? (
                        <Badge variant="muted">{row.osNumero}</Badge>
                      ) : (
                        <span className="text-sm text-[var(--hint)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          row.hasNc
                            ? "bg-[color-mix(in_srgb,var(--danger)_18%,#fff_82%)] text-[var(--danger)]"
                            : "bg-[color-mix(in_srgb,var(--success)_18%,#fff_82%)] text-[var(--success)]"
                        }`}
                      >
                        {row.hasNc ? `${row.ncCount} NC` : "Sem NC"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExportSingle(row)}
                        >
                          <i className="fas fa-file-pdf" aria-hidden />
                          PDF
                        </Button>
                        <Link
                          href={`/admin/inspecoes/${row.id}/edit`}
                          className={buttonStyles({ variant: "secondary", size: "sm" })}
                        >
                          <i className="fas fa-eye" aria-hidden />
                          Ver
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                </TableBody>
              </Table>
              {hasMoreRows ? (
                <div className="flex justify-center border-t border-[var(--border)] pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fetchRows("append")}
                    disabled={loadingMoreRows}
                    loading={loadingMoreRows}
                  >
                    <i className="fas fa-plus" aria-hidden />
                    Carregar mais 20 inspeções
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
