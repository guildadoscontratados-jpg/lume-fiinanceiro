"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma-v9";

function parsedDate(value: string) {
  const match = value.match(/^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) throw new Error("Informe um vencimento válido.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw new Error("Informe um vencimento válido.");
  return date;
}

async function setDueDate(tx: Prisma.TransactionClient, cardId: string, ids: string[], dueDate: Date) {
  const referenceMonth = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), 1, 12));
  const billingMonth = dueDate.getUTCMonth() + 1;
  const billingYear = dueDate.getUTCFullYear();
  const billingReference = `${String(billingMonth).padStart(2, "0")}/${billingYear}`;
  const invoice = await tx.invoice.upsert({ where: { cardId_referenceMonth: { cardId, referenceMonth } }, update: { dueDate }, create: { cardId, referenceMonth, dueDate } });
  await tx.transaction.updateMany({ where: { id: { in: ids }, cardId }, data: { invoiceId: invoice.id, billingMonth, billingYear, billingReference, estimatedDueDate: dueDate } });
  await tx.installment.updateMany({ where: { transactionId: { in: ids } }, data: { dueMonth: referenceMonth, billingMonth, billingYear, billingReference, estimatedDueDate: dueDate } });
}

function shiftedDueDate(base: Date, monthOffset: number) {
  const targetMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset, 1, 12));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0, 12)).getUTCDate();
  return new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), Math.min(base.getUTCDate(), lastDay), 12));
}

async function setInstallmentDueDate(tx: Prisma.TransactionClient, cardId: string, installment: { id: string; transactionId: string | null }, dueDate: Date) {
  const dueMonth = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), 1, 12));
  const billingMonth = dueDate.getUTCMonth() + 1;
  const billingYear = dueDate.getUTCFullYear();
  const billingReference = `${String(billingMonth).padStart(2, "0")}/${billingYear}`;
  await tx.installment.update({ where: { id: installment.id }, data: { dueMonth, billingMonth, billingYear, billingReference, estimatedDueDate: dueDate } });
  if (installment.transactionId) await setDueDate(tx, cardId, [installment.transactionId], dueDate);
}

async function shiftCurrentAndFutureInstallments(tx: Prisma.TransactionClient, cardId: string, planId: string, currentSequence: number, firstDueDate: Date) {
  const installments = await tx.installment.findMany({ where: { planId, sequence: { gte: currentSequence } }, orderBy: { sequence: "asc" } });
  for (const installment of installments) await setInstallmentDueDate(tx, cardId, installment, shiftedDueDate(firstDueDate, installment.sequence - currentSequence));
  const last = await tx.installment.findFirst({ where: { planId }, orderBy: { sequence: "desc" }, select: { dueMonth: true } });
  if (last) await tx.installmentPlan.update({ where: { id: planId }, data: { endDate: last.dueMonth } });
}

function percentage(value: FormDataEntryValue | null) {
  const parsed = Math.round(Number(String(value ?? "").trim().replace(",", ".")) * 100);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function createDueCategory(cardId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Informe o nome da categoria.");
  await prisma.category.create({ data: { name, color: String(formData.get("color") ?? "").trim() || null } });
  revalidatePath(`/faturas-a-vencer/${cardId}`);
  revalidatePath("/categorias");
}

export async function bulkClassifyDueItems(cardId: string, formData: FormData) {
  const ids = [...new Set(formData.getAll("selected").map(String).filter(Boolean))];
  const installmentIds = [...new Set(formData.getAll("selectedInstallments").map(String).filter(Boolean))];
  if (!ids.length && !installmentIds.length) throw new Error("Selecione ao menos um lançamento.");
  const action = String(formData.get("bulkAction") ?? "");
  const valid = await prisma.transaction.findMany({ where: { id: { in: ids }, cardId }, select: { id: true } });
  const validIds = valid.map(item => item.id);
  if (validIds.length !== ids.length) throw new Error("Há lançamentos inválidos na seleção.");
  const validInstallments = await prisma.installment.findMany({ where: { id: { in: installmentIds }, plan: { cardId } }, select: { id: true, planId: true, sequence: true, transactionId: true } });
  if (validInstallments.length !== installmentIds.length) throw new Error("Há parcelas inválidas na seleção.");

  if (action === "CATEGORY") {
    if (validInstallments.length) throw new Error("Parcelas previstas só podem ter o vencimento alterado em massa.");
    const categoryId = String(formData.get("categoryId") ?? "");
    if (!categoryId) throw new Error("Escolha uma categoria.");
    await prisma.transaction.updateMany({ where: { id: { in: validIds } }, data: { categoryId } });
  } else if (action === "PERSON") {
    if (validInstallments.length) throw new Error("Parcelas previstas só podem ter o vencimento alterado em massa.");
    const personId = String(formData.get("personId") ?? "");
    if (!personId) throw new Error("Escolha o devedor.");
    await prisma.$transaction([
      prisma.transactionShare.deleteMany({ where: { transactionId: { in: validIds } } }),
      prisma.transaction.updateMany({ where: { id: { in: validIds } }, data: { personId } }),
    ]);
  } else if (action === "DUE_MONTH") {
    const monthText = String(formData.get("dueMonth") ?? "");
    if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(monthText)) throw new Error("Escolha o mês e o ano do vencimento.");
    const [year, month] = monthText.split("-").map(Number);
    const card = await prisma.card.findUnique({ where: { id: cardId }, select: { dueDay: true } });
    if (!card) throw new Error("Cartão não encontrado.");
    const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
    const dueDate = new Date(Date.UTC(year, month - 1, Math.min(Math.max(1, card.dueDay), lastDay), 12));
    const scope = String(formData.get("scope") ?? "ONLY_THIS");
    const installmentItems = await prisma.transaction.findMany({ where: { id: { in: validIds }, installmentPlanId: { not: null } }, select: { id: true, installmentPlanId: true, installment: { select: { sequence: true } } } });
    const transactionInstallmentIds = new Set(installmentItems.map(item => item.id));
    const plainIds = validIds.filter(id => !transactionInstallmentIds.has(id));
    await prisma.$transaction(async tx => {
      if (plainIds.length) await setDueDate(tx, cardId, plainIds, dueDate);
      for (const item of installmentItems) {
        if (scope === "THIS_AND_FUTURE" && item.installmentPlanId && item.installment) await shiftCurrentAndFutureInstallments(tx, cardId, item.installmentPlanId, item.installment.sequence, dueDate);
        else await setDueDate(tx, cardId, [item.id], dueDate);
      }
      for (const installment of validInstallments) {
        if (scope === "THIS_AND_FUTURE") await shiftCurrentAndFutureInstallments(tx, cardId, installment.planId, installment.sequence, dueDate);
        else await setInstallmentDueDate(tx, cardId, installment, dueDate);
      }
    });
  } else throw new Error("Escolha a alteração que deseja aplicar.");

  revalidatePath(`/faturas-a-vencer/${cardId}`);
  revalidatePath("/faturas-a-vencer");
  revalidatePath("/lancamentos");
  revalidatePath("/parcelamentos");
  revalidatePath("/previsoes");
}

export async function updateDueItemShares(cardId: string, formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  const count = Math.max(1, Math.trunc(Number(formData.get("shareCount") ?? 1)));
  const scope = String(formData.get("scope") ?? "ONLY_THIS");
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, cardId }, select: { id: true, installmentPlanId: true, installment: { select: { sequence: true } } } });
  if (!transaction) throw new Error("Lançamento não encontrado.");
  const shares = Array.from({ length: count }, (_, index) => ({ personId: String(formData.get(`sharePerson-${index}`) ?? ""), percentageBps: percentage(formData.get(`sharePercent-${index}`)) })).filter(item => item.personId);
  if (shares.length !== count) throw new Error("Selecione uma pessoa em cada linha do rateio.");
  if (new Set(shares.map(item => item.personId)).size !== shares.length) throw new Error("Não repita a mesma pessoa no rateio.");
  if (count > 1 && shares.reduce((sum, item) => sum + item.percentageBps, 0) !== 10000) throw new Error("O rateio deve totalizar exatamente 100%.");
  if (count === 1) shares[0].percentageBps = 10000;
  await prisma.$transaction(async tx => {
    const ids = count === 1 && scope === "ALL" && transaction.installmentPlanId
      ? (await tx.transaction.findMany({ where: { installmentPlanId: transaction.installmentPlanId }, select: { id: true } })).map(item => item.id)
      : [transactionId];
    await tx.transactionShare.deleteMany({ where: { transactionId: { in: ids } } });
    if (count === 1) {
      await tx.transaction.updateMany({ where: { id: { in: ids } }, data: { personId: shares[0].personId } });
      if (scope === "ALL" && transaction.installmentPlanId) await tx.installmentPlan.update({ where: { id: transaction.installmentPlanId }, data: { personId: shares[0].personId } });
    }
    else {
      await tx.transaction.update({ where: { id: transactionId }, data: { personId: null } });
      await tx.transactionShare.createMany({ data: shares.map(share => ({ transactionId, ...share })) });
    }
  });
  revalidatePath(`/faturas-a-vencer/${cardId}`);
  revalidatePath("/lancamentos");
}

export async function updateDueItemField(cardId: string, formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "");
  const scope = String(formData.get("scope") ?? "ONLY_THIS");
  if (!value || !["categoryId", "personId", "dueDate"].includes(field)) throw new Error("Alteração inválida.");
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, cardId }, select: { id: true, installmentPlanId: true, installment: { select: { sequence: true } } } });
  if (!transaction) throw new Error("Lançamento não encontrado.");
  if (field === "categoryId" && !await prisma.category.findFirst({ where: { id: value, active: true } })) throw new Error("Categoria indisponível.");
  if (field === "personId" && !await prisma.person.findFirst({ where: { id: value, status: "ACTIVE" } })) throw new Error("Pessoa indisponível.");
  await prisma.$transaction(async tx => {
    const ids = scope === "ALL" && transaction.installmentPlanId
      ? (await tx.transaction.findMany({ where: { installmentPlanId: transaction.installmentPlanId }, select: { id: true } })).map(item => item.id)
      : [transactionId];
    if (field === "dueDate" && scope === "THIS_AND_FUTURE" && transaction.installmentPlanId && transaction.installment) await shiftCurrentAndFutureInstallments(tx, cardId, transaction.installmentPlanId, transaction.installment.sequence, parsedDate(value));
    else if (field === "dueDate") await setDueDate(tx, cardId, [transactionId], parsedDate(value));
    else await tx.transaction.updateMany({ where: { id: { in: ids } }, data: field === "categoryId" ? { categoryId: value } : { personId: value } });
    if (field === "personId") await tx.transactionShare.deleteMany({ where: { transactionId: { in: ids } } });
    if (scope === "ALL" && transaction.installmentPlanId) await tx.installmentPlan.update({ where: { id: transaction.installmentPlanId }, data: field === "categoryId" ? { categoryId: value } : { personId: value } });
  });
  revalidatePath(`/faturas-a-vencer/${cardId}`);
  revalidatePath("/faturas-a-vencer");
  revalidatePath("/lancamentos");
  revalidatePath("/parcelamentos");
  revalidatePath("/previsoes");
}

export async function updateProjectedDueDate(cardId: string, formData: FormData) {
  const installmentId = String(formData.get("installmentId") ?? "");
  const value = String(formData.get("value") ?? "");
  const scope = String(formData.get("scope") ?? "ONLY_THIS");
  const installment = await prisma.installment.findFirst({ where: { id: installmentId, plan: { cardId } }, select: { id: true, planId: true, sequence: true, transactionId: true } });
  if (!installment) throw new Error("Parcela não encontrada.");
  const dueDate = parsedDate(value);
  await prisma.$transaction(async tx => {
    if (scope === "THIS_AND_FUTURE") await shiftCurrentAndFutureInstallments(tx, cardId, installment.planId, installment.sequence, dueDate);
    else await setInstallmentDueDate(tx, cardId, installment, dueDate);
  });
  revalidatePath(`/faturas-a-vencer/${cardId}`);
  revalidatePath("/faturas-a-vencer");
  revalidatePath("/lancamentos");
  revalidatePath("/parcelamentos");
  revalidatePath("/previsoes");
}
