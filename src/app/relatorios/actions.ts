"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { normalizeMerchant } from "@/lib/merchant-rules";

export async function setMerchantExpenseKind(merchantKey: string, label: string, kind: string) {
  const key = normalizeMerchant(merchantKey);
  if (!key) throw new Error("Estabelecimento inválido.");
  if (kind !== "FIXA" && kind !== "VARIAVEL") throw new Error("Tipo de despesa inválido.");
  await prisma.merchantExpenseKind.upsert({ where: { merchantKey: key }, update: { kind, label }, create: { merchantKey: key, label, kind } });
  revalidatePath("/relatorios");
  revalidatePath("/faturas-a-vencer", "layout");
}

export async function setMerchantExpenseKindFromForm(formData: FormData) {
  await setMerchantExpenseKind(String(formData.get("merchantKey") ?? ""), String(formData.get("label") ?? ""), String(formData.get("kind") ?? ""));
}
