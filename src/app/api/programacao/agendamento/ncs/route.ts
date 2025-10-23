import { NextRequest, NextResponse } from "next/server";

import { getNCsForScheduling } from "@/lib/programacao/scheduling";
import { requireAdminFromRequest } from "@/lib/guards";
import type { AreaFilter } from "@/lib/programacao/scheduling";
import type { Severity } from "@/types/severity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseArea(value: string | null): AreaFilter | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.startsWith("mec")) return "mecanica";
  if (normalized.startsWith("ele")) return "eletrica";
  return normalized.startsWith("tod") ? "todas" : undefined;
}

function parseSeverity(value: string | null): Severity | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return undefined;
  if (parsed < 1 || parsed > 5) return undefined;
  return parsed as Severity;
}

export async function GET(req: NextRequest) {
  const authorized = await requireAdminFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const area = parseArea(searchParams.get("area"));
  const minSeverity = parseSeverity(searchParams.get("minSeverity"));
  const maxSeverity = parseSeverity(searchParams.get("maxSeverity"));
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const search = searchParams.get("search") ?? undefined;

  try {
    const records = await getNCsForScheduling({
      area,
      minSeverity,
      maxSeverity,
      from,
      to,
      search,
    });
    return NextResponse.json({ items: records });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
