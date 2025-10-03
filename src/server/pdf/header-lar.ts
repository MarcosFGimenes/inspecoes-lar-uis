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
};

const M = 10;
const W = 210 - 2 * M;
const H_TOP = 28;
const W_LOGO = 38;
const W_TITLE = 80;
const W_BOX = 72;
const H_INFO = 18;
const H_INFO_ROW1 = 9;
const H_TAG_LINE = 7;
const Y_PHOTO = M + H_TOP + H_INFO + H_TAG_LINE + 3;
const H_PHOTO = 34;
const X_PHOTO = M + W_LOGO + W_TITLE + 2;
const W_PHOTO = W_BOX - 4;

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

type ImageFormat = "PNG" | "JPEG" | "WEBP";

function resolveImageFormat(dataUrl: string): ImageFormat {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
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
  const format = resolveImageFormat(dataUrl);
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
  const infoBottom = infoTop + H_INFO;
  const infoLeft = M;
  const infoRight = M + W;
  const rowDividerY = infoTop + H_INFO_ROW1;
  const leftBlockWidth = W - W_BOX;
  const leftBlockRight = infoLeft + leftBlockWidth;

  doc.setLineWidth(0.4);
  doc.rect(infoLeft, infoTop, W, H_INFO);
  doc.line(infoLeft, rowDividerY, infoRight, rowDividerY);
  doc.line(leftBlockRight, infoTop, leftBlockRight, infoBottom);

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
  const osLineEndX = leftBlockRight - 2;
  const osLineY = infoBottom - 2;
  doc.setLineWidth(0.3);
  doc.line(osLineStartX, osLineY, osLineEndX, osLineY);

  const ordemServico = data.ordemServico?.trim() || "";
  if (ordemServico) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(ordemServico, osLineStartX + 1, osLineY - 1);
  }

  // Tag line
  const tagTextX = leftBlockRight + 2;
  const tagTextY = infoBottom + 5;
  const machineName = (data.maquinaNome || "").toUpperCase();
  const tagValue = data.tag?.trim() || "";
  const tagLineText = `${machineName}  TAG ${tagValue}`.trim();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(tagLineText, tagTextX, tagTextY);

  const textWidth = doc.getTextWidth(`${tagLineText} `);
  const lineStartX = Math.min(tagTextX + textWidth + 1, M + W - 35);
  const lineEndX = Math.min(lineStartX + 32, M + W - 2);
  doc.setLineWidth(0.3);
  doc.line(lineStartX, tagTextY - 1, lineEndX, tagTextY - 1);

  // Photo area
  const photoBox = { x: X_PHOTO, y: Y_PHOTO, w: W_PHOTO, h: H_PHOTO };
  doc.setLineWidth(0.3);
  doc.rect(photoBox.x, photoBox.y, photoBox.w, photoBox.h);

  const photoDataUrl = ensureDataUrl(data.fotoMaquinaDataUrl);
  if (photoDataUrl) {
    drawImageContain(doc, photoDataUrl, photoBox.x, photoBox.y, photoBox.w, photoBox.h);
  }

  const topHeightMm = H_TOP + H_INFO + H_TAG_LINE;
  return { topHeightMm, photoBox };
}
