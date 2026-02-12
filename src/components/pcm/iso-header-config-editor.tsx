"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createDefaultIsoHeaderConfig,
  ISO_HEADER_FONT_FAMILIES,
  ISO_HEADER_FONT_STYLES,
  mapIsoHeaderFontToCss,
  serializeIsoHeaderText,
} from "@/lib/iso-header-config";
import type { InspectionIsoHeaderConfig, IsoHeaderFontStyle, IsoHeaderTextSegment } from "@/types";

type HeaderFieldKey = keyof InspectionIsoHeaderConfig;

interface IsoHeaderConfigEditorProps {
  value: InspectionIsoHeaderConfig;
  onChange(next: InspectionIsoHeaderConfig): void;
  disabled?: boolean;
}

const FIELD_DEFINITIONS: Array<{ key: HeaderFieldKey; label: string; helper: string }> = [
  {
    key: "foNumero",
    label: "Numero (da FO)",
    helper: "Valor exibido no campo NÚMERO do cabeçalho.",
  },
  {
    key: "emissao",
    label: "EMISSAO",
    helper: "Valor exibido no campo de emissao.",
  },
  {
    key: "revisao",
    label: "REVISAO",
    helper: "Valor exibido no campo de revisao.",
  },
  {
    key: "revisaoNumero",
    label: "Nº (da revisao)",
    helper: "Valor exibido na coluna Nº.",
  },
  {
    key: "orientacoes",
    label: "Orientacoes",
    helper: "Avisos e orientacoes exibidos no bloco informativo.",
  },
];

const FONT_FAMILY_LABELS: Record<(typeof ISO_HEADER_FONT_FAMILIES)[number], string> = {
  helvetica: "Helvetica",
  times: "Times",
  courier: "Courier",
};

const FONT_STYLE_LABELS: Record<IsoHeaderFontStyle, string> = {
  normal: "Normal",
  bold: "Negrito",
  italic: "Italico",
  bolditalic: "Negrito + Italico",
};

function toCssFontStyle(style: IsoHeaderFontStyle | null | undefined) {
  const normalized = style ?? "normal";
  return {
    fontWeight: normalized === "bold" || normalized === "bolditalic" ? 700 : 400,
    fontStyle: normalized === "italic" || normalized === "bolditalic" ? "italic" : "normal",
  } as const;
}

function createDefaultSegment(): IsoHeaderTextSegment {
  return {
    text: "",
    color: "#111111",
    fontFamily: "helvetica",
    fontStyle: "normal",
    fontSize: 10,
    letterSpacing: 0,
  };
}

export function IsoHeaderConfigEditor({ value, onChange, disabled = false }: IsoHeaderConfigEditorProps) {
  const defaults = useMemo(() => createDefaultIsoHeaderConfig(), []);

  const updateSegment = (fieldKey: HeaderFieldKey, index: number, patch: Partial<IsoHeaderTextSegment>) => {
    const currentField = value[fieldKey];
    const nextSegments = currentField.text.segments.map((segment, segmentIndex) =>
      segmentIndex === index ? { ...segment, ...patch } : segment
    );
    onChange({
      ...value,
      [fieldKey]: {
        ...currentField,
        text: {
          ...currentField.text,
          segments: nextSegments,
        },
      },
    });
  };

  const addSegment = (fieldKey: HeaderFieldKey) => {
    const currentField = value[fieldKey];
    onChange({
      ...value,
      [fieldKey]: {
        ...currentField,
        text: {
          ...currentField.text,
          segments: [...currentField.text.segments, createDefaultSegment()],
        },
      },
    });
  };

  const removeSegment = (fieldKey: HeaderFieldKey, index: number) => {
    const currentField = value[fieldKey];
    if (currentField.text.segments.length <= 1) {
      onChange({
        ...value,
        [fieldKey]: {
          ...currentField,
          text: {
            ...currentField.text,
            segments: [{ ...currentField.text.segments[0], text: "" }],
          },
        },
      });
      return;
    }
    onChange({
      ...value,
      [fieldKey]: {
        ...currentField,
        text: {
          ...currentField.text,
          segments: currentField.text.segments.filter((_, segmentIndex) => segmentIndex !== index),
        },
      },
    });
  };

  const updateVisibility = (
    fieldKey: HeaderFieldKey,
    target: "pdf" | "inspectionHeader",
    checked: boolean
  ) => {
    const currentField = value[fieldKey];
    onChange({
      ...value,
      [fieldKey]: {
        ...currentField,
        visibility: {
          ...currentField.visibility,
          [target]: checked,
        },
      },
    });
  };

  const resetField = (fieldKey: HeaderFieldKey) => {
    onChange({
      ...value,
      [fieldKey]: defaults[fieldKey],
    });
  };

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-[var(--text)]">Cabecalho ISO da inspecao</h4>
        <p className="text-xs text-[var(--muted)]">
          Personalize cada campo por segmentos. Para cor por palavra/letra, crie segmentos separados.
        </p>
      </header>

      <div className="space-y-4">
        {FIELD_DEFINITIONS.map(field => {
          const fieldValue = value[field.key];
          const previewText = serializeIsoHeaderText(fieldValue.text).trim();
          return (
            <article key={field.key} className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h5 className="text-sm font-semibold text-[var(--text)]">{field.label}</h5>
                  <p className="text-xs text-[var(--muted)]">{field.helper}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={fieldValue.visibility.pdf}
                        onChange={event => updateVisibility(field.key, "pdf", event.target.checked)}
                        disabled={disabled}
                      />
                      Exibir no PDF
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={fieldValue.visibility.inspectionHeader}
                        onChange={event =>
                          updateVisibility(field.key, "inspectionHeader", event.target.checked)
                        }
                        disabled={disabled}
                      />
                      Exibir no cabeçalho da inspeção
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => resetField(field.key)}
                    disabled={disabled}
                  >
                    Restaurar padrao
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => addSegment(field.key)}
                    disabled={disabled}
                  >
                    Adicionar segmento
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">Pre-visualizacao</p>
                <div className="min-h-7 text-sm leading-relaxed">
                  {previewText ? (
                    fieldValue.text.segments.map((segment, index) => {
                      const styleInfo = toCssFontStyle(segment.fontStyle ?? "normal");
                      return (
                        <span
                          key={`${field.key}-preview-${index}`}
                          style={{
                            color: segment.color ?? "#111111",
                            fontFamily: mapIsoHeaderFontToCss(segment.fontFamily),
                            fontSize: `${segment.fontSize ?? 10}px`,
                            letterSpacing: `${segment.letterSpacing ?? 0}px`,
                            fontWeight: styleInfo.fontWeight,
                            fontStyle: styleInfo.fontStyle,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {segment.text}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-xs text-[var(--muted)]">Sem conteudo configurado.</span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {fieldValue.text.segments.map((segment, index) => (
                  <div key={`${field.key}-segment-${index}`} className="rounded-lg border border-[var(--border)] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-medium text-[var(--muted)]">Segmento {index + 1}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSegment(field.key, index)}
                        disabled={disabled}
                      >
                        Remover
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <label className="space-y-1 text-xs">
                        <span className="text-[var(--muted)]">Texto</span>
                        <Input
                          value={segment.text ?? ""}
                          onChange={event => updateSegment(field.key, index, { text: event.target.value })}
                          placeholder="Digite o texto deste segmento"
                          disabled={disabled}
                        />
                      </label>

                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                        <label className="space-y-1 text-xs">
                          <span className="text-[var(--muted)]">Cor</span>
                          <input
                            type="color"
                            value={segment.color ?? "#111111"}
                            onChange={event => updateSegment(field.key, index, { color: event.target.value })}
                            disabled={disabled}
                            className="h-11 w-full cursor-pointer rounded-2xl border border-[var(--border)] bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>

                        <label className="space-y-1 text-xs">
                          <span className="text-[var(--muted)]">Fonte</span>
                          <Select
                            value={segment.fontFamily ?? "helvetica"}
                            onChange={event =>
                              updateSegment(field.key, index, {
                                fontFamily: event.target.value as IsoHeaderTextSegment["fontFamily"],
                              })
                            }
                            disabled={disabled}
                          >
                            {ISO_HEADER_FONT_FAMILIES.map(font => (
                              <option key={font} value={font}>
                                {FONT_FAMILY_LABELS[font]}
                              </option>
                            ))}
                          </Select>
                        </label>

                        <label className="space-y-1 text-xs">
                          <span className="text-[var(--muted)]">Estilo</span>
                          <Select
                            value={segment.fontStyle ?? "normal"}
                            onChange={event =>
                              updateSegment(field.key, index, {
                                fontStyle: event.target.value as IsoHeaderTextSegment["fontStyle"],
                              })
                            }
                            disabled={disabled}
                          >
                            {ISO_HEADER_FONT_STYLES.map(style => (
                              <option key={style} value={style}>
                                {FONT_STYLE_LABELS[style]}
                              </option>
                            ))}
                          </Select>
                        </label>

                        <label className="space-y-1 text-xs">
                          <span className="text-[var(--muted)]">Tamanho</span>
                          <Input
                            type="number"
                            min={6}
                            max={28}
                            step={1}
                            value={segment.fontSize ?? 10}
                            onChange={event =>
                              updateSegment(field.key, index, {
                                fontSize: Number(event.target.value || 10),
                              })
                            }
                            disabled={disabled}
                          />
                        </label>

                        <label className="space-y-1 text-xs">
                          <span className="text-[var(--muted)]">Espaco entre letras</span>
                          <Input
                            type="number"
                            min={-2}
                            max={8}
                            step={0.1}
                            value={segment.letterSpacing ?? 0}
                            onChange={event =>
                              updateSegment(field.key, index, {
                                letterSpacing: Number(event.target.value || 0),
                              })
                            }
                            disabled={disabled}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

