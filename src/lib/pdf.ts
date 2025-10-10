interface DownloadPdfOptions {
  filename?: string;
}

interface BatchEntry {
  id: string;
  filename?: string;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

async function fetchInspectionPdfBlob(id: string) {
  const response = await fetch(`/api/inspecoes/${encodeURIComponent(id)}/pdf`);
  if (!response.ok) {
    throw new Error(`Falha ao gerar PDF (${response.status})`);
  }
  return response.blob();
}

export async function downloadInspectionPdf(id: string, options: DownloadPdfOptions = {}) {
  if (typeof window === "undefined") {
    throw new Error("A exportação de PDF só pode ocorrer no navegador.");
  }
  if (!id) {
    throw new Error("Identificador do checklist inválido.");
  }

  const blob = await fetchInspectionPdfBlob(id);
  const filename = options.filename?.trim() || `checklist-${id}.pdf`;
  triggerDownload(blob, filename);
}

export async function downloadInspectionsBatch(entries: BatchEntry[]) {
  if (typeof window === "undefined") {
    throw new Error("A exportação em lote só pode ocorrer no navegador.");
  }
  if (!entries?.length) {
    throw new Error("Nenhum checklist selecionado para exportação.");
  }

  for (const entry of entries) {
    const blob = await fetchInspectionPdfBlob(entry.id);
    const filename = entry.filename?.trim() || `checklist-${entry.id}.pdf`;
    triggerDownload(blob, filename);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
