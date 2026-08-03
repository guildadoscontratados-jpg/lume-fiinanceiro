"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { redirect } from "next/navigation";

function validDay(value: FormDataEntryValue | null) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error("Os dias de fechamento e vencimento devem estar entre 1 e 31.");
  return day;
}

export async function createCard(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const bankName = String(formData.get("bank") ?? "").trim();
  const holderId = String(formData.get("holderId") ?? "");
  const lastFour = String(formData.get("lastFour") ?? "").replace(/\D/g, "");
  if (!name || !bankName || !holderId || lastFour.length !== 4) throw new Error("Preencha nome, banco, titular e os quatro últimos dígitos.");
  const bank = await prisma.bank.upsert({ where: { name: bankName }, update: {}, create: { name: bankName } });
  await prisma.card.create({ data: { name, bankId: bank.id, holderId, lastFour, brand: String(formData.get("brand") ?? "").trim() || null, closingDay: Number(formData.get("closingDay")), dueDay: Number(formData.get("dueDay")), limitCents: formData.get("limit") ? toCents(formData.get("limit")) : null, color: String(formData.get("color") ?? "").trim() || null } });
  revalidatePath("/cartoes");
  revalidatePath("/");
}

export async function updateCard(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) throw new Error("Informe o nome do cartão.");
  const limitText = String(formData.get("limit") ?? "").trim();
  const limitCents = limitText ? toCents(limitText) : null;
  if (limitCents !== null && limitCents < 0) throw new Error("O limite não pode ser negativo.");
  await prisma.card.update({
    where: { id },
    data: {
      name,
      limitCents,
      closingDay: validDay(formData.get("closingDay")),
      dueDay: validDay(formData.get("dueDay")),
    },
  });
  revalidatePath("/cartoes");
  revalidatePath("/");
  revalidatePath("/faturas-a-vencer");
  revalidatePath("/importar");
  redirect("/cartoes");
}
