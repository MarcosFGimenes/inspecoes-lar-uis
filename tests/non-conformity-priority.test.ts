import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIssueRecurrenceUpdates,
  resolveIssueLastActivityAt,
  sortByLastActivityDesc,
} from "../src/lib/non-conformity-priority.ts";

test("nova inspeção com NC já aberta não cria duplicata e incrementa reincidência", () => {
  const updates = buildIssueRecurrenceUpdates({
    issueData: {
      status: "aberta",
      reincidenciaCount: 2,
      osNumero: "OS-100",
    },
    inspectionId: "insp-003",
    nowIso: "2026-03-24T12:00:00.000Z",
    osNumeroItem: "OS-200",
    fotos: [{ url: "https://example.com/foto.jpg" }],
    descricao: "NC reincidente",
  });

  assert.equal(updates.reincidenciaCount, 3);
  assert.equal(updates.ultimaReincidenciaInspecaoId, "insp-003");
  assert.equal(updates.ultimaReincidenciaEm, "2026-03-24T12:00:00.000Z");
  assert.equal(updates.ultimaOcorrenciaEm, "2026-03-24T12:00:00.000Z");
  assert.equal(updates.updatedAt, "2026-03-24T12:00:00.000Z");
  assert.equal(updates.osNumero, "OS-200");
  assert.equal(updates.descricao, "NC reincidente");
});

test("reincidência prioriza data de última ocorrência na tratativa existente", () => {
  const activity = resolveIssueLastActivityAt({
    issueData: {
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-02T10:00:00.000Z",
      ultimaReincidenciaEm: "2026-03-10T10:00:00.000Z",
      ultimaOcorrenciaEm: "2026-03-20T10:00:00.000Z",
    },
    rawIssueTreatment: {
      updatedAt: "2026-03-15T10:00:00.000Z",
    },
  });

  assert.equal(activity, "2026-03-20T10:00:00.000Z");
});

test("tratativa reincidente sobe para o topo da lista", () => {
  const sorted = sortByLastActivityDesc([
    { id: "old", updatedAt: "2026-03-10T10:00:00.000Z", checklistDate: null },
    { id: "new", updatedAt: "2026-03-24T10:00:00.000Z", checklistDate: null },
    { id: "fallback", updatedAt: null, checklistDate: "2026-03-18T10:00:00.000Z" },
  ]);

  assert.deepEqual(
    sorted.map(item => item.id),
    ["new", "fallback", "old"]
  );
});
