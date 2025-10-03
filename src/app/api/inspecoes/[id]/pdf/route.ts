import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, requireMaint } from "@/lib/guards";

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

async function fetchImageData(url: string | null | undefined) {
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
    return { base64, format };
  } catch {
    return null;
  }
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

    const doc = new jsPDF();
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let cursorY = 20;

    doc.setFontSize(18);
    doc.text("Relatório de Inspeção", margin, cursorY);
    cursorY += 10;

    doc.setFontSize(12);
    const finalizedAt = inspectionData.finalizadaEm ?? inspectionData.createdAt;
    const headerLines = [
      `Unidade: ${machine?.unidade ?? "-"}`,
      `Local: ${machine?.localUnidade ?? "-"}`,
      `Setor: ${machine?.setor ?? "-"}`,
      `Máquina: ${machine?.nome ?? "-"}`,
      `TAG: ${machine?.tag ?? "-"}`,
      `LAC: ${machine?.lac ?? "-"}`,
      `Template: ${template?.nome ?? "-"}`,
      `Data/Hora: ${finalizedAt ? new Date(finalizedAt).toLocaleString("pt-BR") : "-"}`,
      `Mantenedor: ${maintainer?.nome ?? "-"} (${maintainer?.matricula ?? "-"})`,
      `Nº da O.S.: ${inspectionData.osNumero ?? "-"}`,
    ];

    headerLines.forEach(line => {
      doc.text(line, margin, cursorY);
      cursorY += 6;
    });

    const photo = await fetchImageData(machine?.fotoUrl ?? null);
    if (photo) {
      const imgWidth = 60;
      const imgHeight = 45;
      const x = pageWidth - margin - imgWidth;
      const y = 20;
      doc.addImage(photo.base64, photo.format, x, y, imgWidth, imgHeight);
      cursorY = Math.max(cursorY, y + imgHeight + 8);
    }

    const signature = await fetchImageData(inspectionData.assinaturaUrl ?? null);
    if (signature) {
      if (cursorY > pageHeight - 60) {
        doc.addPage();
        cursorY = 20;
      }
      doc.setFontSize(12);
      doc.text("Assinatura do mantenedor:", margin, cursorY);
      cursorY += 6;
      const imgWidth = 60;
      const imgHeight = 30;
      doc.addImage(signature.base64, signature.format, margin, cursorY, imgWidth, imgHeight);
      cursorY += imgHeight + 10;
    }

    const pcmSign = (inspectionData.pcmSign ?? {}) as Record<string, unknown>;
    const pcmSignatureUrl = typeof pcmSign.assinaturaUrl === "string" ? pcmSign.assinaturaUrl : null;
    const pcmSignature = await fetchImageData(pcmSignatureUrl);
    const pcmName = typeof pcmSign.nome === "string" ? pcmSign.nome : null;
    if (pcmSignature) {
      if (cursorY > pageHeight - 60) {
        doc.addPage();
        cursorY = 20;
      }
      doc.setFontSize(12);
      doc.text(
        `Assinatura do assistente${pcmName ? ` (${pcmName})` : ""}:`,
        margin,
        cursorY
      );
      cursorY += 6;
      const imgWidth = 60;
      const imgHeight = 30;
      doc.addImage(pcmSignature.base64, pcmSignature.format, margin, cursorY, imgWidth, imgHeight);
      cursorY += imgHeight + 10;
    } else if (pcmName) {
      if (cursorY > pageHeight - 20) {
        doc.addPage();
        cursorY = 20;
      }
      doc.setFontSize(12);
      doc.text(`Assinatura do assistente: ${pcmName}`, margin, cursorY);
      cursorY += 8;
    }

    if (cursorY > pageHeight - 40) {
      doc.addPage();
      cursorY = 20;
    }

    doc.setFontSize(14);
    doc.text("Itens do checklist", margin, cursorY);
    cursorY += 8;

    doc.setFontSize(12);
    itens.forEach((item, index) => {
      if (cursorY > pageHeight - 40) {
        doc.addPage();
        cursorY = 20;
      }
      const templateItem = templateItemsMap.get(item.templateItemId) ?? {};
      const componente = templateItem?.componente ?? item.templateItemId;
      doc.text(`${index + 1}. ${componente}`, margin, cursorY);
      cursorY += 6;
      doc.text(`Resultado: ${item.resultado ?? "-"}`, margin, cursorY);
      cursorY += 6;
      const observacao = item.observacaoItem ? String(item.observacaoItem) : "-";
      const wrapped = doc.splitTextToSize(`Observação: ${observacao}`, pageWidth - margin * 2);
      wrapped.forEach((line: string) => {
        doc.text(line, margin, cursorY);
        cursorY += 6;
      });
      cursorY += 2;
    });

    if (cursorY > pageHeight - 40) {
      doc.addPage();
      cursorY = 20;
    }

    doc.setFontSize(14);
    doc.text("Observações gerais", margin, cursorY);
    cursorY += 8;

    doc.setFontSize(12);
    const observacoes = inspectionData.observacoes ?? "-";
    const obsWrapped = doc.splitTextToSize(String(observacoes) || "-", pageWidth - margin * 2);
    obsWrapped.forEach((line: string) => {
      if (cursorY > pageHeight - 20) {
        doc.addPage();
        cursorY = 20;
      }
      doc.text(line, margin, cursorY);
      cursorY += 6;
    });

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
