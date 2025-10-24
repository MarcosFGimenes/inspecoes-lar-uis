import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getScheduleView } from "@/lib/programacao/scheduling";
import { requireAdminFromRequest } from "@/lib/guards";
import type { AreaFilter } from "@/lib/programacao/scheduling";
import type { Severity } from "@/types/severity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  area: z.string().trim().optional(),
  minSeverity: z.number().int().min(1).max(6).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  responsavelId: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

function parseArea(value: string | undefined): AreaFilter | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.startsWith("mec")) return "mecanica";
  if (normalized.startsWith("ele")) return "eletrica";
  return normalized.startsWith("tod") ? "todas" : undefined;
}

function parseSeverity(value: number | undefined): Severity | undefined {
  if (typeof value !== "number") return undefined;
  if (value < 1 || value > 6) return undefined;
  return value as Severity;
}

export async function POST(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INVALID_PAYLOAD";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    const filters = {
      area: parseArea(payload.area),
      minSeverity: parseSeverity(payload.minSeverity),
      from: payload.from?.trim() || undefined,
      to: payload.to?.trim() || undefined,
      responsavelId: payload.responsavelId?.trim() || undefined,
      search: payload.search?.trim() || undefined,
    };
    const items = await getScheduleView(filters);

    const escape = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const rowsHtml = items
      .map(item => {
        const mantenedores = item.responsaveis
          .map(resp => resp.nome ?? resp.maintId ?? "")
          .filter(Boolean)
          .join(", ");
        const issueDescricao = escape(item.issue?.descricao ?? "");
        const issueFotos = item.issue?.fotos?.length
          ? item.issue.fotos.map(url => `<a href="${escape(url)}">${escape(url)}</a>`).join("<br />")
          : "";
        const execStatus = item.execucao?.status === "concluida"
          ? `Concluída em ${
              item.execucao.concluidaEm
                ? escape(new Date(item.execucao.concluidaEm).toLocaleString("pt-BR"))
                : ""
            }`
          : "Pendente";
        const execDescricao = escape(item.execucao?.descricao ?? "");
        const execFotos = item.execucao?.fotos?.length
          ? item.execucao.fotos.map(url => `<a href="${escape(url)}">${escape(url)}</a>`).join("<br />")
          : "";
        return `
          <tr>
            <td>${item.datas.programada ? escape(new Date(item.datas.programada).toLocaleString("pt-BR")) : ""}</td>
            <td>${item.datas.prazo ? escape(new Date(item.datas.prazo).toLocaleDateString("pt-BR")) : ""}</td>
            <td>${escape(item.osNumero ?? "")}</td>
            <td>${escape(item.machine.nome ?? item.machine.tag ?? "")}</td>
            <td>${escape(item.machine.area ?? "")}</td>
            <td>${escape(item.manutencao.criticidade ?? "")}</td>
            <td>${item.effectiveSeverity ?? ""}</td>
            <td>${escape(item.responsavel.nome ?? "")}</td>
            <td>${escape(mantenedores)}</td>
            <td>${issueDescricao}</td>
            <td>${escape(execStatus)}</td>
            <td>${execDescricao}</td>
            <td>${issueFotos}</td>
            <td>${execFotos}</td>
          </tr>
        `;
      })
      .join("");

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /></head><body><table border="1">
      <thead>
        <tr>
          <th>Data Programada</th>
          <th>Prazo</th>
          <th>OS</th>
          <th>Máquina</th>
          <th>Área</th>
          <th>Criticidade</th>
          <th>Criticidade Efetiva</th>
          <th>Responsável</th>
          <th>Mantenedores</th>
          <th>NC</th>
          <th>Status Execução</th>
          <th>Descrição da Conclusão</th>
          <th>Fotos NC</th>
          <th>Fotos Conclusão</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table></body></html>`;

    const filename = `programacao-${Date.now()}.xls`;

    return new NextResponse(Buffer.from(html, "utf8"), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel",
        "Content-Disposition": `attachment; filename=${filename}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
