"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { allocatedAmount, allocatedInstallmentAmount, monthSelection } from "@/lib/receivables";

export async function settleMonthlyBalance(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const period = monthSelection(String(formData.get("mes") ?? ""));
  if (!personId) throw new Error("Pessoa não informada.");
  const [transactions, payments, projectedInstallments] = await Promise.all([
    prisma.transaction.findMany({ where: { status: { not: "VOID" }, OR: [{ billingYear: period.year, billingMonth: period.month }, { billingYear: null, invoice: { referenceMonth: { gte: period.start, lt: period.end } } }, { billingYear: null, invoiceId: null, occurredAt: { gte: period.start, lt: period.end } }] }, include: { shares: true } }),
    prisma.payment.findMany({ where: { personId, paidAt: { gte: period.start, lt: period.end } } }),
    prisma.installment.findMany({ where: { billingYear: period.year, billingMonth: period.month, status: { in: ["PROJECTED", "DIVERGENT"] } }, include: { plan: { select: { personId: true, shares: true } } } }),
  ]);
  const charged = transactions.reduce((sum, transaction) => sum + allocatedAmount(transaction, personId), 0);
  const projected = projectedInstallments.reduce((sum, installment) => sum + allocatedInstallmentAmount(installment, personId), 0);
  const received = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const totalPending = charged + projected - received;
  if (totalPending <= 0) throw new Error("Este saldo já está quitado.");
  const paidAt = new Date(period.year, period.month, 0, 12);
  await prisma.payment.create({ data: { personId, paidAt, method: "OTHER", amountCents: totalPending, notes: `Quitação automática da competência ${period.selected}${projected > 0 ? " (inclui parcelas previstas)" : ""}` } });
  revalidatePath("/receber");
  revalidatePath("/");
}
