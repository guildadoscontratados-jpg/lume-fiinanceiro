export type BillingPeriod = {
  billingMonth: number;
  billingYear: number;
  billingReference: string;
  estimatedDueDate: Date;
};

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
}

function effectiveDay(year: number, month: number, configuredDay: number) {
  return Math.min(Math.max(1, Math.trunc(configuredDay)), daysInMonth(year, month));
}

function addMonths(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function calculateFirstBillingPeriod(purchaseDate: Date, closingDay: number, dueDay: number): BillingPeriod {
  if (Number.isNaN(purchaseDate.getTime())) throw new Error("Data da compra inválida.");
  const purchaseYear = purchaseDate.getUTCFullYear();
  const purchaseMonth = purchaseDate.getUTCMonth() + 1;
  const purchaseDay = purchaseDate.getUTCDate();
  const closing = effectiveDay(purchaseYear, purchaseMonth, closingDay);
  const billing = addMonths(purchaseYear, purchaseMonth, purchaseDay < closing ? 1 : 2);
  const due = effectiveDay(billing.year, billing.month, dueDay);
  const estimatedDueDate = new Date(Date.UTC(billing.year, billing.month - 1, due, 12));
  return { billingMonth: billing.month, billingYear: billing.year, billingReference: `${String(billing.month).padStart(2, "0")}/${billing.year}`, estimatedDueDate };
}

export function billingPeriodFromReferenceMonth(referenceMonth: Date, dueDay: number): BillingPeriod {
  if (Number.isNaN(referenceMonth.getTime())) throw new Error("Competência da fatura inválida.");
  const billingYear = referenceMonth.getUTCFullYear();
  const billingMonth = referenceMonth.getUTCMonth() + 1;
  const due = effectiveDay(billingYear, billingMonth, dueDay);
  return { billingMonth, billingYear, billingReference: `${String(billingMonth).padStart(2, "0")}/${billingYear}`, estimatedDueDate: new Date(Date.UTC(billingYear, billingMonth - 1, due, 12)) };
}

export function calculateInstallmentBillingPeriods(purchaseDate: Date, closingDay: number, dueDay: number, totalInstallments: number) {
  if (!Number.isInteger(totalInstallments) || totalInstallments < 1) throw new Error("A quantidade de parcelas deve ser maior que zero.");
  const first = calculateFirstBillingPeriod(purchaseDate, closingDay, dueDay);
  return Array.from({ length: totalInstallments }, (_, index) => {
    const billing = addMonths(first.billingYear, first.billingMonth, index);
    const due = effectiveDay(billing.year, billing.month, dueDay);
    return { sequence: index + 1, billingMonth: billing.month, billingYear: billing.year, billingReference: `${String(billing.month).padStart(2, "0")}/${billing.year}`, estimatedDueDate: new Date(Date.UTC(billing.year, billing.month - 1, due, 12)) };
  });
}

export function calculateAnchoredInstallmentBillingPeriods(currentPeriod: BillingPeriod, currentInstallment: number, totalInstallments: number, dueDay: number) {
  if (!Number.isInteger(totalInstallments) || totalInstallments < 1) throw new Error("A quantidade de parcelas deve ser maior que zero.");
  if (!Number.isInteger(currentInstallment) || currentInstallment < 1 || currentInstallment > totalInstallments) throw new Error("A parcela atual deve estar entre 1 e o total de parcelas.");
  return Array.from({ length: totalInstallments }, (_, index) => {
    const sequence = index + 1;
    const billing = addMonths(currentPeriod.billingYear, currentPeriod.billingMonth, sequence - currentInstallment);
    const due = effectiveDay(billing.year, billing.month, dueDay);
    return { sequence, billingMonth: billing.month, billingYear: billing.year, billingReference: `${String(billing.month).padStart(2, "0")}/${billing.year}`, estimatedDueDate: new Date(Date.UTC(billing.year, billing.month - 1, due, 12)) };
  });
}

export function calculateBillingAmount(totalCents: number, totalInstallments: number) {
  if (!Number.isInteger(totalInstallments) || totalInstallments < 1) throw new Error("A quantidade de parcelas deve ser maior que zero.");
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error("O valor da compra deve ser maior ou igual a zero.");
  return Math.floor(totalCents / totalInstallments);
}
