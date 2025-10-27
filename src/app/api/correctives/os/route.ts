import { NextRequest, NextResponse } from "next/server";

import { listCorrectiveWOView } from "@/lib/adapters/correctiveAdapter";
import { requireMaintOrAdmin } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampLimit(value: number | null | undefined, fallback = 20) {
  if (!value || Number.isNaN(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), 50);
}

function normalizeIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export async function GET(req: NextRequest) {
  const auth = await requireMaintOrAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const params = url.searchParams;
    const area = params.get("area")?.trim() || undefined;
    const status = params.get("status")?.trim() || undefined;
    const fromRaw = params.get("from");
    const toRaw = params.get("to");
    const from = normalizeIso(fromRaw);
    const to = normalizeIso(toRaw);

    if (fromRaw && !from) {
      return NextResponse.json({ error: "INVALID_FROM" }, { status: 400 });
    }
    if (toRaw && !to) {
      return NextResponse.json({ error: "INVALID_TO" }, { status: 400 });
    }

    const limitValue = clampLimit(Number(params.get("limit")), 20);
    const cursor = params.get("cursor") || undefined;

    const result = await listCorrectiveWOView({
      from: from ?? undefined,
      to: to ?? undefined,
      area,
      status,
      limit: limitValue,
      cursor,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
