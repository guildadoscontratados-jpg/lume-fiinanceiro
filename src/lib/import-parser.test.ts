import assert from "node:assert/strict";
import test from "node:test";
import { parseStatement } from "./import-parser.ts";

test("reconhece parcelas na coluna separada do CSV do Sicredi", () => {
  const csv = [
    " Data ; Descrição ; Parcela ; Valor ; Valor em Dólar ; Adicional ; Nome;",
    '04/07/2026;CARIOCA CALCADOS LT;(01/05);"R$ 138,00";;;Lucas Da Silva',
    '19/06/2026;RUSH CAR SOLUCOES A;(02/05);"R$ 1.246,20";;;Lucas Da Silva',
    '20/07/2026;GEOVANA SILVA;;"R$ 25,98";;;Lucas Da Silva',
  ].join("\n");

  const parsed = parseStatement("sicredi.csv", Buffer.from(csv));

  assert.equal(parsed.mappingRequired, false);
  assert.deepEqual(parsed.rows.map(row => [row.installmentNo, row.installmentTotal]), [[1, 5], [2, 5], [null, null]]);
  assert.deepEqual(parsed.rows.map(row => row.amountCents), [13800, 124620, 2598]);
});
