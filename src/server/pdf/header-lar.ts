import { readFileSync } from "fs";
import { join } from "path";
import type { jsPDF } from "jspdf";

export type LarHeaderData = {
  tituloTemplate: string;
  unidade: string;
  setor: string;
  dataInspecaoISO: string;
  maquinaNome: string;
  tag: string;
  fotoMaquinaUrl?: string;
};

type ParsedImage = { data: string; format: "PNG" | "JPEG" | "WEBP" };

let cachedLarLogo: ParsedImage | null | undefined;

function loadLarLogo(): ParsedImage | null {
  if (cachedLarLogo !== undefined) {
    return cachedLarLogo;
  }

  try {
    const logoPath = join(process.cwd(), "public", "lar-logo.png");
    const buffer = readFileSync(logoPath);
    cachedLarLogo = {
      data: buffer.toString("base64"),
      format: "PNG",
    };
    return cachedLarLogo;
  } catch {
    cachedLarLogo = null;
    return null;
  }
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString("pt-BR");
}

function parseImageSource(src?: string | null): ParsedImage | null {
  if (!src) return null;
  if (!src.startsWith("data:")) {
    return null;
  }

  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(src);
  if (!match) {
    return null;
  }

  const [, subtype, base64] = match;
  const format = subtype.toLowerCase() === "png" ? "PNG" : subtype.toLowerCase() === "webp" ? "WEBP" : "JPEG";
  return { data: base64, format };
}

function drawInfoCell(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options: { bold?: boolean; size?: number }
) {
  const { bold = false, size = 9 } = options;
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.text(text, x, y);
}

export function drawLarHeader(
  doc: jsPDF,
  data: LarHeaderData,
  opts?: { pageWidthMm?: number }
): { headerHeightMm: number } {
  const pageWidth = opts?.pageWidthMm ?? doc.internal.pageSize.getWidth();
  const margin = 10;
  const top = margin;
  const contentWidth = pageWidth - margin * 2;
  const innerPadding = 2;
  const innerLeft = margin + innerPadding;
  const innerTop = top + innerPadding;

  const templateTitle = data.tituloTemplate?.trim() || "INSPEÇÃO";
  const titleUpper = templateTitle.toUpperCase();

  const infoTableWidth = 64;
  const infoTableHeight = 24;
  const infoTableX = margin + contentWidth - innerPadding - infoTableWidth;
  const infoTableY = innerTop;

  const logoBox = {
    x: innerLeft,
    y: innerTop,
    w: 22,
    h: 22,
  };

  const titleAreaX = logoBox.x + logoBox.w + 6;
  const titleAreaRight = infoTableX - 4;
  const titleAreaWidth = Math.max(titleAreaRight - titleAreaX, 40);

  doc.setDrawColor(0);
  doc.setLineWidth(0.4);

  const logoImage = loadLarLogo();
  if (logoImage) {
    doc.addImage(logoImage.data, logoImage.format, logoBox.x, logoBox.y, logoBox.w, logoBox.h);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Lar", logoBox.x + 2, logoBox.y + logoBox.h / 1.5);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(
    `INSPEÇÃO ${titleUpper}`,
    titleAreaX + titleAreaWidth / 2,
    innerTop + 10,
    { align: "center" }
  );

  doc.setFontSize(12);
  doc.text(titleUpper, titleAreaX + titleAreaWidth / 2, innerTop + 18, { align: "center" });

  doc.rect(infoTableX, infoTableY, infoTableWidth, infoTableHeight);
  const rowHeight = infoTableHeight / 3;
  const colSplit = infoTableX + infoTableWidth / 2;
  doc.line(infoTableX, infoTableY + rowHeight, infoTableX + infoTableWidth, infoTableY + rowHeight);
  doc.line(infoTableX, infoTableY + rowHeight * 2, infoTableX + infoTableWidth, infoTableY + rowHeight * 2);
  doc.line(colSplit, infoTableY, colSplit, infoTableY + infoTableHeight);

  drawInfoCell(doc, "NÚMERO:", infoTableX + 2, infoTableY + 5, { bold: true, size: 8.5 });
  drawInfoCell(doc, "PÁGINAS:", colSplit + 2, infoTableY + 5, { bold: true, size: 8.5 });

  drawInfoCell(doc, "FO 012 050 33", infoTableX + 2, infoTableY + rowHeight + 5, { bold: true, size: 10 });
  drawInfoCell(doc, "1/1", colSplit + 2, infoTableY + rowHeight + 5, { bold: true, size: 10 });

  drawInfoCell(doc, "EMISSÃO:  REVISÃO:  Nº", infoTableX + 2, infoTableY + rowHeight * 2 + 5, {
    bold: true,
    size: 8.5,
  });
  drawInfoCell(doc, "08/04/2024  05/07/2024  01", colSplit + 2, infoTableY + rowHeight * 2 + 5, {
    bold: true,
    size: 9.5,
  });

  const photoBoxWidth = 105;
  const photoBoxHeight = 35;
  const photoBoxX = margin + contentWidth - innerPadding - photoBoxWidth;
  const infoSectionWidth = Math.max(photoBoxX - innerLeft - 4, 60);

  const infoRowY = infoTableY + infoTableHeight + 8;
  const infoRowHeight = 10;
  const infoRowWidth = infoSectionWidth;
  doc.rect(innerLeft, infoRowY, infoRowWidth, infoRowHeight);
  const colWidth = infoRowWidth / 3;
  doc.line(innerLeft + colWidth, infoRowY, innerLeft + colWidth, infoRowY + infoRowHeight);
  doc.line(innerLeft + colWidth * 2, infoRowY, innerLeft + colWidth * 2, infoRowY + infoRowHeight);

  const unidade = data.unidade?.trim() || "-";
  const setor = data.setor?.trim() || "-";
  const dataInspecao = formatDate(data.dataInspecaoISO);

  drawInfoCell(doc, `Unidade: ${unidade}`, innerLeft + 2, infoRowY + 6, { bold: false, size: 9 });
  drawInfoCell(doc, `Setor: ${setor}`, innerLeft + colWidth + 2, infoRowY + 6, { bold: false, size: 9 });
  drawInfoCell(doc, `Data: ${dataInspecao}`, innerLeft + colWidth * 2 + 2, infoRowY + 6, {
    bold: false,
    size: 9,
  });

  const machineLineY = infoRowY + infoRowHeight + 8;
  const machineText = `${(data.maquinaNome || "-").toUpperCase()}   TAG ${data.tag || "-"}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(machineText, innerLeft, machineLineY);
  doc.line(innerLeft, machineLineY + 2, innerLeft + infoSectionWidth, machineLineY + 2);

  const photoBoxY = infoRowY;
  doc.rect(photoBoxX, photoBoxY, photoBoxWidth, photoBoxHeight);
  const parsedPhoto = parseImageSource(data.fotoMaquinaUrl);
  if (parsedPhoto) {
    const inset = 3;
    const targetW = photoBoxWidth - inset * 2;
    const targetH = photoBoxHeight - inset * 2;
    doc.addImage(
      parsedPhoto.data,
      parsedPhoto.format,
      photoBoxX + inset,
      photoBoxY + inset,
      targetW,
      targetH,
      undefined,
      "FAST"
    );
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("FOTO DA MÁQUINA", photoBoxX + photoBoxWidth / 2, photoBoxY + photoBoxHeight / 2, {
      align: "center",
      baseline: "middle",
    });
    doc.setTextColor(0);
  }

  const headerBottom = Math.max(photoBoxY + photoBoxHeight + innerPadding, machineLineY + 10);
  const headerHeight = headerBottom - top;
  doc.rect(margin, top, contentWidth, headerHeight);

  return { headerHeightMm: headerHeight };
}
