import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";

import { parseSeverityState, getEffectiveSeverity } from "../src/lib/adapters/severity-utils";

test("parseSeverityState normalizes maintainer-only severity", () => {
  const timestamp = Timestamp.fromDate(new Date("2024-01-02T10:30:00Z"));
  const result = parseSeverityState({
    maintainer: 3,
    maintainerAt: timestamp,
  });

  assert.equal(result.maintainer, 3);
  assert.equal(result.effective, 3);
  const maintainerAtIso =
    typeof result.maintainerAt === "string"
      ? result.maintainerAt
      : result.maintainerAt?.toISOString();
  assert.ok(maintainerAtIso?.startsWith("2024-01-02T10:30:00.000Z"));
  assert.equal(result.signer, null);
});

test("parseSeverityState prioritizes signer severity when available", () => {
  const result = parseSeverityState({
    maintainer: 2,
    maintainerAt: "2024-01-01T08:00:00Z",
    signer: 6,
    signerAt: "2024-01-05T12:00:00Z",
  });

  assert.equal(result.maintainer, 2);
  assert.equal(result.signer, 6);
  assert.equal(result.effective, 6);
  const signerAtIso =
    typeof result.signerAt === "string" ? result.signerAt : result.signerAt?.toISOString();
  assert.ok(signerAtIso?.startsWith("2024-01-05T12:00:00.000Z"));
});

test("getEffectiveSeverity falls back to maintainer when signer missing", () => {
  const severityState = parseSeverityState({
    maintainer: 4,
    signer: null,
  });

  assert.equal(getEffectiveSeverity(severityState), 4);
  assert.equal(getEffectiveSeverity({ severity: { maintainer: 1 } }), 1);
  assert.equal(getEffectiveSeverity(null), undefined);
});
