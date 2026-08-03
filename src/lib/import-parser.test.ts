import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
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

test("reconhece datas, parcelas e valores no formato da fatura do Itaú", () => {
  const matrix = [
    ["", "Cartão", "", "", "Valor", "", "Vencimento"],
    ["", "Azul Itau Infinite Visa - final 9596", "", "", "R$ 6,235.91", "", "8/9/26"],
    ["", "Data", "Lançamento", "Parcelamento", "Valor"],
    ["", "8/1/26", "Asics", "Parcela 1 de 7", "R$ 55.73"],
    ["", "7/31/26", "Giassi", "", "R$ 1,273.81"],
    ["", "", "", "", ""],
    ["", "Importante saber", "rodapé", "", ""],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), "Fatura 08-26");
  const parsed = parseStatement("fatura-fechada-final 9596-agosto2026.xlsx", XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].occurredAt?.toISOString().slice(0, 10), "2026-08-01");
  assert.equal(parsed.rows[1].occurredAt?.toISOString().slice(0, 10), "2026-07-31");
  assert.deepEqual([parsed.rows[0].installmentNo, parsed.rows[0].installmentTotal], [1, 7]);
  assert.equal(parsed.rows[1].amountCents, 127381);
  assert.equal(parsed.dueDate?.toISOString().slice(0, 10), "2026-08-09");
});
