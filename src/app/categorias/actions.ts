"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isCategoryNature } from "@/lib/category-nature";

export async function resolveCategoryNature(parentId: string | null, requested: string) {
  if (isCategoryNature(requested)) return requested;
  if (!parentId) return "A_CLASSIFICAR" as const;
  const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { nature: true } });
  return parent?.nature ?? ("A_CLASSIFICAR" as const);
}

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("O nome é obrigatório.");
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const nature = await resolveCategoryNature(parentId, String(formData.get("nature") ?? ""));
  await prisma.category.create({ data: { name, parentId, nature, color: String(formData.get("color") ?? "").trim() || null } });
  revalidatePath("/categorias");
}

export async function updateCategoryNature(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const nature = String(formData.get("nature") ?? "");
  if (!isCategoryNature(nature)) throw new Error("Natureza inválida.");
  const scope = String(formData.get("scope") ?? "ONLY_THIS");
  const category = await prisma.category.findUnique({ where: { id }, select: { parentId: true } });
  if (!category) throw new Error("Categoria não encontrada.");
  if (scope === "GROUP") {
    const groupId = category.parentId ?? id;
    await prisma.category.updateMany({ where: { OR: [{ id: groupId }, { parentId: groupId }] }, data: { nature } });
  } else {
    await prisma.category.update({ where: { id }, data: { nature } });
  }
  revalidatePath("/categorias");
  revalidatePath("/faturas-a-vencer");
  revalidatePath("/lancamentos");
  revalidatePath("/receber");
  revalidatePath("/");
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

export async function createAutomationRule(pattern: string, categoryId: string) {
  const normalized = pattern.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized || !categoryId) return;
  const existing = await prisma.merchantRule.findFirst({ where: { pattern: normalized, active: true } });
  if (existing) return;
  await prisma.merchantRule.create({ data: { pattern: normalized, categoryId, priority: 100 } });
  revalidatePath("/categorias");
  revalidatePath("/faturas-a-vencer");
  revalidatePath("/importar");
}

export async function deleteMerchantRule(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.merchantRule.delete({ where: { id } });
  revalidatePath("/categorias");
}
