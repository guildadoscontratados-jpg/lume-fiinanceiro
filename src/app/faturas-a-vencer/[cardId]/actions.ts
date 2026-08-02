"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

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
  if (!ids.length) throw new Error("Selecione ao menos um lançamento.");
  const action = String(formData.get("bulkAction") ?? "");
  const valid = await prisma.transaction.findMany({ where: { id: { in: ids }, cardId }, select: { id: true } });
  const validIds = valid.map(item => item.id);
  if (validIds.length !== ids.length) throw new Error("Há lançamentos inválidos na seleção.");

  if (action === "CATEGORY") {
    const categoryId = String(formData.get("categoryId") ?? "");
    if (!categoryId) throw new Error("Escolha uma categoria.");
    await prisma.transaction.updateMany({ where: { id: { in: validIds } }, data: { categoryId } });
  } else if (action === "PERSON") {
    const personId = String(formData.get("personId") ?? "");
    if (!personId) throw new Error("Escolha o devedor.");
    await prisma.$transaction([
      prisma.transactionShare.deleteMany({ where: { transactionId: { in: validIds } } }),
      prisma.transaction.updateMany({ where: { id: { in: validIds } }, data: { personId } }),
    ]);
  } else throw new Error("Escolha a alteração que deseja aplicar.");

  revalidatePath(`/faturas-a-vencer/${cardId}`);
  revalidatePath("/faturas-a-vencer");
  revalidatePath("/lancamentos");
}

export async function updateDueItemShares(cardId: string, formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  const count = Math.max(1, Math.trunc(Number(formData.get("shareCount") ?? 1)));
  const scope = String(formData.get("scope") ?? "ONLY_THIS");
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, cardId }, select: { id: true, installmentPlanId: true } });
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
  if (!value || !["categoryId", "personId"].includes(field)) throw new Error("Alteração inválida.");
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, cardId }, select: { id: true, installmentPlanId: true } });
  if (!transaction) throw new Error("Lançamento não encontrado.");
  if (field === "categoryId" && !await prisma.category.findFirst({ where: { id: value, active: true } })) throw new Error("Categoria indisponível.");
  if (field === "personId" && !await prisma.person.findFirst({ where: { id: value, status: "ACTIVE" } })) throw new Error("Pessoa indisponível.");
  await prisma.$transaction(async tx => {
    const ids = scope === "ALL" && transaction.installmentPlanId
      ? (await tx.transaction.findMany({ where: { installmentPlanId: transaction.installmentPlanId }, select: { id: true } })).map(item => item.id)
      : [transactionId];
    await tx.transaction.updateMany({ where: { id: { in: ids } }, data: field === "categoryId" ? { categoryId: value } : { personId: value } });
    if (field === "personId") await tx.transactionShare.deleteMany({ where: { transactionId: { in: ids } } });
    if (scope === "ALL" && transaction.installmentPlanId) await tx.installmentPlan.update({ where: { id: transaction.installmentPlanId }, data: field === "categoryId" ? { categoryId: value } : { personId: value } });
  });
  revalidatePath(`/faturas-a-vencer/${cardId}`);
  revalidatePath("/faturas-a-vencer");
  revalidatePath("/lancamentos");
  revalidatePath("/parcelamentos");
  revalidatePath("/previsoes");
}
