"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { allocatedAmount, monthSelection } from "@/lib/receivables";

export async function settleMonthlyBalance(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const period = monthSelection(String(formData.get("mes") ?? ""));
  if (!personId) throw new Error("Pessoa não informada.");
  const [transactions, payments] = await Promise.all([
    prisma.transaction.findMany({ where: { status: { not: "VOID" }, OR: [{ billingYear: period.year, billingMonth: period.month }, { billingYear: null, invoice: { referenceMonth: { gte: period.start, lt: period.end } } }, { billingYear: null, invoiceId: null, occurredAt: { gte: period.start, lt: period.end } }] }, include: { shares: true } }),
    prisma.payment.findMany({ where: { personId, paidAt: { gte: period.start, lt: period.end } } }),
  ]);
  const charged = transactions.reduce((sum, transaction) => sum + allocatedAmount(transaction, personId), 0);
  const received = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const balance = charged - received;
  if (balance <= 0) throw new Error("Este saldo já está quitado.");
  const paidAt = new Date(period.year, period.month, 0, 12);
  await prisma.payment.create({ data: { personId, paidAt, method: "OTHER", amountCents: balance, notes: `Quitação automática da competência ${period.selected}` } });
  revalidatePath("/receber");
  revalidatePath("/");
}
