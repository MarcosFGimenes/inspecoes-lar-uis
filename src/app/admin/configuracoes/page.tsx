"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IsoHeaderConfigEditor } from "@/components/pcm/iso-header-config-editor";
import { Button } from "@/components/ui/button";
import {
  createDefaultIsoHeaderConfig,
  sanitizeIsoHeaderConfig,
  serializeIsoHeaderText,
} from "@/lib/iso-header-config";
import type { InspectionIsoHeaderConfig } from "@/types";

type ConfigResponse = {
  isoHeaderConfig?: unknown;
  updatedAt?: string | null;
  error?: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export default function AdminConfiguracoesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isoHeaderConfig, setIsoHeaderConfig] = useState<InspectionIsoHeaderConfig>(() =>
    createDefaultIsoHeaderConfig()
  );

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const session = await fetch("/api/admin-session", { cache: "no-store" });
      if (session.status === 401) {
        window.location.href = "/admin/login";
        return;
      }

      const response = await fetch("/api/configuracoes/cabecalho-inspecao", { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ConfigResponse | null;
        throw new Error(payload?.error || "Falha ao carregar configuração.");
      }
      const payload = (await response.json()) as ConfigResponse;
      setIsoHeaderConfig(sanitizeIsoHeaderConfig(payload.isoHeaderConfig));
      setUpdatedAt(typeof payload.updatedAt === "string" ? payload.updatedAt : null);
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Falha ao carregar configuração.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig().catch(() => undefined);
  }, [loadConfig]);

  const summaryLine = useMemo(() => {
    return [
      `FO: ${serializeIsoHeaderText(isoHeaderConfig.foNumero) || "-"}`,
      `Emissão: ${serializeIsoHeaderText(isoHeaderConfig.emissao) || "-"}`,
      `Revisão: ${serializeIsoHeaderText(isoHeaderConfig.revisao) || "-"}`,
      `Nº: ${serializeIsoHeaderText(isoHeaderConfig.revisaoNumero) || "-"}`,
    ].join(" | ");
  }, [isoHeaderConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/configuracoes/cabecalho-inspecao", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isoHeaderConfig }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ConfigResponse | null;
        throw new Error(payload?.error || "Falha ao salvar configuração.");
      }
      const payload = (await response.json()) as ConfigResponse;
      setIsoHeaderConfig(sanitizeIsoHeaderConfig(payload.isoHeaderConfig));
      setUpdatedAt(typeof payload.updatedAt === "string" ? payload.updatedAt : new Date().toISOString());
      setSuccess("Configuração salva com sucesso.");
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : "Falha ao salvar configuração.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [isoHeaderConfig]);

  const handleRestoreDefaults = useCallback(() => {
    setIsoHeaderConfig(createDefaultIsoHeaderConfig());
    setSuccess(null);
    setError(null);
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text)]">Configurações do cabeçalho ISO</h1>
            <p className="text-sm text-[var(--muted)]">
              Esta configuração é global e será exibida em todas as telas de preenchimento de inspeção.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={loadConfig} disabled={loading || saving}>
              <i className="fas fa-rotate" aria-hidden />
              Recarregar
            </Button>
            <Button type="button" variant="ghost" onClick={handleRestoreDefaults} disabled={loading || saving}>
              Restaurar padrão
            </Button>
            <Button type="button" onClick={handleSave} loading={saving} disabled={loading || saving}>
              Salvar configurações
            </Button>
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="text-sm text-[var(--text)]">{summaryLine}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Última atualização: <span className="font-medium">{formatDateTime(updatedAt)}</span>
        </p>
      </section>

      {error ? (
        <div className="rounded-xl border border-[var(--danger)] bg-[color-mix(in_oklab,var(--danger),#fff_85%)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary),#fff_85%)] px-4 py-3 text-sm text-[var(--primary-700)]">
          {success}
        </div>
      ) : null}

      <IsoHeaderConfigEditor
        value={isoHeaderConfig}
        onChange={value => setIsoHeaderConfig(sanitizeIsoHeaderConfig(value))}
        disabled={loading || saving}
      />
    </div>
  );
}

