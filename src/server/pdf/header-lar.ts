import { readFileSync } from "fs";
import { join } from "path";
import type { jsPDF } from "jspdf";

export type LarHeaderData = {
  tituloTemplate: string;
  unidade: string;
  setor: string;
  dataInspecaoISO?: string;
  maquinaNome: string;
  tag: string;
  fotoMaquinaDataUrl?: string;
  ordemServico?: string;
  templateTitle?: string;
  templateVersion?: string;
  operatorNome?: string;
  operatorMatricula?: string;
  dataHoraISO?: string;
  lac?: string;
  local?: string;
};

const M = 10;
const W = 210 - 2 * M;
const H_TOP = 28;
const W_LOGO = 38;
const W_TITLE = 80;
const W_BOX = 72;
const H_INFO_ROW1 = 9;
const H_INFO_ROW2 = 9;
const H_INFO = H_INFO_ROW1 + H_INFO_ROW2;
const W_LEFT = W - W_BOX;
const Y_PANEL = M + H_TOP + H_INFO;
const DEFAULT_H_PANEL = 40;
const X_PHOTO = M + W_LEFT + 2;
const Y_PHOTO = M + H_TOP + 2;
const W_PHOTO = W_BOX - 4;
const DEFAULT_H_PHOTO = 36;
const H_MACHINE_LABEL = 7;
const MACHINE_LABEL_GAP = 2;
const H_PHOTO = DEFAULT_H_PHOTO;

let cachedLarLogoDataUrl: string | null | undefined;

function loadLarLogoDataUrl(): string | null {
  if (cachedLarLogoDataUrl !== undefined) {
    return cachedLarLogoDataUrl;
  }

  try {
    const logoPath = join(process.cwd(), "public", "lar-logo.png");
    const buffer = readFileSync(logoPath);
    cachedLarLogoDataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
    return cachedLarLogoDataUrl;
  } catch {
    cachedLarLogoDataUrl = null;
    return null;
  }
}

function ensureDataUrl(src?: string | null): string | null {
  if (!src || typeof src !== "string") return null;
  return src.startsWith("data:") ? src : null;
}

function formatDate(iso?: string): string {
  if (!iso) return "__/__/____";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "__/__/____";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function drawImageContain(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) {
  const properties = doc.getImageProperties(dataUrl);
  const ratio = properties.width / properties.height;
  let drawWidth = w;
  let drawHeight = drawWidth / ratio;
  if (drawHeight > h) {
    drawHeight = h;
    drawWidth = drawHeight * ratio;
  }
  const dx = x + (w - drawWidth) / 2;
  const dy = y + (h - drawHeight) / 2;
  const format = properties.fileType;
  doc.addImage(dataUrl, format, dx, dy, drawWidth, drawHeight);
}

export function drawLarHeader(doc: jsPDF, data: LarHeaderData): {
  topHeightMm: number;
  photoBox: { x: number; y: number; w: number; h: number };
} {
  doc.setDrawColor(0);
  doc.setTextColor(0);

  // Top band
  doc.setLineWidth(0.4);
  doc.rect(M, M, W, H_TOP);

  const xLogoDivider = M + W_LOGO;
  const xTitleDivider = M + W_LOGO + W_TITLE;
  doc.line(xLogoDivider, M, xLogoDivider, M + H_TOP);
  doc.line(xTitleDivider, M, xTitleDivider, M + H_TOP);

  const boxX = xTitleDivider;
  const boxY = M;
  const boxRight = boxX + W_BOX;
  const boxMidY = boxY + H_TOP / 2;
  const boxLabelSplitY = boxMidY + (H_TOP / 2) / 2;
  const boxBottom = boxY + H_TOP;
  const boxMidX = boxX + W_BOX / 2;
  const boxC2 = boxX + W_BOX * 0.55;
  const boxC3 = boxX + W_BOX * 0.9;

  doc.setLineWidth(0.3);
  doc.line(boxX, boxMidY, boxRight, boxMidY);
  doc.line(boxX, boxLabelSplitY, boxRight, boxLabelSplitY);
  doc.line(boxMidX, boxY, boxMidX, boxMidY);
  doc.line(boxC2, boxMidY, boxC2, boxBottom);
  doc.line(boxC3, boxMidY, boxC3, boxBottom);

  // Logo
  const logoDataUrl = loadLarLogoDataUrl();
  const logoBox = {
    x: M + 3,
    y: M + 2,
    w: W_LOGO - 6,
    h: H_TOP - 4,
  };

  if (logoDataUrl) {
    drawImageContain(doc, logoDataUrl, logoBox.x, logoBox.y, logoBox.w, logoBox.h);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Lar", logoBox.x + logoBox.w / 2, logoBox.y + logoBox.h / 2, {
      align: "center",
      baseline: "middle",
    });
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const title = (data.tituloTemplate || "INSPEÇÃO").toUpperCase();
  const titleX = M + W_LOGO + W_TITLE / 2;
  const titleY = M + H_TOP / 2;
  doc.text(title, titleX, titleY, { align: "center", baseline: "middle" });

  // Box texts
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("NÚMERO:", boxX + 2, boxY + 6);
  doc.text("PÁGINAS:", boxMidX + 2, boxY + 6);

  doc.setFontSize(10);
  doc.text("FO 012 050 33", boxX + 2, boxMidY - 3);
  doc.text("1/1", boxMidX + 2, boxMidY - 3);

  doc.setFontSize(8.5);
  doc.text("EMISSÃO:", boxX + 2, boxLabelSplitY - 3);
  doc.text("REVISÃO:", boxC2 + 2, boxLabelSplitY - 3);
  doc.text("Nº", boxC3 + 2, boxLabelSplitY - 3);

  doc.setFontSize(10);
  doc.text("08/04/2024", boxX + 2, boxBottom - 3);
  doc.text("05/07/2024", boxC2 + 2, boxBottom - 3);
  doc.text("01", boxC3 + 2, boxBottom - 3);

  // Identification block
  const infoTop = M + H_TOP;
  const infoLeft = M;
  const leftBlockWidth = W_LEFT;
  const infoBottom = infoTop + H_INFO;
  const rowDividerY = infoTop + H_INFO_ROW1;

  doc.setLineWidth(0.4);
  doc.rect(infoLeft, infoTop, leftBlockWidth, H_INFO);
  doc.line(infoLeft, rowDividerY, infoLeft + leftBlockWidth, rowDividerY);

  const colUnidadeWidth = leftBlockWidth * 0.45;
  const colSetorWidth = leftBlockWidth * 0.35;
  const colSetorX = infoLeft + colUnidadeWidth;
  const colDataX = colSetorX + colSetorWidth;

  doc.setLineWidth(0.3);
  doc.line(colSetorX, infoTop, colSetorX, rowDividerY);
  doc.line(colDataX, infoTop, colDataX, rowDividerY);

  const unidade = data.unidade?.trim() || "-";
  const setor = data.setor?.trim() || "-";
  const dataInspecao = formatDate(data.dataInspecaoISO);

  const labelY = infoTop + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Unidade:", infoLeft + 2, labelY);
  doc.text("Setor:", colSetorX + 2, labelY);
  doc.text("Data:", colDataX + 2, labelY);

  const valueY = rowDividerY - 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(unidade, infoLeft + 2, valueY);
  doc.text(setor, colSetorX + 2, valueY);
  doc.text(dataInspecao, colDataX + 2, valueY);

  const row2Top = rowDividerY;
  const osLabel = "Ordem de Serviço:";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(osLabel, infoLeft + 2, row2Top + 5);

  const osLabelWidth = doc.getTextWidth(`${osLabel} `);
  const osLineStartX = infoLeft + 2 + osLabelWidth;
  const osLineEndX = infoLeft + leftBlockWidth - 2;
  const osLineY = infoBottom - 2;
  doc.setLineWidth(0.3);
  doc.line(osLineStartX, osLineY, osLineEndX, osLineY);

  const ordemServico = data.ordemServico?.trim() || "";
  if (ordemServico) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(ordemServico, osLineStartX + 1, osLineY - 1);
  }

  // Photo area
  const photoBox = { x: X_PHOTO, y: Y_PHOTO, w: W_PHOTO, h: H_PHOTO };
  doc.setLineWidth(0.3);
  doc.rect(photoBox.x, photoBox.y, photoBox.w, photoBox.h);

  const photoDataUrl = ensureDataUrl(data.fotoMaquinaDataUrl);
  if (photoDataUrl) {
    drawImageContain(doc, photoDataUrl, photoBox.x, photoBox.y, photoBox.w, photoBox.h);
  }

  // Machine label below photo
  const machineName = (data.maquinaNome || "").toUpperCase();
  const machineTag = data.tag?.trim();
  const machineLabelText = machineTag ? `${machineName}  TAG ${machineTag}` : machineName;
  const machineLabelY = Y_PHOTO + H_PHOTO + MACHINE_LABEL_GAP;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(machineLabelText, photoBox.x + photoBox.w / 2, machineLabelY + H_MACHINE_LABEL / 2, {
    align: "center",
    baseline: "middle",
  });

  // Information panel
  const panelX = M;
  const panelY = Y_PANEL;
  const panelWidth = W_LEFT;
  const panelPadding = 3;
  const lineHeight = 5;
  const fieldSpacing = 1.5;
  const availableWidth = panelWidth - panelPadding * 2;

  const panelTemplateTitle = data.templateTitle?.trim() || data.tituloTemplate;
  const panelTemplateVersion = data.templateVersion?.trim();
  const templateValue = panelTemplateTitle
    ? `${panelTemplateTitle}${panelTemplateVersion ? ` v${panelTemplateVersion}` : ""}`
    : "—";

  const operatorNome = data.operatorNome?.trim();
  const operatorMatricula = data.operatorMatricula?.trim();
  let mantenedorValue = "—";
  if (operatorNome && operatorMatricula) {
    mantenedorValue = `${operatorNome} (${operatorMatricula})`;
  } else if (operatorNome) {
    mantenedorValue = operatorNome;
  } else if (operatorMatricula) {
    mantenedorValue = `(${operatorMatricula})`;
  }

  const lacValue = data.lac?.trim() || "—";
  const localValue = data.local?.trim();

  const panelFields = [
    { label: "Template:", value: templateValue },
    { label: "Mantenedor:", value: mantenedorValue },
    { label: "LAC:", value: lacValue },
  ];

  if (localValue) {
    panelFields.push({ label: "Local:", value: localValue });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  const labelMeasurements = panelFields.map(field => {
    const labelWidth = doc.getTextWidth(`${field.label} `);
    return labelWidth;
  });

  const measuredFields = panelFields.map((field, index) => {
    const labelWidth = labelMeasurements[index];
    const valueWidth = Math.max(availableWidth - labelWidth, availableWidth * 0.45);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(field.value || "—", valueWidth);
    const linesCount = Math.max(1, lines.length);
    return { field, labelWidth, lines, linesCount };
  });

  const contentHeight =
    panelPadding * 2 +
    measuredFields.reduce((acc, current, idx) => {
      const heightForField = lineHeight * current.linesCount;
      const spacing = idx < measuredFields.length - 1 ? fieldSpacing : 0;
      return acc + heightForField + spacing;
    }, 0);

  const panelHeight = Math.max(DEFAULT_H_PANEL, contentHeight);

  doc.setLineWidth(0.4);
  doc.rect(panelX, panelY, panelWidth, panelHeight);
  doc.setDrawColor(0);

  let textY = panelY + panelPadding + 4;
  measuredFields.forEach(({ field, labelWidth, lines, linesCount }, index) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const labelX = panelX + panelPadding;
    doc.text(field.label, labelX, textY);

    const valueX = labelX + labelWidth;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const [firstLine, ...rest] = lines.length > 0 ? lines : ["—"];
    doc.text(firstLine, valueX, textY);
    let innerY = textY;
    rest.forEach((line: string) => {
      innerY += lineHeight;
      doc.text(line, valueX, innerY);
    });

    textY += lineHeight * linesCount;
    if (index < measuredFields.length - 1) {
      textY += fieldSpacing;
    }
  });

  const panelBottom = panelY + panelHeight;
  const machineLabelBottom = machineLabelY + H_MACHINE_LABEL;
  const bottom = Math.max(panelBottom, machineLabelBottom);
  const topHeightMm = bottom - M;

  return { topHeightMm, photoBox };
}
