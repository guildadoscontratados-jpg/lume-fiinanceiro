"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";

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
