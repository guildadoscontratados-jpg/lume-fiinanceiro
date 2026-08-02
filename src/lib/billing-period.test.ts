import assert from "node:assert/strict";
import test from "node:test";
import { billingPeriodFromReferenceMonth, calculateAnchoredInstallmentBillingPeriods, calculateFirstBillingPeriod, calculateInstallmentBillingPeriods } from "./billing-period.ts";

const date = (value: string) => new Date(`${value}T12:00:00Z`);

test("fechamento dia 30: compras antes, no dia e depois", () => {
  assert.equal(calculateFirstBillingPeriod(date("2026-07-29"), 30, 10).billingReference, "08/2026");
  assert.equal(calculateFirstBillingPeriod(date("2026-07-30"), 30, 10).billingReference, "09/2026");
  assert.equal(calculateFirstBillingPeriod(date("2026-07-31"), 30, 10).billingReference, "09/2026");
});

test("parcelas avançam uma competência por vez", () => {
  const periods = calculateInstallmentBillingPeriods(date("2026-07-29"), 30, 10, 3);
  assert.deepEqual(periods.map(item => item.billingReference), ["08/2026", "09/2026", "10/2026"]);
  assert.deepEqual(periods.map(item => item.estimatedDueDate.toISOString().slice(0, 10)), ["2026-08-10", "2026-09-10", "2026-10-10"]);
});

test("virada de ano", () => {
  assert.deepEqual(calculateInstallmentBillingPeriods(date("2026-12-29"), 30, 10, 3).map(item => item.billingReference), ["01/2027", "02/2027", "03/2027"]);
  assert.deepEqual(calculateInstallmentBillingPeriods(date("2026-12-30"), 30, 10, 3).map(item => item.billingReference), ["02/2027", "03/2027", "04/2027"]);
});

test("vencimento no dia inexistente usa o último dia do mês", () => {
  assert.equal(calculateFirstBillingPeriod(date("2027-01-29"), 30, 31).estimatedDueDate.toISOString().slice(0, 10), "2027-02-28");
  assert.equal(calculateFirstBillingPeriod(date("2028-01-29"), 30, 31).estimatedDueDate.toISOString().slice(0, 10), "2028-02-29");
});

test("parcela importada fica na competência da fatura atual", () => {
  const current = calculateFirstBillingPeriod(date("2026-07-01"), 30, 10);
  const periods = calculateAnchoredInstallmentBillingPeriods(current, 12, 12, 10);
  assert.equal(periods[11].billingReference, "08/2026");
  assert.equal(periods[0].billingReference, "09/2025");
});

test("competência já calculada não avança outro mês", () => {
  assert.equal(billingPeriodFromReferenceMonth(date("2026-08-01"), 10).billingReference, "08/2026");
});
