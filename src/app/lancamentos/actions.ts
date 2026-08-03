"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import type { Prisma } from "@/generated/prisma-v9";

function parseDueDate(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) throw new Error("Informe uma data de vencimento válida.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw new Error("Informe uma data de vencimento válida.");
  return date;
}

function parseDueMonth(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  if (!match) throw new Error("Informe um mês e ano de vencimento válidos.");
  return { year: Number(match[1]), month: Number(match[2]) };
}

async function applyDueDate(tx: Prisma.TransactionClient, transactionIds: string[], dueDate: Date) {
  const transactions = await tx.transaction.findMany({ where: { id: { in: transactionIds } }, select: { id: true, cardId: true } });
  if (transactions.length !== transactionIds.length || transactions.some(item => !item.cardId)) throw new Error("O vencimento só pode ser alterado em lançamentos vinculados a um cartão.");
  const referenceMonth = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), 1, 12));
  const billingMonth = dueDate.getUTCMonth() + 1;
  const billingYear = dueDate.getUTCFullYear();
  const billingReference = `${String(billingMonth).padStart(2, "0")}/${billingYear}`;
  for (const cardId of new Set(transactions.map(item => item.cardId!))) {
    const invoice = await tx.invoice.upsert({ where: { cardId_referenceMonth: { cardId, referenceMonth } }, update: { dueDate }, create: { cardId, referenceMonth, dueDate } });
    const ids = transactions.filter(item => item.cardId === cardId).map(item => item.id);
    await tx.transaction.updateMany({ where: { id: { in: ids } }, data: { invoiceId: invoice.id, billingMonth, billingYear, billingReference, estimatedDueDate: dueDate } });
    await tx.installment.updateMany({ where: { transactionId: { in: ids } }, data: { dueMonth: referenceMonth, billingMonth, billingYear, billingReference, estimatedDueDate: dueDate } });
  }
}

async function applyDueMonth(tx: Prisma.TransactionClient, transactionIds: string[], dueMonth: { year: number; month: number }) {
  const transactions = await tx.transaction.findMany({ where: { id: { in: transactionIds } }, select: { id: true, cardId: true } });
  if (transactions.length !== transactionIds.length || transactions.some(item => !item.cardId)) throw new Error("O vencimento só pode ser alterado em lançamentos vinculados a um cartão.");
  const cards = await tx.card.findMany({ where: { id: { in: [...new Set(transactions.map(item => item.cardId!))] } }, select: { id: true, dueDay: true } });
  const lastDay = new Date(Date.UTC(dueMonth.year, dueMonth.month, 0, 12)).getUTCDate();
  for (const card of cards) {
    const ids = transactions.filter(item => item.cardId === card.id).map(item => item.id);
    const dueDate = new Date(Date.UTC(dueMonth.year, dueMonth.month - 1, Math.min(Math.max(1, card.dueDay), lastDay), 12));
    await applyDueDate(tx, ids, dueDate);
  }
}

function parsePercentage(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return 0;
  const percentage = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(percentage) || percentage < 0 || percentage > 10000) throw new Error("Os percentuais devem estar entre 0 e 100.");
  return percentage;
}

export async function createTransaction(formData: FormData) {
  const description = String(formData.get("description") ?? "").trim();
  const occurredAt = String(formData.get("occurredAt") ?? "");
  if (!description || !occurredAt) throw new Error("Descrição e data são obrigatórias.");
  const people = await prisma.person.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  const shares = people.map(person => ({ personId: person.id, percentageBps: parsePercentage(formData.get(`share-${person.id}`)) })).filter(share => share.percentageBps > 0);
  if (shares.length && shares.reduce((sum, share) => sum + share.percentageBps, 0) !== 10000) throw new Error("A divisão entre pessoas deve totalizar exatamente 100%.");
  const personId = shares.length ? null : String(formData.get("personId") ?? "") || null;
  await prisma.transaction.create({ data: { description, merchantOriginal: description, merchantNormalized: description.toUpperCase(), amountCents: toCents(formData.get("amount")), occurredAt: new Date(`${occurredAt}T12:00:00`), status: "CONFIRMED", origin: "MANUAL", cardId: String(formData.get("cardId") ?? "") || null, personId, categoryId: String(formData.get("categoryId") ?? "") || null, notes: String(formData.get("notes") ?? "").trim() || null, shares: shares.length ? { create: shares } : undefined } });
  revalidatePath("/lancamentos");
  revalidatePath("/");
}

export async function updateTransaction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const current = await prisma.transaction.findUnique({ where: { id }, include: { installment: true } });
  if (!current) throw new Error("Lançamento não encontrado.");
  const data = { description: String(formData.get("description") ?? "").trim(), personId: String(formData.get("personId") ?? "") || null, categoryId: String(formData.get("categoryId") ?? "") || null, status: String(formData.get("status") ?? "CONFIRMED") as "PENDING" | "CONFIRMED" | "PROJECTED" | "VOID", notes: String(formData.get("notes") ?? "").trim() || null };
  if (!data.description) throw new Error("A descrição é obrigatória.");
  const scope = String(formData.get("scope") ?? "ONLY_THIS");
  const dueDate = parseDueDate(formData.get("dueDate"));
  await prisma.$transaction(async tx => {
    let ids = [id];
    if (current.installmentPlanId && scope !== "ONLY_THIS") {
      const all = await tx.transaction.findMany({ where: { installmentPlanId: current.installmentPlanId }, include: { installment: true } });
      const currentSequence = current.installment?.sequence ?? 0;
      ids = all.filter(item => scope === "ALL" || (item.installment?.sequence ?? 0) >= currentSequence).map(item => item.id);
      await tx.installmentPlan.update({ where: { id: current.installmentPlanId }, data: { description: data.description, personId: data.personId, categoryId: data.categoryId } });
    }
    await tx.transaction.updateMany({ where: { id: { in: ids } }, data });
    if (dueDate) await applyDueDate(tx, [id], dueDate);
    if (data.personId) await tx.transactionShare.deleteMany({ where: { transactionId: { in: ids } } });
  });
  revalidatePath("/lancamentos");
  revalidatePath("/previsoes");
  revalidatePath("/");
}

export async function bulkUpdateTransactions(formData: FormData) {
  const ids = formData.getAll("selected").map(String).filter(Boolean);
  if (!ids.length) throw new Error("Selecione ao menos um lançamento.");
  const person = String(formData.get("bulkPerson") ?? "");
  const category = String(formData.get("bulkCategory") ?? "");
  const status = String(formData.get("bulkStatus") ?? "");
  const notes = String(formData.get("bulkNotes") ?? "").trim();
  const dueMonth = parseDueMonth(formData.get("bulkDueMonth"));
  const data: Record<string, unknown> = {};
  if (person === "__none__" || person) data.personId = person === "__none__" ? null : person;
  if (category === "__none__" || category) data.categoryId = category === "__none__" ? null : category;
  if (["PENDING", "CONFIRMED", "PROJECTED", "VOID"].includes(status)) data.status = status;
  if (notes) data.notes = notes;
  if (!Object.keys(data).length && !dueMonth) throw new Error("Escolha uma alteração para aplicar.");
  await prisma.$transaction(async tx => { if (Object.keys(data).length) await tx.transaction.updateMany({ where: { id: { in: ids } }, data }); if (dueMonth) await applyDueMonth(tx, ids, dueMonth); if (person) await tx.transactionShare.deleteMany({ where: { transactionId: { in: ids } } }); });
  revalidatePath("/lancamentos");
  revalidatePath("/faturas");
  revalidatePath("/faturas-a-vencer");
  revalidatePath("/previsoes");
  revalidatePath("/");
}
