import test from "node:test";
import assert from "node:assert/strict";

import { mergeStoredImageCollections, normalizeInspectionAnswers } from "../src/lib/storage/inspection-answers.ts";

test("mergeStoredImageCollections remove duplicadas e preserva ordem", () => {
  const merged = mergeStoredImageCollections(
    [
      { url: "https://r2.dev/a.jpg", provider: "r2" },
      { url: "https://r2.dev/b.jpg", provider: "r2" },
    ],
    [
      { url: "https://r2.dev/b.jpg", provider: "r2" },
      { url: "https://imgbb.dev/c.jpg", provider: "imgbb" },
    ]
  );

  assert.deepEqual(
    merged.map(image => image.url),
    ["https://r2.dev/a.jpg", "https://r2.dev/b.jpg", "https://imgbb.dev/c.jpg"]
  );
});

test("normalizeInspectionAnswers combina answers + itens sem perder fotos", () => {
  const normalized = normalizeInspectionAnswers(
    {
      answers: [
        {
          questionId: "q1",
          response: "nc",
          photoUrls: [{ url: "https://r2.dev/1.jpg", provider: "r2" }],
        },
      ],
      itens: [
        {
          templateItemId: "q1",
          resultado: "NC",
          fotos: [
            { url: "https://r2.dev/1.jpg", provider: "r2" },
            { url: "https://r2.dev/2.jpg", provider: "r2" },
            { url: "https://r2.dev/3.jpg", provider: "r2" },
          ],
        },
      ],
    },
    new Map()
  );

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.questionId, "q1");
  assert.deepEqual(
    normalized[0]?.photoUrls?.map(image => image.url),
    ["https://r2.dev/1.jpg", "https://r2.dev/2.jpg", "https://r2.dev/3.jpg"]
  );
});

test("normalizeInspectionAnswers funciona quando answers está vazio/ausente", () => {
  const normalized = normalizeInspectionAnswers(
    {
      itens: [
        {
          templateItemId: "q-legacy",
          resultado: "NC",
          observacaoItem: "Foto legacy",
          fotos: ["https://r2.dev/legacy.jpg"],
        },
      ],
    },
    new Map([["q-legacy", { oQueChecar: "Checar item legacy" }]])
  );

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.questionId, "q-legacy");
  assert.equal(normalized[0]?.questionText, "Checar item legacy");
  assert.deepEqual(normalized[0]?.photoUrls?.map(image => image.url), ["https://r2.dev/legacy.jpg"]);
});
