import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, requireMaint } from "@/lib/guards";
import { drawLarHeader } from "@/server/pdf/header-lar";
import type { LarHeaderData } from "@/server/pdf/header-lar";

type TemplateItemData = {
  id?: string;
  componente?: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

type ImageFormat = "PNG" | "JPEG" | "WEBP";
type FetchedImage = { dataUrl: string };

function resolveImageFormat(dataUrl: string): ImageFormat {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

function drawImageContain(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) {
  const props = doc.getImageProperties(dataUrl);
  const ratio = props.width / props.height;
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

async function fetchImageData(url: string | null | undefined): Promise<FetchedImage | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mime = response.headers.get("content-type") || "image/jpeg";
    let format: "PNG" | "JPEG" | "WEBP" = "JPEG";
    if (mime.includes("png")) format = "PNG";
    else if (mime.includes("webp")) format = "WEBP";
    const base64 = buffer.toString("base64");
    const resolvedMime = format === "PNG" ? "image/png" : format === "WEBP" ? "image/webp" : "image/jpeg";
    const dataUrl = `data:${resolvedMime};base64,${base64}`;
    return { dataUrl };
  } catch {
    return null;
  }
}

async function fetchImageAsDataUrl(url: string | null | undefined) {
  const image = await fetchImageData(url);
  return image?.dataUrl ?? null;
}

async function resolveSession() {
  const admin = await requireAdmin();
  if (admin.ok) {
    return { role: "admin" as const };
  }
  const maint = await requireMaint();
  if (maint.ok) {
    return { role: "maint" as const, store: maint.store };
  }
  return null;
}

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

function resolveId(params: Record<string, string | string[] | undefined>) {
  const idValue = params.id;
  return Array.isArray(idValue) ? idValue[0] ?? null : idValue ?? null;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const params = (await context.params) ?? {};
  const id = resolveId(params);
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const inspectionDoc = await adminDb.collection("inspecoes").doc(id).get();
    if (!inspectionDoc.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const inspectionData = inspectionDoc.data() ?? {};
    const maintainer = inspectionData.maintainer ?? {};
    const machine = inspectionData.machine ?? {};
    const template = inspectionData.template ?? {};
    const itens: Array<{ templateItemId: string; resultado: string; observacaoItem?: string | null }> = Array.isArray(
      inspectionData.itens
    )
      ? inspectionData.itens
      : [];

    if (session.role === "maint") {
      const ownInspection = maintainer?.maintId === session.store.id;
      if (!ownInspection) {
        const maintDoc = await adminDb.collection("mantenedores").doc(session.store.id!).get();
        if (!maintDoc.exists) {
          return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
        }
        const machines = Array.isArray(maintDoc.data()?.machines) ? (maintDoc.data()?.machines as string[]) : [];
        if (!machine?.machineId || !machines.includes(machine.machineId)) {
          return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
        }
      }
    }

    const templateId = template?.id ? String(template.id) : machine?.templateId ? String(machine.templateId) : null;
    let templateItemsMap = new Map<string, TemplateItemData>();
    if (templateId) {
      const templateDoc = await adminDb.collection("templates").doc(templateId).get();
      if (templateDoc.exists) {
        const templateData = templateDoc.data() ?? {};
        const itensArr = Array.isArray(templateData.itens)
          ? (templateData.itens as TemplateItemData[])
          : [];
        templateItemsMap = new Map(
          itensArr
            .filter(item => item?.id)
            .map(item => [String(item.id), item])
        );
      }
    }

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const margin = 10;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const finalizedAt = inspectionData.finalizadaEm ?? inspectionData.createdAt;
    const inspectionDate = finalizedAt ? new Date(finalizedAt) : null;
    const templateName =
      (typeof template?.nome === "string" && template.nome) ||
      (typeof template?.title === "string" && template.title) ||
      "Inspeção";
    const templateRecord = template as Record<string, unknown>;
    const templateTitleValue =
      (typeof templateRecord?.["title"] === "string" && (templateRecord["title"] as string)) ||
      (typeof templateRecord?.["nome"] === "string" && (templateRecord["nome"] as string)) ||
      templateName;
    const templateVersionCandidate =
      templateRecord?.["version"] ??
      templateRecord?.["versao"] ??
      templateRecord?.["versaoAtual"] ??
      templateRecord?.["versionName"] ??
      null;
    const templateVersion =
      typeof templateVersionCandidate === "string" || typeof templateVersionCandidate === "number"
        ? String(templateVersionCandidate)
        : undefined;

    const operatorNome = typeof maintainer?.nome === "string" ? maintainer.nome : undefined;
    const operatorMatricula =
      typeof maintainer?.matricula === "string" ? maintainer.matricula : undefined;
    const lac = typeof machine?.lac === "string" ? machine.lac : undefined;
    const machineLocalRaw =
      typeof machine?.local === "string"
        ? machine.local
        : typeof machine?.localUnidade === "string"
        ? machine.localUnidade
        : undefined;

    const headerData: LarHeaderData = {
      tituloTemplate: templateName,
      unidade: typeof machine?.unidade === "string" ? machine.unidade : "-",
      setor:
        typeof machine?.setor === "string"
          ? machine.setor
          : typeof machine?.localUnidade === "string"
          ? machine.localUnidade
          : "-",
      dataInspecaoISO: inspectionDate ? inspectionDate.toISOString() : undefined,
      maquinaNome: typeof machine?.nome === "string" ? machine.nome : templateName,
      tag: typeof machine?.tag === "string" ? machine.tag : "-",
      fotoMaquinaDataUrl: (await fetchImageAsDataUrl(machine?.fotoUrl ?? null)) ?? undefined,
      ordemServico: typeof inspectionData.osNumero === "string" ? inspectionData.osNumero : undefined,
      templateTitle: templateTitleValue,
      templateVersion,
      operatorNome,
      operatorMatricula,
      dataHoraISO: inspectionDate ? inspectionDate.toISOString() : undefined,
      lac,
      local: machineLocalRaw,
    };

    const { topHeightMm } = drawLarHeader(doc, headerData);

    let cursorY = margin + topHeightMm + 6;

    const maintSignature = await fetchImageData(inspectionData.assinaturaUrl ?? null);
    const pcmSign = (inspectionData.pcmSign ?? {}) as Record<string, unknown>;
    const pcmSignatureUrl = typeof pcmSign.assinaturaUrl === "string" ? pcmSign.assinaturaUrl : null;
    const pcmSignature = await fetchImageData(pcmSignatureUrl);
    const pcmName = typeof pcmSign.nome === "string" ? pcmSign.nome : null;

    if (cursorY > pageHeight - 40) {
      doc.addPage();
      cursorY = margin;
    }

    doc.setFontSize(14);
    doc.text("Itens do checklist", margin, cursorY);
    cursorY += 8;

    const boxPadding = 4;
    const lineHeight = 5;

    itens.forEach((item, index) => {
      const templateItem = templateItemsMap.get(item.templateItemId) ?? {};
      const componente = templateItem?.componente ?? item.templateItemId;
      const questionText = `${index + 1}. ${componente}`;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      let questionLines = doc.splitTextToSize(questionText, contentWidth - boxPadding * 2);
      if (questionLines.length === 0) {
        questionLines = [questionText];
      }

      const resultLabel = "Resultado:";
      const resultValue = item.resultado ? String(item.resultado) : "-";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const resultLabelWidth = doc.getTextWidth(`${resultLabel} `);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const resultWidth = Math.max(contentWidth - boxPadding * 2 - resultLabelWidth, contentWidth * 0.3);
      let resultLines = doc.splitTextToSize(resultValue, resultWidth);
      if (resultLines.length === 0) {
        resultLines = ["-"];
      }

      const obsLabel = "Observação:";
      const obsValue = item.observacaoItem ? String(item.observacaoItem) : "-";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const obsLabelWidth = doc.getTextWidth(`${obsLabel} `);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const obsWidth = Math.max(contentWidth - boxPadding * 2 - obsLabelWidth, contentWidth * 0.3);
      let obsLines = doc.splitTextToSize(obsValue, obsWidth);
      if (obsLines.length === 0) {
        obsLines = ["-"];
      }

      const questionHeight = boxPadding * 2 + questionLines.length * lineHeight;
      const resultHeight = boxPadding * 2 + resultLines.length * lineHeight;
      const obsHeight = boxPadding * 2 + obsLines.length * lineHeight;
      const boxHeight = questionHeight + resultHeight + obsHeight;

      if (cursorY + boxHeight > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }

      doc.setLineWidth(0.4);
      doc.rect(margin, cursorY, contentWidth, boxHeight);

      doc.setLineWidth(0.3);
      const questionBottom = cursorY + questionHeight;
      const resultBottom = questionBottom + resultHeight;
      doc.line(margin, questionBottom, margin + contentWidth, questionBottom);
      doc.line(margin, resultBottom, margin + contentWidth, resultBottom);

      let textY = cursorY + boxPadding + lineHeight;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      questionLines.forEach((line: string) => {
        doc.text(line, margin + boxPadding, textY);
        textY += lineHeight;
      });

      let sectionStart = questionBottom;
      textY = sectionStart + boxPadding + lineHeight;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(resultLabel, margin + boxPadding, textY);
      const resultValueX = margin + boxPadding + resultLabelWidth;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(resultLines[0], resultValueX, textY);
      for (let i = 1; i < resultLines.length; i += 1) {
        textY += lineHeight;
        doc.text(resultLines[i], margin + boxPadding, textY);
      }

      sectionStart = resultBottom;
      textY = sectionStart + boxPadding + lineHeight;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(obsLabel, margin + boxPadding, textY);
      const obsValueX = margin + boxPadding + obsLabelWidth;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(obsLines[0], obsValueX, textY);
      for (let i = 1; i < obsLines.length; i += 1) {
        textY += lineHeight;
        doc.text(obsLines[i], margin + boxPadding, textY);
      }

      cursorY += boxHeight + 6;
    });

    if (cursorY > pageHeight - 40) {
      doc.addPage();
      cursorY = margin;
    }

    doc.setFontSize(14);
    doc.text("Observações gerais", margin, cursorY);
    cursorY += 8;

    doc.setFontSize(12);
    const observacoes = inspectionData.observacoes ?? "-";
    const obsWrapped = doc.splitTextToSize(String(observacoes) || "-", contentWidth);
    obsWrapped.forEach((line: string) => {
      if (cursorY > pageHeight - 20) {
        doc.addPage();
        cursorY = margin;
      }
      doc.text(line, margin, cursorY);
      cursorY += 6;
    });

    const signatureBoxHeight = 45;
    const signatureGap = 10;
    const signatureBoxWidth = (contentWidth - signatureGap) / 2;
    let signaturePageHeight = doc.internal.pageSize.getHeight();
    let signatureStartY = signaturePageHeight - margin - signatureBoxHeight;

    if (cursorY + 10 > signatureStartY) {
      doc.addPage();
      cursorY = margin;
      signaturePageHeight = doc.internal.pageSize.getHeight();
      signatureStartY = signaturePageHeight - margin - signatureBoxHeight;
    }

    const leftSignatureX = margin;
    const rightSignatureX = margin + signatureBoxWidth + signatureGap;

    doc.setLineWidth(0.4);
    doc.rect(leftSignatureX, signatureStartY, signatureBoxWidth, signatureBoxHeight);
    doc.rect(rightSignatureX, signatureStartY, signatureBoxWidth, signatureBoxHeight);

    const labelOffsetY = 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Assinatura do mantenedor", leftSignatureX + 4, signatureStartY + labelOffsetY);
    doc.text("Assinatura do assistente", rightSignatureX + 4, signatureStartY + labelOffsetY);

    const imageAreaY = signatureStartY + labelOffsetY + 2;
    const imageAreaHeight = signatureBoxHeight - labelOffsetY - 14;
    const imageAreaWidth = signatureBoxWidth - 8;

    if (maintSignature?.dataUrl) {
      drawImageContain(doc, maintSignature.dataUrl, leftSignatureX + 4, imageAreaY, imageAreaWidth, imageAreaHeight);
    }

    if (pcmSignature?.dataUrl) {
      drawImageContain(doc, pcmSignature.dataUrl, rightSignatureX + 4, imageAreaY, imageAreaWidth, imageAreaHeight);
    }

    const nameLineY = signatureStartY + signatureBoxHeight - 10;
    doc.setLineWidth(0.3);
    doc.line(leftSignatureX + 4, nameLineY, leftSignatureX + signatureBoxWidth - 4, nameLineY);
    doc.line(rightSignatureX + 4, nameLineY, rightSignatureX + signatureBoxWidth - 4, nameLineY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const maintNameText = `${maintainer?.nome ?? "-"}${maintainer?.matricula ? ` (${maintainer.matricula})` : ""}`;
    doc.text(maintNameText, leftSignatureX + 4, nameLineY + 6);
    const pcmNameText = pcmName ?? "-";
    doc.text(pcmNameText, rightSignatureX + 4, nameLineY + 6);

    const arrayBuffer = doc.output("arraybuffer");
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `inspecao-${machine?.tag ?? id}.pdf`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: extractMessage(err, "INTERNAL_ERROR") },
      { status: 500 }
    );
  }
}
