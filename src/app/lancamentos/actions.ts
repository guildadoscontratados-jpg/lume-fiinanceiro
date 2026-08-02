"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";

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
  await prisma.$transaction(async tx => {
    let ids = [id];
    if (current.installmentPlanId && scope !== "ONLY_THIS") {
      const all = await tx.transaction.findMany({ where: { installmentPlanId: current.installmentPlanId }, include: { installment: true } });
      const currentSequence = current.installment?.sequence ?? 0;
      ids = all.filter(item => scope === "ALL" || (item.installment?.sequence ?? 0) >= currentSequence).map(item => item.id);
      await tx.installmentPlan.update({ where: { id: current.installmentPlanId }, data: { description: data.description, personId: data.personId, categoryId: data.categoryId } });
    }
    await tx.transaction.updateMany({ where: { id: { in: ids } }, data });
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
  const data: Record<string, unknown> = {};
  if (person === "__none__" || person) data.personId = person === "__none__" ? null : person;
  if (category === "__none__" || category) data.categoryId = category === "__none__" ? null : category;
  if (["PENDING", "CONFIRMED", "PROJECTED", "VOID"].includes(status)) data.status = status;
  if (notes) data.notes = notes;
  if (!Object.keys(data).length) throw new Error("Escolha uma alteração para aplicar.");
  await prisma.$transaction(async tx => { await tx.transaction.updateMany({ where: { id: { in: ids } }, data }); if (person) await tx.transactionShare.deleteMany({ where: { transactionId: { in: ids } } }); });
  revalidatePath("/lancamentos");
  revalidatePath("/");
}
