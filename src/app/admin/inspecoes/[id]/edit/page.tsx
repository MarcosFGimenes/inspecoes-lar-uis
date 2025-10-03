"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface TemplateItemData {
  id?: string;
  componente?: string;
  oQueChecar?: string;
  instrumento?: string;
  criterio?: string;
  oQueFazer?: string;
  ordem?: number;
}

interface ApiAnswer {
  questionId: string;
  questionText?: string | null;
  response: "c" | "nc" | "na";
  observation?: string | null;
  photoUrls?: string[];
}

interface ApiInspection {
  id: string;
  answers?: ApiAnswer[];
  observacoes?: string | null;
  osNumero?: string | null;
  createdAt?: string | null;
  finalizadaEm?: string | null;
  maintainer?: {
    nome?: string | null;
    matricula?: string | null;
  } | null;
  machine?: MachineData | null;
  qtdNC?: number;
}

interface ApiResponse {
  inspection: ApiInspection;
  template: {
    id?: string | null;
    nome?: string | null;
    versao?: string | null;
    itens?: TemplateItemData[];
  } | null;
  machine: MachineData | null;
}

interface MachineData {
  machineId?: string | null;
  id?: string | null;
  nome?: string | null;
  tag?: string | null;
  setor?: string | null;
  unidade?: string | null;
  localUnidade?: string | null;
  lac?: string | null;
}

interface NewPhoto {
  id: string;
  dataUrl: string;
  name?: string;
}

interface FormItem {
  questionId: string;
  questionText: string;
  componente?: string;
  oQueChecar?: string;
  instrumento?: string;
  criterio?: string;
  oQueFazer?: string;
  order: number;
  previousResponse: "c" | "nc" | "na";
  response: "c" | "nc" | "na";
  observation: string;
  existingPhotos: string[];
  newPhotos: NewPhoto[];
}

interface FormState {
  osNumero: string;
  observacoes: string;
  items: FormItem[];
}

function normalizeId(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatMachineLabel(machine: MachineData | null | undefined) {
  if (!machine) return "Máquina";
  const nome = machine.nome ? String(machine.nome) : "Máquina";
  const tag = machine.tag ? String(machine.tag) : null;
  return tag ? `${nome} (${tag})` : nome;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

export default function EditInspectionPage() {
  const params = useParams();
  const idParam = normalizeId(params?.id as string | string[] | undefined);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [machine, setMachine] = useState<MachineData | null>(null);
  const [templateInfo, setTemplateInfo] = useState<{ nome?: string | null; versao?: string | null } | null>(null);
  const [operatorLabel, setOperatorLabel] = useState<string>("-");
  const [dateLabel, setDateLabel] = useState<string>("-");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inspectionId = idParam ? String(idParam) : null;

  const loadInspection = useCallback(async () => {
    if (!inspectionId) {
      setError("Identificador da inspeção não encontrado.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await fetch("/api/admin-session", { cache: "no-store" });
      if (session.status === 401) {
        window.location.href = "/admin/login";
        return;
      }

      const response = await fetch(`/api/inspecoes/${inspectionId}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Falha ao carregar inspeção");
      }
      const data = (await response.json()) as ApiResponse;
      const inspection = data.inspection ?? { id: inspectionId };
      const template = data.template ?? null;
      const machineData = inspection.machine ?? data.machine ?? null;
      const answers = Array.isArray(inspection.answers) ? inspection.answers : [];

      const templateItems = Array.isArray(template?.itens) ? template.itens : [];
      const templateMap = new Map<string, TemplateItemData>();
      templateItems.forEach(item => {
        if (item?.id) templateMap.set(String(item.id), item);
      });

      const answersMap = new Map<string, ApiAnswer>();
      answers.forEach(answer => {
        if (answer?.questionId) answersMap.set(answer.questionId, answer);
      });

      const formItems: FormItem[] = templateItems.map((item, index) => {
        const answer = item.id ? answersMap.get(String(item.id)) : undefined;
        const response = answer?.response ?? "c";
        return {
          questionId: item.id ? String(item.id) : `template-${index}`,
          questionText:
            answer?.questionText ||
            item.oQueChecar ||
            item.criterio ||
            item.componente ||
            `Item ${index + 1}`,
          componente: item.componente,
          oQueChecar: item.oQueChecar,
          instrumento: item.instrumento,
          criterio: item.criterio,
          oQueFazer: item.oQueFazer,
          order: typeof item.ordem === "number" ? item.ordem : index,
          previousResponse: response,
          response,
          observation: answer?.observation ?? "",
          existingPhotos: Array.isArray(answer?.photoUrls) ? answer!.photoUrls!.filter(Boolean) : [],
          newPhotos: [],
        };
      });

      answers.forEach(answer => {
        if (answer?.questionId && !templateMap.has(answer.questionId)) {
          formItems.push({
            questionId: answer.questionId,
            questionText: answer.questionText ?? `Item ${answer.questionId}`,
            componente: undefined,
            oQueChecar: undefined,
            instrumento: undefined,
            criterio: undefined,
            oQueFazer: undefined,
            order: Number.MAX_SAFE_INTEGER,
            previousResponse: answer.response,
            response: answer.response,
            observation: answer.observation ?? "",
            existingPhotos: Array.isArray(answer.photoUrls) ? answer.photoUrls.filter(Boolean) : [],
            newPhotos: [],
          });
        }
      });

      formItems.sort((a, b) => a.order - b.order);

      setForm({
        osNumero: inspection.osNumero ?? "",
        observacoes: inspection.observacoes ?? "",
        items: formItems,
      });
      setMachine(machineData);
      setTemplateInfo({ nome: template?.nome ?? null, versao: template?.versao ?? null });

      const maintainer = inspection.maintainer ?? null;
      const operator = maintainer?.nome ? String(maintainer.nome) : "-";
      const matricula = maintainer?.matricula ? ` (${maintainer.matricula})` : "";
      setOperatorLabel(`${operator}${matricula}`);
      const date = inspection.finalizadaEm ?? inspection.createdAt ?? null;
      setDateLabel(formatDateTime(date));
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Erro ao carregar inspeção";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    loadInspection();
  }, [loadInspection]);

  const hasNonConformity = useMemo(() => {
    return form?.items.some(item => item.response === "nc") ?? false;
  }, [form]);

  const handleResponseChange = useCallback((questionId: string, response: "c" | "nc" | "na") => {
    setForm(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item => (item.questionId === questionId ? { ...item, response } : item)),
      };
    });
  }, []);

  const handleObservationChange = useCallback((questionId: string, value: string) => {
    setForm(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item => (item.questionId === questionId ? { ...item, observation: value } : item)),
      };
    });
  }, []);

  const handleAddPhotos = useCallback(async (questionId: string, files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    setForm(prev => {
      if (!prev) return prev;
      const target = prev.items.find(item => item.questionId === questionId);
      if (!target) return prev;
      const currentCount = target.existingPhotos.length + target.newPhotos.length;
      const available = Math.max(0, 3 - currentCount);
      if (available <= 0) {
        return prev;
      }
      const allowedFiles = selected.slice(0, available);
      setSaveError(null);
      Promise.all(allowedFiles.map(file => readFileAsDataUrl(file)))
        .then(dataUrls => {
          setForm(innerPrev => {
            if (!innerPrev) return innerPrev;
            return {
              ...innerPrev,
              items: innerPrev.items.map(item => {
                if (item.questionId !== questionId) return item;
                const newPhotos = dataUrls.map((dataUrl, index) => ({
                  id: generateId(),
                  dataUrl,
                  name: allowedFiles[index]?.name,
                }));
                return { ...item, newPhotos: [...item.newPhotos, ...newPhotos] };
              }),
            };
          });
        })
        .catch(err => {
          const message = err instanceof Error && err.message ? err.message : "Erro ao processar imagem";
          setSaveError(message);
        });
      return prev;
    });
  }, []);

  const handleRemoveNewPhoto = useCallback((questionId: string, photoId: string) => {
    setForm(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item => {
          if (item.questionId !== questionId) return item;
          return { ...item, newPhotos: item.newPhotos.filter(photo => photo.id !== photoId) };
        }),
      };
    });
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!inspectionId || !form) return;
      try {
        setSaving(true);
        setSaveError(null);
        setSaveSuccess(null);

        const itensPayload = form.items.map(item => {
          const photosPayload: Array<string | { dataUrl: string; name?: string } | undefined> = [];
          item.existingPhotos.forEach(url => {
            photosPayload.push(url);
          });
          item.newPhotos.forEach(photo => {
            photosPayload.push({ dataUrl: photo.dataUrl, name: photo.name });
          });
          return {
            questionId: item.questionId,
            response: item.response,
            observation: item.observation.trim() ? item.observation.trim() : undefined,
            photoUrls: photosPayload.length > 0 ? photosPayload : undefined,
          };
        });

        const payload = {
          osNumero: form.osNumero.trim() ? form.osNumero.trim() : undefined,
          observacoes: form.observacoes.trim() ? form.observacoes.trim() : undefined,
          itens: itensPayload,
        };

        const response = await fetch(`/api/inspecoes/${inspectionId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "Falha ao salvar inspeção");
        }

        setSaveSuccess("Inspeção atualizada com sucesso.");
        await loadInspection();
      } catch (err: unknown) {
        const message = err instanceof Error && err.message ? err.message : "Erro ao salvar alterações";
        setSaveError(message);
      } finally {
        setSaving(false);
      }
    },
    [form, inspectionId, loadInspection]
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-[var(--text)]">Editar inspeção</h1>
        </header>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/3" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-[var(--text)]">Editar inspeção</h1>
          <Button variant="secondary" onClick={() => loadInspection()}>
            Recarregar
          </Button>
        </header>
        <div className="rounded-lg border border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_80%)] px-4 py-3 text-[var(--danger)]">
          {error}
        </div>
      </div>
    );
  }

  if (!form || !inspectionId) {
    return null;
  }

  const machineLabel = formatMachineLabel(machine);
  const locationLabel = machine
    ? [machine.unidade, machine.localUnidade, machine.setor].filter(Boolean).join(" • ")
    : "";

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-[var(--text)]">Editar inspeção</h1>
            {hasNonConformity ? (
              <Badge variant="danger">Com NC</Badge>
            ) : (
              <Badge variant="success">Sem NC</Badge>
            )}
          </div>
          <p className="text-sm text-[var(--muted)]">Revise as respostas e atualize as tratativas conforme necessário.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" type="button" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Link
            href={`/api/inspecoes/${inspectionId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <Button type="button" variant="secondary">
              Ver PDF
            </Button>
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-xl text-[var(--text)]">{machineLabel}</CardTitle>
          {locationLabel && <p className="text-sm text-[var(--muted)]">{locationLabel}</p>}
          <div className="grid gap-2 text-sm text-[var(--muted)] md:grid-cols-3">
            <div>
              <span className="font-medium text-[var(--text)]">LAC:</span> {machine?.lac ?? "-"}
            </div>
            <div>
              <span className="font-medium text-[var(--text)]">Operador:</span> {operatorLabel}
            </div>
            <div>
              <span className="font-medium text-[var(--text)]">Data:</span> {dateLabel}
            </div>
          </div>
          <div className="text-sm text-[var(--muted)]">
            Template: {templateInfo?.nome ?? "-"}
            {templateInfo?.versao ? ` (versão ${templateInfo.versao})` : ""}
          </div>
        </CardHeader>
      </Card>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-[var(--text)]">Dados gerais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted)]">Número da O.S.</span>
                <Input
                  value={form.osNumero}
                  onChange={event => setForm(prev => (prev ? { ...prev, osNumero: event.target.value } : prev))}
                  placeholder="Informe o número da OS"
                />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="text-[var(--muted)]">Observações gerais</span>
                <Textarea
                  value={form.observacoes}
                  onChange={event => setForm(prev => (prev ? { ...prev, observacoes: event.target.value } : prev))}
                  placeholder="Anote observações relevantes"
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {form.items.map(item => {
            const warnResolve = item.previousResponse === "nc" && item.response !== "nc";
            const warnCreate = item.previousResponse !== "nc" && item.response === "nc";
            const availableSlots = Math.max(0, 3 - (item.existingPhotos.length + item.newPhotos.length));
            return (
              <section
                key={item.questionId}
                className="rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm"
              >
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text)]">{item.questionText}</h3>
                      {item.criterio && (
                        <p className="text-sm text-[var(--muted)]">Critério: {item.criterio}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <label className="inline-flex items-center gap-2 text-sm text-[var(--text)]">
                        <input
                          type="radio"
                          name={`response-${item.questionId}`}
                          value="c"
                          checked={item.response === "c"}
                          onChange={() => handleResponseChange(item.questionId, "c")}
                        />
                        Conformidade
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-[var(--text)]">
                        <input
                          type="radio"
                          name={`response-${item.questionId}`}
                          value="nc"
                          checked={item.response === "nc"}
                          onChange={() => handleResponseChange(item.questionId, "nc")}
                        />
                        Não conformidade
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-[var(--text)]">
                        <input
                          type="radio"
                          name={`response-${item.questionId}`}
                          value="na"
                          checked={item.response === "na"}
                          onChange={() => handleResponseChange(item.questionId, "na")}
                        />
                        Não se aplica
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm text-[var(--muted)] md:grid-cols-2">
                    {item.componente && (
                      <div>
                        <span className="font-medium text-[var(--text)]">Componente:</span> {item.componente}
                      </div>
                    )}
                    {item.instrumento && (
                      <div>
                        <span className="font-medium text-[var(--text)]">Instrumento:</span> {item.instrumento}
                      </div>
                    )}
                    {item.oQueFazer && (
                      <div className="md:col-span-2">
                        <span className="font-medium text-[var(--text)]">O que fazer:</span> {item.oQueFazer}
                      </div>
                    )}
                  </div>

                  {warnResolve && (
                    <div className="rounded-lg border border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary),#fff_85%)] px-4 py-3 text-sm text-[var(--primary-700)]">
                      Esta tratativa será encerrada como resolvida ao salvar.
                    </div>
                  )}
                  {warnCreate && (
                    <div className="rounded-lg border border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_85%)] px-4 py-3 text-sm text-[var(--danger)]">
                      Uma nova tratativa será aberta para este item.
                    </div>
                  )}

                  <label className="space-y-1 text-sm">
                    <span className="text-[var(--muted)]">Observação do item</span>
                    <Textarea
                      value={item.observation}
                      onChange={event => handleObservationChange(item.questionId, event.target.value)}
                      placeholder="Detalhe o ocorrido"
                    />
                  </label>

                  {item.existingPhotos.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-[var(--text)]">Fotos existentes</p>
                      <div className="flex flex-wrap gap-3">
                        {item.existingPhotos.map((photo, index) => (
                          <div
                            key={`${item.questionId}-existing-${index}`}
                            className="overflow-hidden rounded-lg border border-[var(--border)] bg-white"
                          >
                            <Image
                              src={photo}
                              alt={`Foto existente ${index + 1}`}
                              width={160}
                              height={120}
                              className="h-24 w-40 object-cover"
                              unoptimized
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.newPhotos.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-[var(--text)]">Novas fotos</p>
                      <div className="flex flex-wrap gap-3">
                        {item.newPhotos.map(photo => (
                          <div
                            key={photo.id}
                            className="relative overflow-hidden rounded-lg border border-[var(--border)] bg-white"
                          >
                            <Image
                              src={photo.dataUrl}
                              alt="Nova foto"
                              width={160}
                              height={120}
                              className="h-24 w-40 object-cover"
                              unoptimized
                            />
                            <button
                              type="button"
                              className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                              onClick={() => handleRemoveNewPhoto(item.questionId, photo.id)}
                            >
                              remover
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <label className="space-y-1 text-sm">
                    <span className="text-[var(--muted)]">Adicionar novas fotos (máx. 3)</span>
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={availableSlots <= 0}
                      onChange={event => {
                        handleAddPhotos(item.questionId, event.target.files);
                        event.target.value = "";
                      }}
                    />
                    {availableSlots <= 0 && (
                      <span className="text-xs text-[var(--muted)]">Limite de fotos atingido para este item.</span>
                    )}
                  </label>
                </div>
              </section>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm">
            {saveError && <p className="text-[var(--danger)]">{saveError}</p>}
            {saveSuccess && <p className="text-[var(--primary-700)]">{saveSuccess}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="ghost" onClick={() => router.back()} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Salvar alterações
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
