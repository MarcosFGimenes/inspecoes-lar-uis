import type {
  InspectionIsoHeaderConfig,
  IsoHeaderFontFamily,
  IsoHeaderFontStyle,
  IsoHeaderText,
  IsoHeaderTextSegment,
} from "@/types";

export const ISO_HEADER_FONT_FAMILIES: IsoHeaderFontFamily[] = ["helvetica", "times", "courier"];
export const ISO_HEADER_FONT_STYLES: IsoHeaderFontStyle[] = ["normal", "bold", "italic", "bolditalic"];

const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 28;
const MIN_LETTER_SPACING = -2;
const MAX_LETTER_SPACING = 8;

const DEFAULT_SEGMENT_STYLE = {
  color: "#111111",
  fontFamily: "helvetica" as IsoHeaderFontFamily,
  fontStyle: "normal" as IsoHeaderFontStyle,
  fontSize: 10,
  letterSpacing: 0,
};

const DEFAULT_CONFIG: InspectionIsoHeaderConfig = {
  emissao: {
    segments: [{ text: "08/04/2024", ...DEFAULT_SEGMENT_STYLE }],
  },
  revisao: {
    segments: [{ text: "05/07/2024", ...DEFAULT_SEGMENT_STYLE }],
  },
  revisaoNumero: {
    segments: [{ text: "01", ...DEFAULT_SEGMENT_STYLE }],
  },
  foNumero: {
    segments: [{ text: "FO 012 050 33", ...DEFAULT_SEGMENT_STYLE }],
  },
  orientacoes: {
    segments: [
      {
        text: "Registrar desvios, acoes corretivas e responsaveis.",
        ...DEFAULT_SEGMENT_STYLE,
      },
    ],
  },
};

function cloneTextSegment(segment: IsoHeaderTextSegment): IsoHeaderTextSegment {
  return {
    text: segment.text,
    color: segment.color ?? DEFAULT_SEGMENT_STYLE.color,
    fontFamily: segment.fontFamily ?? DEFAULT_SEGMENT_STYLE.fontFamily,
    fontStyle: segment.fontStyle ?? DEFAULT_SEGMENT_STYLE.fontStyle,
    fontSize: segment.fontSize ?? DEFAULT_SEGMENT_STYLE.fontSize,
    letterSpacing: segment.letterSpacing ?? DEFAULT_SEGMENT_STYLE.letterSpacing,
  };
}

function cloneText(text: IsoHeaderText): IsoHeaderText {
  return {
    segments: text.segments.map(cloneTextSegment),
  };
}

function cloneConfig(config: InspectionIsoHeaderConfig): InspectionIsoHeaderConfig {
  return {
    emissao: cloneText(config.emissao),
    revisao: cloneText(config.revisao),
    revisaoNumero: cloneText(config.revisaoNumero),
    foNumero: cloneText(config.foNumero),
    orientacoes: cloneText(config.orientacoes),
  };
}

function normalizeColor(value: unknown) {
  if (typeof value !== "string") return DEFAULT_SEGMENT_STYLE.color;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_SEGMENT_STYLE.color;
  const rgb3 = /^#([0-9a-fA-F]{3})$/;
  const rgb6 = /^#([0-9a-fA-F]{6})$/;
  if (rgb6.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const shortMatch = trimmed.match(rgb3);
  if (shortMatch?.[1]) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return DEFAULT_SEGMENT_STYLE.color;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeFontFamily(value: unknown): IsoHeaderFontFamily {
  if (typeof value !== "string") return DEFAULT_SEGMENT_STYLE.fontFamily;
  if (ISO_HEADER_FONT_FAMILIES.includes(value as IsoHeaderFontFamily)) {
    return value as IsoHeaderFontFamily;
  }
  return DEFAULT_SEGMENT_STYLE.fontFamily;
}

function normalizeFontStyle(value: unknown): IsoHeaderFontStyle {
  if (typeof value !== "string") return DEFAULT_SEGMENT_STYLE.fontStyle;
  if (ISO_HEADER_FONT_STYLES.includes(value as IsoHeaderFontStyle)) {
    return value as IsoHeaderFontStyle;
  }
  return DEFAULT_SEGMENT_STYLE.fontStyle;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeSegment(raw: unknown, fallbackText: string): IsoHeaderTextSegment {
  if (!isRecord(raw)) {
    return {
      text: fallbackText,
      ...DEFAULT_SEGMENT_STYLE,
    };
  }

  const text = typeof raw.text === "string" ? raw.text : fallbackText;
  return {
    text,
    color: normalizeColor(raw.color),
    fontFamily: normalizeFontFamily(raw.fontFamily),
    fontStyle: normalizeFontStyle(raw.fontStyle),
    fontSize: clampNumber(raw.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE, DEFAULT_SEGMENT_STYLE.fontSize),
    letterSpacing: clampNumber(
      raw.letterSpacing,
      MIN_LETTER_SPACING,
      MAX_LETTER_SPACING,
      DEFAULT_SEGMENT_STYLE.letterSpacing
    ),
  };
}

function sanitizeText(raw: unknown, fallbackText: string): IsoHeaderText {
  if (typeof raw === "string") {
    return {
      segments: [
        {
          text: raw,
          ...DEFAULT_SEGMENT_STYLE,
        },
      ],
    };
  }
  if (!isRecord(raw)) {
    return {
      segments: [
        {
          text: fallbackText,
          ...DEFAULT_SEGMENT_STYLE,
        },
      ],
    };
  }
  const segmentsRaw = Array.isArray(raw.segments) ? raw.segments : [];
  const segments = segmentsRaw.map((segment, index) => sanitizeSegment(segment, index === 0 ? fallbackText : ""));

  if (segments.length === 0) {
    segments.push({
      text: fallbackText,
      ...DEFAULT_SEGMENT_STYLE,
    });
  }

  return { segments };
}

export function createDefaultIsoHeaderConfig(): InspectionIsoHeaderConfig {
  return cloneConfig(DEFAULT_CONFIG);
}

export function sanitizeIsoHeaderConfig(raw: unknown): InspectionIsoHeaderConfig {
  const defaults = createDefaultIsoHeaderConfig();
  if (!isRecord(raw)) {
    return defaults;
  }
  return {
    emissao: sanitizeText(raw.emissao, serializeIsoHeaderText(defaults.emissao)),
    revisao: sanitizeText(raw.revisao, serializeIsoHeaderText(defaults.revisao)),
    revisaoNumero: sanitizeText(raw.revisaoNumero, serializeIsoHeaderText(defaults.revisaoNumero)),
    foNumero: sanitizeText(raw.foNumero, serializeIsoHeaderText(defaults.foNumero)),
    orientacoes: sanitizeText(raw.orientacoes, serializeIsoHeaderText(defaults.orientacoes)),
  };
}

export function serializeIsoHeaderText(text: IsoHeaderText | null | undefined) {
  if (!text?.segments?.length) return "";
  return text.segments.map(segment => segment.text ?? "").join("");
}

export function normalizeIsoHeaderForStorage(raw: unknown) {
  return sanitizeIsoHeaderConfig(raw);
}

export function mapIsoHeaderFontToCss(font: IsoHeaderFontFamily | null | undefined) {
  if (font === "times") {
    return "'Times New Roman', Times, serif";
  }
  if (font === "courier") {
    return "'Courier New', Courier, monospace";
  }
  return "Helvetica, Arial, sans-serif";
}

