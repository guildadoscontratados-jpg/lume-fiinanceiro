import { Prisma } from "@/generated/prisma-v9";
import type { BillingPeriod } from "@/lib/billing-period";
import { billingPeriodFromReferenceMonth, calculateAnchoredInstallmentBillingPeriods, calculateFirstBillingPeriod, calculateInstallmentBillingPeriods } from "@/lib/billing-period";

type Db = Prisma.TransactionClient;
type Share = { personId: string; percentageBps: number };

function monthStart(date: Date, offset = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1, 12));
}

function normalizedMerchant(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function createOrConfirmImportedTransaction(db: Db, input: { cardId: string; invoiceId: string | null; description: string; occurredAt: Date; amountCents: number; installmentNo: number | null; installmentTotal: number | null; billingPeriod?: BillingPeriod | null; billingPeriods?: Array<BillingPeriod & { sequence: number }> | null; invoiceMonth?: Date | null; personId: string | null; categoryId: string | null; shares: Share[]; notes: string }) {
  const merchantNormalized = normalizedMerchant(input.description);
  let billingPeriod = input.billingPeriod ?? null;
  let billingPeriods = input.billingPeriods ?? null;
  if (!billingPeriod) {
    const card = await db.card.findUnique({ where: { id: input.cardId }, select: { closingDay: true, dueDay: true } });
    if (card) {
      billingPeriod = input.invoiceMonth ? billingPeriodFromReferenceMonth(input.invoiceMonth, card.dueDay) : calculateFirstBillingPeriod(input.occurredAt, card.closingDay, card.dueDay);
      billingPeriods = input.installmentTotal ? input.invoiceMonth && input.installmentNo ? calculateAnchoredInstallmentBillingPeriods(billingPeriod, input.installmentNo, input.installmentTotal, card.dueDay) : calculateInstallmentBillingPeriods(input.occurredAt, card.closingDay, card.dueDay, input.installmentTotal).map(period => ({ ...period })) : null;
    }
  }
  if (billingPeriods && input.installmentNo && billingPeriods[input.installmentNo - 1]) billingPeriod = billingPeriods[input.installmentNo - 1];
  let invoiceId = input.invoiceId;
  if (!invoiceId && billingPeriod) {
    const referenceMonth = new Date(Date.UTC(billingPeriod.billingYear, billingPeriod.billingMonth - 1, 1, 12));
    const invoice = await db.invoice.upsert({ where: { cardId_referenceMonth: { cardId: input.cardId, referenceMonth } }, update: { dueDate: billingPeriod.estimatedDueDate }, create: { cardId: input.cardId, referenceMonth, dueDate: billingPeriod.estimatedDueDate } });
    invoiceId = invoice.id;
  }
  const baseData = { occurredAt: input.occurredAt, description: input.description, merchantOriginal: input.description, merchantNormalized, amountCents: input.amountCents, type: input.amountCents < 0 ? "REFUND" as const : "EXPENSE" as const, status: "CONFIRMED" as const, origin: "IMPORT" as const, cardId: input.cardId, invoiceId, personId: input.personId, categoryId: input.categoryId, billingMonth: billingPeriod?.billingMonth ?? null, billingYear: billingPeriod?.billingYear ?? null, billingReference: billingPeriod?.billingReference ?? null, estimatedDueDate: billingPeriod?.estimatedDueDate ?? null, notes: input.notes, shares: input.shares.length > 1 ? { create: input.shares } : undefined };
  const canParcel = input.amountCents > 0 && input.installmentNo && input.installmentTotal && input.installmentNo > 0 && input.installmentNo <= input.installmentTotal && billingPeriod && billingPeriods;
  if (!canParcel) return db.transaction.create({ data: baseData });

  const periods = billingPeriods!;
  const firstPeriod = periods[0];
  const lastPeriod = periods[periods.length - 1];
  const startDate = monthStart(new Date(Date.UTC(firstPeriod.billingYear, firstPeriod.billingMonth - 1, 1, 12)));
  let plan = await db.installmentPlan.findFirst({ where: { cardId: input.cardId, merchantNormalized, totalInstallments: input.installmentTotal!, installmentCents: input.amountCents, startDate, installments: { some: { purchaseDate: input.occurredAt } } }, include: { installments: true } });
  if (!plan) {
    const endDate = monthStart(new Date(Date.UTC(lastPeriod.billingYear, lastPeriod.billingMonth - 1, 1, 12)));
    plan = await db.installmentPlan.create({ data: { description: input.description, merchantNormalized, totalCents: input.amountCents * input.installmentTotal!, installmentCents: input.amountCents, totalInstallments: input.installmentTotal!, startDate, endDate, cardId: input.cardId, personId: input.personId, categoryId: input.categoryId, shares: input.shares.length > 1 ? { create: input.shares } : undefined, installments: { create: periods.map(period => ({ sequence: period.sequence, dueMonth: monthStart(new Date(Date.UTC(period.billingYear, period.billingMonth - 1, 1, 12))), amountCents: input.amountCents, status: period.sequence === input.installmentNo ? "CONFIRMED" : period.sequence > input.installmentNo! ? "PROJECTED" : "CANCELLED", purchaseDate: input.occurredAt, billingMonth: period.billingMonth, billingYear: period.billingYear, billingReference: period.billingReference, estimatedDueDate: period.estimatedDueDate, expectedAmountCents: input.amountCents, source: "IMPORT" })) } }, include: { installments: true } });
  }
  const installment = plan.installments.find(item => item.sequence === input.installmentNo);
  if (!installment) return db.transaction.create({ data: { ...baseData, installmentPlanId: plan.id } });
  if (installment.transactionId) {
    const existing = await db.transaction.findUnique({ where: { id: installment.transactionId } });
    if (existing) return existing;
  }
  const transaction = await db.transaction.create({ data: { ...baseData, installmentPlanId: plan.id } });
  await db.installment.update({ where: { id: installment.id }, data: { status: "CONFIRMED", transactionId: transaction.id } });
  return transaction;
}
