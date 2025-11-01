"use client";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CorrectiveOsItem, ScheduleResultPayload } from "@/app/admin/programacao/corretivas/_types";
import type { StoredImage } from "@/types";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { fetchCorrectiveAssignees } from "@/lib/correctives/assignees";

type MaintSessionInfo = {
  id?: string | null;
  nome?: string | null;
  matricula?: string | null;
};

type MachineRecord = {
  id: string;
  tag: string | null;
  nome: string | null;
  setor: string | null;
  unidade: string | null;
  fotoUrl: string | null;
};

type ProgramacaoRecord = {
  id: string;
  batchId: string | null;
  osNumero: string | null;
  machine: {
    tag: string | null;
    nome: string | null;
    machineId: string | null;
    machineNotFound: boolean;
  };
  manutencao: {
    tipo: string | null;
    criticidade: string | null;
  };
  responsavel: {
    nome: string | null;
    maintId: string | null;
    matricula: string | null;
    origem: string | null;
  };
  datas: {
    emissao: string | null;
    vencimento: string | null;
    fechamento: string | null;
  };
  atrasada: boolean;
  status: string | null;
};

type CorrectiveAgendaItem = {
  osId: string;
  ncId: string | null;
  description: string | null;
  ncDescription: string | null;
  area: string | null;
  effectiveSeverity: number | null;
  scheduledDate: string | null;
  dueDate: string | null;
  status: string | null;
  updatedAt: string | null;
  assignees: {
    owner: string | null;
    maintainer1: string | null;
    maintainer2: string | null;
  } | null;
  completedAt: string | null;
  completedBy: string | null;
  completedByName: string | null;
  completedByMatricula: string | null;
  completionNotes: string | null;
  machineId: string | null;
  machineTag: string | null;
  machineName: string | null;
  ncPhotos: StoredImage[] | null;
  inspectionId: string | null;
  inspectionResponseId: string | null;
  templateId: string | null;
  questionId: string | null;
  questionLabel: string | null;
  osNumero: string | null;
  assigneesDetails?: AssigneeInfo[] | null;
};

type AssigneeInfo = {
  id: string;
  nome: string | null;
  matricula: string | null;
};

export default function MaintHomeStartPage() {
  const router = useRouter();

  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<MaintSessionInfo | null>(null);

  const [machinesLoading, setMachinesLoading] = useState(true);
  const [machinesError, setMachinesError] = useState<string | null>(null);
  const [machines, setMachines] = useState<MachineRecord[]>([]);

  const [programacoesLoading, setProgramacoesLoading] = useState(true);
  const [programacoesError, setProgramacoesError] = useState<string | null>(null);
  const [programacoes, setProgramacoes] = useState<ProgramacaoRecord[]>([]);

  const [activeAgendaTab, setActiveAgendaTab] = useState<"0441" | "correctives">("0441");
  const [correctivesLoading, setCorrectivesLoading] = useState(false);
  const [correctivesLoadingMore, setCorrectivesLoadingMore] = useState(false);
  const [correctivesError, setCorrectivesError] = useState<string | null>(null);
  const [correctives, setCorrectives] = useState<CorrectiveAgendaItem[]>([]);
  const [correctivesNextCursor, setCorrectivesNextCursor] = useState<string | null>(null);
  const [correctivesHasLoaded, setCorrectivesHasLoaded] = useState(false);
  const correctivesAbortRef = useRef<AbortController | null>(null);
  const assigneesAbortRef = useRef<AbortController | null>(null);
  const lastExpandedIdRef = useRef<string | null>(null);
  const [correctivesFilters, setCorrectivesFilters] = useState({
    area: "",
    status: "scheduled",
    from: "",
    to: "",
    responsible: "",
  });
  const [assignees, setAssignees] = useState<AssigneeInfo[]>([]);
  const [assigneesLoaded, setAssigneesLoaded] = useState(false);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assigneesError, setAssigneesError] = useState<string | null>(null);
  const [expandedCorrectiveId, setExpandedCorrectiveId] = useState<string | null>(null);
  const [selectedCorrective, setSelectedCorrective] = useState<CorrectiveAgendaItem | null>(null);
  const [completeNotes, setCompleteNotes] = useState("");
  const [completeLoading, setCompleteLoading] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [correctiveGlobalSuccess, setCorrectiveGlobalSuccess] = useState<string | null>(null);

  const toIsoBoundary = useCallback((value: string, boundary: "start" | "end") => {
    if (!value) return null;
    const iso = boundary === "start" ? `${value}T00:00:00.000` : `${value}T23:59:59.999`;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  }, []);

  const fetchCorrectives = useCallback(
    async ({ cursor, replace }: { cursor?: string | null; replace?: boolean } = {}) => {
      if (!session?.id && !correctivesFilters.responsible) {
        return;
      }

      correctivesAbortRef.current?.abort();
      const controller = new AbortController();
      correctivesAbortRef.current = controller;

      const isReplace = replace ?? false;
      let fromIso: string | null = null;
      let toIso: string | null = null;

      if (correctivesFilters.from) {
        fromIso = toIsoBoundary(correctivesFilters.from, "start");
        if (!fromIso) {
          setCorrectivesError("Data inicial inválida.");
          setCorrectivesLoading(false);
          setCorrectivesLoadingMore(false);
          return;
        }
      }

      if (correctivesFilters.to) {
        toIso = toIsoBoundary(correctivesFilters.to, "end");
        if (!toIso) {
          setCorrectivesError("Data final inválida.");
          setCorrectivesLoading(false);
          setCorrectivesLoadingMore(false);
          return;
        }
      }

      setCorrectivesError(null);
      if (isReplace) {
        setCorrectivesLoading(true);
        setCorrectivesLoadingMore(false);
        setCorrectives([]);
        setCorrectivesNextCursor(null);
      } else {
        setCorrectivesLoadingMore(true);
      }

      const params = new URLSearchParams();
      params.set("limit", "20");
      if (correctivesFilters.responsible) {
        params.set("responsible", correctivesFilters.responsible);
      }
      if (correctivesFilters.status) {
        params.set("status", correctivesFilters.status);
      }
      if (correctivesFilters.area) {
        params.set("area", correctivesFilters.area);
      }
      if (fromIso) {
        params.set("from", fromIso);
      }
      if (toIso) {
        params.set("to", toIso);
      }
      if (cursor) {
        params.set("cursor", cursor);
      }

      let aborted = false;

      try {
        const response = await fetch(`/api/correctives/os?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = typeof payload?.error === "string" ? payload.error : "Falha ao carregar corretivas";
          throw new Error(message);
        }

        const data = (await response.json()) as { items?: CorrectiveAgendaItem[]; nextCursor?: string | null };
        const items = Array.isArray(data.items) ? data.items : [];
        setCorrectives(prev => (isReplace ? items : [...prev, ...items]));
        setCorrectivesNextCursor(data.nextCursor ?? null);
        setCorrectivesHasLoaded(true);
      } catch (err) {
        const error = err as Error;
        if (error.name === "AbortError") {
          aborted = true;
        } else {
          console.error("[home] failed to load corrective agenda", error);
          setCorrectivesError(error.message || "Falha ao carregar corretivas");
        }
      } finally {
        if (!aborted) {
          setCorrectivesLoading(false);
          setCorrectivesLoadingMore(false);
        }
      }
    },
    [correctivesFilters, session?.id, toIsoBoundary]
  );

  useEffect(() => {
    if (activeAgendaTab !== "correctives") {
      return;
    }
    if (assigneesLoaded || assigneesLoading) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    assigneesAbortRef.current?.abort();
    assigneesAbortRef.current = controller;

    setAssigneesLoading(true);
    setAssigneesError(null);

    fetchCorrectiveAssignees({ signal: controller.signal, limit: 500 })
      .then(result => {
        if (cancelled) {
          return;
        }
        const normalized = result.map(option => ({
          id: option.id,
          nome: option.nome ?? null,
          matricula: option.matricula ?? null,
        }));
        setAssignees(normalized);
        setAssigneesLoaded(true);
      })
      .catch(error => {
        if (cancelled) {
          return;
        }
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        const message = error instanceof Error && error.message ? error.message : "Falha ao carregar responsáveis.";
        setAssigneesError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setAssigneesLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeAgendaTab, assigneesLoaded, assigneesLoading]);

  const [searchTag, setSearchTag] = useState("");
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [inspectionSaved, setInspectionSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      setSessionLoading(true);
      setSessionError(null);
      try {
        const response = await fetch("/api/auth/maint/me", { cache: "no-store" });
        if (response.status === 401) {
          if (!cancelled) {
            setSession(null);
            setSessionError("Sessão não encontrada. Faça login novamente.");
          }
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar sessão");
        }
        const data = await response.json();
        if (!cancelled) {
          setSession({
            id: data.store?.id ?? null,
            nome: data.store?.nome ?? null,
            matricula: data.store?.matricula ?? null,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar sessão";
          setSessionError(message);
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }
    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCorrectivesFilters(prev => {
      if (session?.id && !prev.responsible) {
        return { ...prev, responsible: session.id ?? "" };
      }
      if (!session?.id && prev.responsible) {
        return { ...prev, responsible: "" };
      }
      return prev;
    });
  }, [session?.id]);

  useEffect(() => {
    if (!session) {
      setMachines([]);
      setMachinesLoading(false);
      setMachinesError(null);
      return;
    }

    let cancelled = false;
    async function loadMachines() {
      setMachinesLoading(true);
      setMachinesError(null);
      try {
        const response = await fetch("/api/me/machines", { cache: "no-store" });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar máquinas");
        }
        const data = (await response.json()) as MachineRecord[];
        if (!cancelled) {
          setMachines(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar máquinas";
          setMachinesError(message);
          setMachines([]);
        }
      } finally {
        if (!cancelled) {
          setMachinesLoading(false);
        }
      }
    }

    loadMachines();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      setProgramacoes([]);
      setProgramacoesError(null);
      setProgramacoesLoading(false);
      return;
    }

    let cancelled = false;
    async function loadProgramacoes() {
      setProgramacoesLoading(true);
      setProgramacoesError(null);
      try {
        const response = await fetch("/api/me/programacoes", { cache: "no-store" });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar programações");
        }
        const data = (await response.json()) as ProgramacaoRecord[];
        if (!cancelled) {
          setProgramacoes(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error && err.message ? err.message : "Falha ao carregar programações";
          setProgramacoesError(message);
          setProgramacoes([]);
        }
      } finally {
        if (!cancelled) {
          setProgramacoesLoading(false);
        }
      }
    }

    loadProgramacoes();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (activeAgendaTab !== "correctives") {
      return;
    }
    if (!session?.id && !correctivesFilters.responsible) {
      return;
    }
    fetchCorrectives({ replace: true }).catch(() => undefined);
  }, [
    activeAgendaTab,
    session?.id,
    correctivesFilters.area,
    correctivesFilters.status,
    correctivesFilters.from,
    correctivesFilters.to,
    correctivesFilters.responsible,
    fetchCorrectives,
  ]);

  useEffect(() => {
    return () => {
      correctivesAbortRef.current?.abort();
      assigneesAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!expandedCorrectiveId) {
      lastExpandedIdRef.current = null;
      setSelectedCorrective(null);
      setCompleteNotes("");
      setCompleteError(null);
      return;
    }

    const match = correctives.find(item => item.osId === expandedCorrectiveId) ?? null;
    setSelectedCorrective(match ?? null);

    if (lastExpandedIdRef.current !== expandedCorrectiveId) {
      setCompleteNotes("");
      setCompleteError(null);
    }

    lastExpandedIdRef.current = expandedCorrectiveId;
  }, [correctives, expandedCorrectiveId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ScheduleResultPayload>).detail;
      if (!detail) {
        return;
      }

      if (correctivesFilters.area && detail.area !== correctivesFilters.area) {
        return;
      }
      if (correctivesFilters.status && correctivesFilters.status !== "scheduled") {
        return;
      }
      if (correctivesFilters.responsible && detail.assignees.owner !== correctivesFilters.responsible) {
        return;
      }

      const fromIso = correctivesFilters.from ? toIsoBoundary(correctivesFilters.from, "start") : null;
      if (fromIso && detail.scheduledDate && detail.scheduledDate < fromIso) {
        return;
      }
      const toIso = correctivesFilters.to ? toIsoBoundary(correctivesFilters.to, "end") : null;
      if (toIso && detail.scheduledDate && detail.scheduledDate > toIso) {
        return;
      }

      setCorrectives(prev => {
        const next = prev.filter(item => item.osId !== detail.osId);
        const nowIso = new Date().toISOString();
        const newItem: CorrectiveAgendaItem = {
          osId: detail.osId,
          ncId: detail.ncId,
          description: detail.description,
          ncDescription: detail.description,
          area: detail.area,
          effectiveSeverity: detail.effectiveSeverity,
          scheduledDate: detail.scheduledDate,
          dueDate: detail.dueDate ?? null,
          status: detail.status,
          updatedAt: detail.updatedAt || nowIso,
          assignees: {
            owner: detail.assignees.owner,
            maintainer1: detail.assignees.maintainer1,
            maintainer2: detail.assignees.maintainer2,
          },
          completedAt: null,
          completedBy: null,
          completedByName: null,
          completedByMatricula: null,
          completionNotes: null,
          machineId: detail.machineId ?? null,
          machineTag: detail.machineTag ?? null,
          machineName: detail.machineName ?? null,
          ncPhotos: detail.ncPhotos ?? null,
          inspectionId: detail.inspectionId ?? null,
          inspectionResponseId: detail.inspectionResponseId ?? null,
          templateId: detail.templateId ?? null,
          questionId: detail.questionId ?? null,
          questionLabel: detail.questionLabel ?? null,
          osNumero: detail.osNumero ?? null,
          assigneesDetails: Array.isArray(detail.assigneesDetails)
            ? (detail.assigneesDetails as AssigneeInfo[])
            : null,
        };
        return [newItem, ...next];
      });
      setCorrectivesHasLoaded(true);
    };

    window.addEventListener("correctives:schedule-success", handler as EventListener);
    return () => {
      window.removeEventListener("correctives:schedule-success", handler as EventListener);
    };
  }, [correctivesFilters, toIsoBoundary]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setInspectionSaved(params.get("ok") === "1");
  }, []);

  const displayName = useMemo(() => {
    if (!session) return "mantenedor";
    const nome = session.nome?.trim();
    if (nome && nome.length > 0) {
      const firstName = nome.split(" ")[0];
      return firstName || nome;
    }
    const matricula = session.matricula?.trim();
    return matricula && matricula.length > 0 ? matricula : "mantenedor";
  }, [session]);

  const correctiveAreaOptions = useMemo(
    () => [
      { value: "", label: "Todas as áreas" },
      { value: "mechanical", label: "Mecânica" },
      { value: "electrical", label: "Elétrica" },
    ],
    []
  );

  const correctiveStatusOptions = useMemo(
    () => [
      { value: "", label: "Todos os status" },
      { value: "scheduled", label: "Programada" },
      { value: "in_progress", label: "Em andamento" },
      { value: "done", label: "Concluída" },
    ],
    []
  );

  const correctiveResponsibleOptions = useMemo(() => {
    if (!session?.id) {
      return [{ value: "", label: "Selecione" }];
    }

    const pieces: string[] = [];
    if (session.matricula) {
      pieces.push(session.matricula);
    }
    if (session.nome) {
      pieces.push(session.nome);
    }

    return [
      {
        value: session.id,
        label: pieces.join(" · ") || "Eu",
      },
    ];
  }, [session?.id, session?.matricula, session?.nome]);

  const assigneeMap = useMemo(() => {
    const map = new Map<string, AssigneeInfo>();
    assignees.forEach(info => {
      map.set(info.id, info);
    });
    return map;
  }, [assignees]);

  const handleSearch = useCallback(() => {
    const trimmed = searchTag.trim();
    if (!trimmed) return;
    router.push(`/inspecao/${encodeURIComponent(trimmed)}`);
  }, [router, searchTag]);

  const handleLogout = useCallback(async () => {
    try {
      setLogoutLoading(true);
      await fetch("/api/auth/maint/logout", { method: "POST" });
      window.location.href = "/login";
    } finally {
      setLogoutLoading(false);
    }
  }, []);

  const handleSelectMachine = useCallback(
    (tag: string | null) => {
      if (!tag) return;
      router.push(`/inspecao/${encodeURIComponent(tag)}`);
    },
    [router]
  );

  const formatDate = useCallback((iso: string | null | undefined) => {
    if (!iso) return "-";
    try {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "-";
      return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
    } catch {
      return "-";
    }
  }, []);

  const formatDateTime = useCallback((iso: string | null | undefined) => {
    if (!iso) return "-";
    try {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "-";
      return date.toLocaleString("pt-BR", { timeZone: "UTC" });
    } catch {
      return "-";
    }
  }, []);

  const formatAreaLabel = useCallback((area: string | null | undefined) => {
    if (area === "mechanical") return "Mecânica";
    if (area === "electrical") return "Elétrica";
    if (typeof area === "string" && area.trim().length > 0) {
      return area;
    }
    return "-";
  }, []);

  const formatOsNumber = useCallback((item: CorrectiveAgendaItem) => {
    const formatted = item.osNumero?.trim();
    if (formatted && formatted.length > 0) {
      return formatted;
    }
    if (item.osId && item.osId.trim().length > 0) {
      return item.osId;
    }
    return "-";
  }, []);

  const formatSeverity = useCallback((severity: number | null) => {
    if (!severity) {
      return "-";
    }
    return `Nível ${severity}`;
  }, []);

  const formatStatusLabel = useCallback((status: string | null | undefined) => {
    if (!status) {
      return "-";
    }
    const normalized = status.replace(/_/g, " ");
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }, []);

  const resolveStatusVariant = useCallback((status: string | null | undefined) => {
    if (!status) {
      return "muted" as const;
    }
    const normalized = status.toLowerCase();
    if (normalized === "scheduled") {
      return "warning" as const;
    }
    if (normalized === "in_progress") {
      return "default" as const;
    }
    if (normalized === "done") {
      return "success" as const;
    }
    return "muted" as const;
  }, []);

  const updateCorrectiveFilter = useCallback(
    (key: keyof typeof correctivesFilters, value: string) => {
      setCorrectivesFilters(prev => ({ ...prev, [key]: value }));
      setCorrectivesHasLoaded(false);
    },
    []
  );

  const handleStartProgramada = useCallback(
    (record: ProgramacaoRecord) => {
      const tag = record.machine?.tag;
      if (!tag) return;
      const params = new URLSearchParams();
      params.set("programacaoId", record.id);
      if (record.osNumero) {
        params.set("os", record.osNumero);
      }
      if (record.batchId) {
        params.set("batchId", record.batchId);
      }
      if (record.datas?.vencimento) {
        params.set("prazo", record.datas.vencimento);
      }
      router.push(`/inspecao/${encodeURIComponent(tag)}?${params.toString()}`);
    },
    [router]
  );

  const handleLoadMoreCorrectives = useCallback(() => {
    if (!correctivesNextCursor || correctivesLoadingMore) {
      return;
    }
    fetchCorrectives({ cursor: correctivesNextCursor, replace: false }).catch(() => undefined);
  }, [correctivesNextCursor, correctivesLoadingMore, fetchCorrectives]);

  const handleCompleteCorrective = useCallback(async () => {
    if (!selectedCorrective) return;
    setCompleteLoading(true);
    setCompleteError(null);
    try {
      const response = await fetch(`/api/correctives/os/${selectedCorrective.osId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: completeNotes.trim() || undefined }),
      });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = typeof payload?.error === "string" ? payload.error : "Falha ao concluir a corretiva.";
        throw new Error(message);
      }

      const data = (await response.json()) as {
        osId: string;
        ncId: string | null;
        workOrder: CorrectiveOsItem | null;
      };

      const workOrder = (data.workOrder as CorrectiveAgendaItem | null) ?? null;

      setCorrectives(prev => prev.filter(item => item.osId !== data.osId));
      setCorrectivesHasLoaded(true);
      setExpandedCorrectiveId(null);
      setSelectedCorrective(null);
      setCompleteNotes("");
      setCompleteError(null);
      setCorrectiveGlobalSuccess("Corretiva concluída e movida para o histórico.");

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("correctives:completed", {
            detail: {
              osId: data.osId,
              ncId: data.ncId,
              workOrder,
            },
          })
        );
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Falha ao concluir a corretiva.";
      setCompleteError(message);
    } finally {
      setCompleteLoading(false);
    }
  }, [selectedCorrective, completeNotes]);

  const handleResetCorrectivesFilters = useCallback(() => {
    setCorrectivesFilters({
      area: "",
      status: "scheduled",
      from: "",
      to: "",
      responsible: session?.id ?? "",
    });
    setCorrectivesHasLoaded(false);
    setExpandedCorrectiveId(null);
    setSelectedCorrective(null);
    setCompleteNotes("");
    setCompleteError(null);
    setCorrectiveGlobalSuccess(null);
  }, [session?.id]);

  const formatAssignees = useCallback(
    (item: CorrectiveAgendaItem | null | undefined) => {
      if (!item) {
        return "-";
      }

      const details = Array.isArray(item.assigneesDetails)
        ? item.assigneesDetails.filter(detail => detail && detail.id)
        : [];

      if (details.length > 0) {
        const labels = details.map(detail => {
          const parts = [detail.matricula, detail.nome].filter(part => Boolean(part && part.trim()));
          return parts.join(" — ") || detail.id;
        });
        return labels.join("\n");
      }

      const value = item.assignees;
      if (!value) {
        return "-";
      }

      const ids = [value.owner, value.maintainer1, value.maintainer2].filter(
        (id): id is string => Boolean(id && id.trim().length > 0)
      );

      if (ids.length === 0) {
        return "-";
      }

      const uniqueIds = ids.filter((id, index) => ids.indexOf(id) === index);

      const labels = uniqueIds.map(id => {
        const info = assigneeMap.get(id);
        if (!info) {
          return id;
        }
        const parts = [info.matricula, info.nome].filter(part => Boolean(part && part.trim()));
        return parts.join(" — ") || id;
      });

      return labels.join("\n");
    },
    [assigneeMap]
  );

  const correctiveEmpty =
    correctivesHasLoaded &&
    correctives.length === 0 &&
    !correctivesLoading &&
    !correctivesLoadingMore &&
    !correctivesError;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 px-6 py-8 text-white shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-100">Início</p>
            <h1 className="text-3xl font-semibold">Bem vindo, {displayName}!</h1>
            <p className="text-sm text-blue-100">
              Escolha uma máquina para iniciar uma nova inspeção ou digite a TAG abaixo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={logoutLoading}
            className="inline-flex items-center justify-center rounded-full border border-white/60 px-4 py-2 text-sm font-medium text-white transition hover:border-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {logoutLoading ? "Saindo..." : "Sair"}
          </button>
        </div>
        {inspectionSaved && (
          <div className="rounded-2xl border border-white/40 bg-white/15 px-4 py-3 text-sm">
            <p className="font-medium">Inspeção salva com sucesso!</p>
            <p className="text-blue-100">Você pode conferir os detalhes em &ldquo;Inspeções&rdquo; sempre que precisar.</p>
          </div>
        )}
        {sessionError && (
          <div className="rounded-2xl border border-red-200/70 bg-red-500/20 px-4 py-3 text-sm text-white">
            {sessionError}
          </div>
        )}
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Programações do mantenedor</h2>
            <p className="text-sm text-slate-500">
              Acompanhe as inspeções de rota 0441 e as corretivas programadas em um só lugar.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveAgendaTab("0441")}
            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
              activeAgendaTab === "0441"
                ? "bg-blue-600 text-white shadow"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Inspeções de rota (0441)
          </button>
          <button
            type="button"
            onClick={() => setActiveAgendaTab("correctives")}
            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
              activeAgendaTab === "correctives"
                ? "bg-emerald-600 text-white shadow"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Corretivas programadas
          </button>
        </div>

        <div className="mt-6">
          {activeAgendaTab === "0441" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">Inspeções de rota (0441)</h3>
                {programacoesLoading && (
                  <span className="text-xs text-slate-400">Carregando programações...</span>
                )}
              </div>

              {programacoesError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {programacoesError}
                </div>
              ) : programacoesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
                  ))}
                </div>
              ) : programacoes.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 shadow-sm">
                  Nenhuma inspeção programada para você no momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {programacoes.map(record => {
                    const criticidade = record.manutencao.criticidade?.toUpperCase() ?? null;
                    const criticidadeVariant: "default" | "success" | "warning" | "danger" | "muted" =
                      criticidade === "A" ? "danger" : criticidade === "B" ? "warning" : "muted";
                    const disableStart = !record.machine.tag || record.machine.machineNotFound;

                    return (
                      <article
                        key={record.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md md:flex md:items-center md:justify-between"
                      >
                        <div className="space-y-2 md:pr-6">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-900">
                              {record.machine.nome ?? record.machine.tag ?? "Máquina"}
                            </h3>
                            {record.manutencao.tipo && (
                              <Badge variant="muted" className="uppercase tracking-wide">
                                {record.manutencao.tipo}
                              </Badge>
                            )}
                            {criticidade && <Badge variant={criticidadeVariant}>Criticidade {criticidade}</Badge>}
                            {record.atrasada && <Badge variant="danger">Atrasada</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                            <span>TAG: {record.machine.tag ?? "-"}</span>
                            <span>Vencimento: {formatDate(record.datas?.vencimento)}</span>
                            <span>OS: {record.osNumero ?? "-"}</span>
                          </div>
                          {record.machine.machineNotFound && (
                            <p className="text-xs text-amber-600">
                              TAG não encontrada no cadastro. Solicite suporte ao PCM.
                            </p>
                          )}
                        </div>
                        <div className="mt-3 flex flex-col items-start gap-2 md:mt-0 md:items-end">
                          <button
                            type="button"
                            onClick={() => handleStartProgramada(record)}
                            disabled={disableStart}
                            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                          >
                            Iniciar inspeção
                          </button>
                          <p className="text-xs text-slate-400">
                            Responsável: {record.responsavel.nome ?? "-"}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">Corretivas programadas</h3>
                {correctivesLoading && !correctivesHasLoaded && (
                  <span className="text-xs text-slate-400">Carregando corretivas...</span>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500" htmlFor="correctives-area-filter">
                    Área
                  </label>
                  <select
                    id="correctives-area-filter"
                    value={correctivesFilters.area}
                    onChange={event => updateCorrectiveFilter("area", event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    {correctiveAreaOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500" htmlFor="correctives-status-filter">
                    Status
                  </label>
                  <select
                    id="correctives-status-filter"
                    value={correctivesFilters.status}
                    onChange={event => updateCorrectiveFilter("status", event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    {correctiveStatusOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500" htmlFor="correctives-from-filter">
                    Período inicial
                  </label>
                  <input
                    id="correctives-from-filter"
                    type="date"
                    value={correctivesFilters.from}
                    onChange={event => updateCorrectiveFilter("from", event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500" htmlFor="correctives-to-filter">
                    Período final
                  </label>
                  <input
                    id="correctives-to-filter"
                    type="date"
                    value={correctivesFilters.to}
                    onChange={event => updateCorrectiveFilter("to", event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500" htmlFor="correctives-responsible-filter">
                    Responsável
                  </label>
                  <select
                    id="correctives-responsible-filter"
                    value={correctivesFilters.responsible}
                    onChange={event => updateCorrectiveFilter("responsible", event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    disabled={correctiveResponsibleOptions.length <= 1}
                  >
                    {correctiveResponsibleOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleResetCorrectivesFilters}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
                >
                  Limpar filtros
                </button>
              </div>

              {correctivesError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {correctivesError}
                </div>
              ) : correctivesLoading && !correctivesHasLoaded ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                  ))}
                </div>
              ) : correctiveEmpty ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 shadow-sm">
                  Nenhuma corretiva programada encontrada para os filtros selecionados.
                </div>
              ) : (
                <div className="space-y-3">
                  {correctiveGlobalSuccess ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {correctiveGlobalSuccess}
                    </div>
                  ) : null}
                  {assigneesError ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {assigneesError}
                    </div>
                  ) : null}
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">OS</th>
                          <th className="px-4 py-3 text-left font-semibold">NC relacionada</th>
                          <th className="px-4 py-3 text-left font-semibold">Área</th>
                          <th className="px-4 py-3 text-left font-semibold">Programada para</th>
                          <th className="px-4 py-3 text-left font-semibold">Prazo</th>
                          <th className="px-4 py-3 text-left font-semibold">Severidade</th>
                          <th className="px-4 py-3 text-left font-semibold">Responsáveis</th>
                          <th className="px-4 py-3 text-left font-semibold">Status</th>
                          <th className="px-4 py-3 text-left font-semibold">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {correctives.map(item => {
                          const isExpanded = expandedCorrectiveId === item.osId;
                          return (
                            <Fragment key={item.osId}>
                              <tr className="transition hover:bg-slate-50/60">
                                <td className="px-4 py-3 font-medium text-slate-900">
                                  <div className="space-y-1">
                                    <p>{formatOsNumber(item)}</p>
                                    {item.machineTag ? (
                                      <p className="text-xs text-slate-500">TAG {item.machineTag}</p>
                                    ) : null}
                                    {item.machineName ? (
                                      <p className="text-xs text-slate-500">{item.machineName}</p>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col text-xs text-slate-600">
                                    <span className="text-sm font-medium text-slate-900">
                                      {item.description?.trim() || item.ncDescription?.trim() || "-"}
                                    </span>
                                    {item.ncId ? <span className="text-[11px] text-slate-400">NC: {item.ncId}</span> : null}
                                  </div>
                                </td>
                                <td className="px-4 py-3">{formatAreaLabel(item.area)}</td>
                                <td className="px-4 py-3">{formatDateTime(item.scheduledDate)}</td>
                                <td className="px-4 py-3">{formatDateTime(item.dueDate)}</td>
                                <td className="px-4 py-3">{formatSeverity(item.effectiveSeverity)}</td>
                                <td className="px-4 py-3 whitespace-pre-line">{formatAssignees(item)}</td>
                                <td className="px-4 py-3">
                                  {item.status ? (
                                    <Badge variant={resolveStatusVariant(item.status)}>
                                      {formatStatusLabel(item.status)}
                                    </Badge>
                                  ) : (
                                    <span className="text-sm text-slate-500">-</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCorrectiveGlobalSuccess(null);
                                      setExpandedCorrectiveId(prev => (prev === item.osId ? null : item.osId));
                                    }}
                                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                                  >
                                    {isExpanded ? "Ocultar" : "Detalhes"}
                                  </button>
                                </td>
                              </tr>
                              {isExpanded && selectedCorrective ? (
                                <tr>
                                  <td colSpan={9} className="bg-slate-50/60 px-5 py-5">
                                    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="space-y-1">
                                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Ordem de serviço
                                          </p>
                                          <p className="text-lg font-semibold text-slate-900">
                                            {formatOsNumber(selectedCorrective)}
                                          </p>
                                          <p className="text-xs text-slate-500">
                                            Última atualização: {formatDateTime(selectedCorrective.updatedAt)}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Badge variant={resolveStatusVariant(selectedCorrective.status)}>
                                            {formatStatusLabel(selectedCorrective.status)}
                                          </Badge>
                                          {selectedCorrective.effectiveSeverity ? (
                                            <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-600">
                                              Severidade {selectedCorrective.effectiveSeverity}
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>

                                      <div className="space-y-2">
                                        <p className="text-sm font-semibold text-slate-900">
                                          {selectedCorrective.description?.trim() ||
                                            selectedCorrective.ncDescription?.trim() ||
                                            "Sem descrição"}
                                        </p>
                                        {selectedCorrective.questionLabel ? (
                                          <p className="text-xs text-slate-500">
                                            Motivo: {selectedCorrective.questionLabel}
                                          </p>
                                        ) : null}
                                      </div>

                                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                          <span className="font-semibold uppercase text-slate-500">Programada para</span>
                                          <p className="text-sm font-medium text-slate-900">
                                            {formatDateTime(selectedCorrective.scheduledDate)}
                                          </p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                          <span className="font-semibold uppercase text-slate-500">Prazo</span>
                                          <p className="text-sm font-medium text-slate-900">
                                            {formatDateTime(selectedCorrective.dueDate)}
                                          </p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                          <span className="font-semibold uppercase text-slate-500">Área</span>
                                          <p className="text-sm font-medium text-slate-900">
                                            {formatAreaLabel(selectedCorrective.area)}
                                          </p>
                                        </div>
                                        {selectedCorrective.machineName || selectedCorrective.machineTag ? (
                                          <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                            <span className="font-semibold uppercase text-slate-500">Máquina</span>
                                            <p className="text-sm font-medium text-slate-900">
                                              {selectedCorrective.machineName || "Máquina"}
                                              {selectedCorrective.machineTag
                                                ? ` · TAG ${selectedCorrective.machineTag}`
                                                : ""}
                                            </p>
                                          </div>
                                        ) : null}
                                        <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                          <span className="font-semibold uppercase text-slate-500">Responsáveis</span>
                                          <p className="whitespace-pre-line text-sm font-medium text-slate-900">
                                            {formatAssignees(selectedCorrective)}
                                          </p>
                                        </div>
                                      </div>

                                      {selectedCorrective.ncPhotos?.length ? (
                                        <div className="space-y-2">
                                          <p className="text-xs font-semibold uppercase text-slate-500">
                                            Fotos anexadas na inspeção
                                          </p>
                                          <ul className="flex flex-wrap gap-2 text-xs">
                                            {selectedCorrective.ncPhotos.map((photo, index) => (
                                              <li key={photo.key ?? photo.url ?? `photo-${index}`}>
                                                <a
                                                  href={photo.url}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                                                >
                                                  <i className="fas fa-paperclip" aria-hidden />
                                                  Ver anexo {index + 1}
                                                </a>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      ) : null}

                                      {completeError ? (
                                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                          {completeError}
                                        </div>
                                      ) : null}

                                      <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-600" htmlFor="complete-notes">
                                          Observações (opcional)
                                        </label>
                                        <textarea
                                          id="complete-notes"
                                          value={completeNotes}
                                          onChange={event => setCompleteNotes(event.target.value)}
                                          rows={3}
                                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                          placeholder="Detalhe as evidências da conclusão"
                                        />
                                      </div>

                                      <div className="flex items-center justify-end gap-3">
                                        <button
                                          type="button"
                                          onClick={handleCompleteCorrective}
                                          disabled={completeLoading}
                                          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
                                        >
                                          {completeLoading ? "Salvando..." : "Marcar como concluída"}
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Exibindo {correctives.length} {correctives.length === 1 ? "corretiva" : "corretivas"}
                </p>
                <button
                  type="button"
                  onClick={handleLoadMoreCorrectives}
                  disabled={!correctivesNextCursor || correctivesLoadingMore}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {correctivesLoadingMore ? "Carregando..." : "Carregar mais"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Iniciar inspeção por TAG</h2>
        <p className="mt-1 text-sm text-slate-500">
          Digite a TAG desejada para ir direto ao checklist correspondente.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={searchTag}
            onChange={event => setSearchTag(event.target.value.toUpperCase())}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Ex.: ABC123"
            className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm uppercase tracking-wide text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:flex-1"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Iniciar
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Máquinas disponíveis</h2>
            <p className="text-sm text-slate-500">Selecione uma máquina para abrir uma nova inspeção.</p>
          </div>
          {sessionLoading && (
            <span className="text-xs text-slate-400">Carregando sessão...</span>
          )}
        </div>

        {machinesLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : machinesError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{machinesError}</div>
        ) : machines.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
            Nenhuma máquina atribuída a você no momento.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {machines.map(machine => {
              const hasTag = Boolean(machine.tag);
              return (
                <article
                  key={machine.id}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-transparent bg-white shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"
                >
                  {machine.fotoUrl ? (
                    <div className="relative h-40 w-full">
                      <Image
                        src={machine.fotoUrl}
                        alt={`Foto da máquina ${machine.nome ?? machine.tag ?? ""}`}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      />
                    </div>
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-slate-100 text-sm font-medium text-slate-500">
                      Sem imagem
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-slate-900">{machine.nome ?? "Máquina"}</h3>
                      <p className="text-sm text-slate-600">TAG: {machine.tag ?? "-"}</p>
                      <p className="text-xs text-slate-500">Setor: {machine.setor ?? "-"}</p>
                      <p className="text-xs text-slate-500">Unidade: {machine.unidade ?? "-"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectMachine(machine.tag)}
                      disabled={!hasTag}
                      className="mt-auto inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      {hasTag ? "Iniciar inspeção" : "TAG indisponível"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
