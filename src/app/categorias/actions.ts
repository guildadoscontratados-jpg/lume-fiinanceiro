"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("O nome é obrigatório.");
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  await prisma.category.create({ data: { name, parentId, color: String(formData.get("color") ?? "").trim() || null } });
  revalidatePath("/categorias");
}

export async function toggleCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const category = await prisma.category.findUnique({ where: { id }, select: { active: true } });
  if (!category) throw new Error("Categoria não encontrada.");
  await prisma.$transaction(async tx => {
    await tx.category.update({ where: { id }, data: { active: !category.active } });
    if (category.active) await tx.merchantRule.updateMany({ where: { categoryId: id }, data: { active: false } });
  });
  revalidatePath("/categorias");
  revalidatePath("/faturas-a-vencer");
  revalidatePath("/importar");
}

export async function createMerchantRule(formData: FormData) {
  const pattern = String(formData.get("pattern") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!pattern) throw new Error("Informe o estabelecimento ou parte dele.");
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const personId = String(formData.get("personId") ?? "").trim() || null;
  if (!categoryId && !personId) throw new Error("Escolha uma categoria ou uma pessoa para a regra.");
  await prisma.merchantRule.create({ data: { pattern, categoryId, personId, priority: Math.max(1, Number(formData.get("priority") ?? 100) || 100) } });
  revalidatePath("/categorias");
}

export async function deleteMerchantRule(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.merchantRule.delete({ where: { id } });
  revalidatePath("/categorias");
}
