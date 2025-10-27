import { NextRequest, NextResponse } from "next/server";

import {
  listOpenNCsView,
  type Severity,
} from "@/lib/adapters/correctiveAdapter";
import { requireMaintOrAdmin } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampLimit(value: number | null | undefined, fallback = 20) {
  if (!value || Number.isNaN(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), 50);
}

function parseSeverity(value: string | null): Severity | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  if (numeric === 1 || numeric === 2 || numeric === 3 || numeric === 4 || numeric === 5 || numeric === 6) {
    return numeric;
  }
  return undefined;
}

function parseSource(value: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "inspection") {
    return normalized;
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  const auth = await requireMaintOrAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const area = searchParams.get("area")?.trim() || undefined;
    const severityRaw = searchParams.get("severity");
    const severity = parseSeverity(severityRaw);
    const sourceRaw = searchParams.get("source");
    const source = parseSource(sourceRaw);

    if (severityRaw && severity === undefined) {
      return NextResponse.json({ error: "INVALID_SEVERITY" }, { status: 400 });
    }

    if (sourceRaw && source === undefined) {
      return NextResponse.json({ error: "INVALID_SOURCE" }, { status: 400 });
    }

    const limitValue = clampLimit(Number(searchParams.get("limit")), 20);
    const cursor = searchParams.get("cursor") || undefined;

    const result = await listOpenNCsView({
      area,
      severity,
      source,
      limit: limitValue,
      cursor,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
