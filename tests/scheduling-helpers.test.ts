import { test } from "node:test";
import assert from "node:assert/strict";

import {
  groupScheduleByDate,
  inferArea,
  severityWithinRange,
  type ScheduleRecord,
} from "../src/lib/programacao/scheduling-helpers";

test("inferArea prioritizes electrical hints over mechanical", () => {
  assert.equal(inferArea("Elétrica Predial", null), "eletrica");
  assert.equal(inferArea("MANUTENÇÃO", "Área Mecânica"), "mecanica");
  assert.equal(inferArea(undefined, ""), "todas");
});

test("severityWithinRange respects minimum and maximum bounds", () => {
  assert.equal(severityWithinRange(3, 2, 4), true);
  assert.equal(severityWithinRange(1, 2, 5), false);
  assert.equal(severityWithinRange(5, undefined, 4), false);
  assert.equal(severityWithinRange(null, 4, 5), true);
});

test("groupScheduleByDate clusters by ISO date and sorts ascending", () => {
  const records: ScheduleRecord[] = [
    {
      id: "1",
      osNumero: "OS-1",
      status: "programado",
      machine: { tag: "TAG-1", nome: "Motor 1", setor: "Eletrica", unidade: "U1", area: "eletrica" },
      manutencao: { tipo: "Elétrica", criticidade: "Alta", severity: null },
      datas: { programada: "2024-05-02T10:00:00.000Z", prazo: null, vencimento: null },
      responsavel: { nome: "Alice", maintId: "m1", matricula: "123" },
      responsaveis: [],
      effectiveSeverity: 5,
    },
    {
      id: "2",
      osNumero: "OS-2",
      status: "programado",
      machine: { tag: "TAG-2", nome: "Motor 2", setor: "Mecanica", unidade: "U1", area: "mecanica" },
      manutencao: { tipo: "Mecânica", criticidade: "Média", severity: null },
      datas: { programada: "2024-05-02T14:00:00.000Z", prazo: null, vencimento: null },
      responsavel: { nome: "Bob", maintId: "m2", matricula: "456" },
      responsaveis: [],
      effectiveSeverity: 3,
    },
    {
      id: "3",
      osNumero: "OS-3",
      status: "programado",
      machine: { tag: "TAG-3", nome: "Motor 3", setor: "Predial", unidade: "U2", area: "todas" },
      manutencao: { tipo: "Predial", criticidade: "Baixa", severity: null },
      datas: { programada: null, prazo: null, vencimento: null },
      responsavel: { nome: "Carol", maintId: "m3", matricula: "789" },
      responsaveis: [],
      effectiveSeverity: 2,
    },
  ];

  const grouped = groupScheduleByDate(records);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped[0]?.date, "2024-05-02");
  assert.equal(grouped[0]?.list.length, 2);
  assert.equal(grouped[1]?.date, "Sem data");
  assert.equal(grouped[1]?.list[0]?.id, "3");
});
