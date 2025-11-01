import { FieldPath } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { listCorrectiveWOView } from "@/lib/adapters/correctiveAdapter";
import { adminDb } from "@/lib/firebase-admin";
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

function chunkArray<T>(values: T[], chunkSize = 10): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

async function fetchIssuesNumbersMap(issueIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniqueIds = Array.from(new Set(issueIds)).filter(Boolean);

  if (!uniqueIds.length) {
    return map;
  }

  const chunks = chunkArray(uniqueIds);

  for (const chunk of chunks) {
    const snapshot = await adminDb
      .collection("issues")
      .where(FieldPath.documentId(), "in", chunk)
      .get();

    snapshot.forEach(doc => {
      const data = doc.data() as { osNumero?: unknown } | undefined;
      if (typeof data?.osNumero === "string" && data.osNumero.trim().length > 0) {
        map.set(doc.id, data.osNumero.trim());
        return;
      }
      if (typeof data?.osNumero === "number") {
        map.set(doc.id, String(data.osNumero));
      }
    });
  }

  return map;
}

type MaintainerInfo = { nome: string | null; matricula: string | null };

async function fetchMaintainersMap(ids: string[]): Promise<Map<string, MaintainerInfo>> {
  const map = new Map<string, MaintainerInfo>();
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);

  if (!uniqueIds.length) {
    return map;
  }

  const chunks = chunkArray(uniqueIds);

  for (const chunk of chunks) {
    const snapshot = await adminDb
      .collection("mantenedores")
      .where(FieldPath.documentId(), "in", chunk)
      .get();

    snapshot.forEach(doc => {
      const data = doc.data() as { nome?: unknown; matricula?: unknown } | undefined;
      const nome = typeof data?.nome === "string" ? data.nome : null;
      const matricula = typeof data?.matricula === "string" ? data.matricula : null;
      map.set(doc.id, { nome, matricula });
    });
  }

  return map;
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
    const responsibleParam = params.get("responsible")?.trim() || undefined;
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

    const resolvedResponsible = auth.role === "maint" ? auth.store.id ?? undefined : responsibleParam;

    const result = await listCorrectiveWOView({
      from: from ?? undefined,
      to: to ?? undefined,
      area,
      status,
      limit: limitValue,
      cursor,
      responsible: resolvedResponsible,
    });
    const issueIds: string[] = [];
    const maintainerIds: string[] = [];

    result.items.forEach(item => {
      if (!item.osNumero && item.ncId) {
        issueIds.push(item.ncId);
      }

      if (item.assignees?.owner) {
        maintainerIds.push(item.assignees.owner);
      }
      if (item.assignees?.maintainer1) {
        maintainerIds.push(item.assignees.maintainer1);
      }
      if (item.assignees?.maintainer2) {
        maintainerIds.push(item.assignees.maintainer2);
      }
      if (Array.isArray(item.mantenedoresIds)) {
        maintainerIds.push(...item.mantenedoresIds);
      }
    });

    const [issuesMap, maintainersMap] = await Promise.all([
      fetchIssuesNumbersMap(issueIds),
      fetchMaintainersMap(maintainerIds),
    ]);

    const enrichedItems = result.items.map(item => {
      const ids = Array.from(
        new Set(
          [
            item.assignees?.owner ?? null,
            item.assignees?.maintainer1 ?? null,
            item.assignees?.maintainer2 ?? null,
            ...(item.mantenedoresIds ?? []),
          ].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
        ),
      );

      const assigneesDetails = ids.map(id => {
        const info = maintainersMap.get(id);
        return {
          id,
          nome: info?.nome ?? null,
          matricula: info?.matricula ?? null,
        };
      });

      const osNumero = item.osNumero ?? (item.ncId ? issuesMap.get(item.ncId) ?? null : null);

      return {
        ...item,
        osNumero,
        assigneesDetails: assigneesDetails.length ? assigneesDetails : null,
      };
    });

    return NextResponse.json({ items: enrichedItems, nextCursor: result.nextCursor });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
