"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function createPerson(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("O nome é obrigatório.");
  await prisma.person.create({ data: { name, nickname: String(formData.get("nickname") ?? "").trim() || null, relationship: String(formData.get("relationship") ?? "").trim() || null, notes: String(formData.get("notes") ?? "").trim() || null } });
  revalidatePath("/pessoas");
  revalidatePath("/");
}

export async function updatePerson(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) throw new Error("Nome e pessoa são obrigatórios.");
  await prisma.person.update({ where: { id }, data: { name, nickname: String(formData.get("nickname") ?? "").trim() || null, relationship: String(formData.get("relationship") ?? "").trim() || null, notes: String(formData.get("notes") ?? "").trim() || null } });
  revalidatePath("/pessoas");
  revalidatePath("/faturas-a-vencer");
  revalidatePath("/lancamentos");
  redirect("/pessoas");
}

export async function togglePerson(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const person = await prisma.person.findUnique({ where: { id }, select: { status: true } });
  if (!person) throw new Error("Pessoa não encontrada.");
  await prisma.person.update({ where: { id }, data: { status: person.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } });
  revalidatePath("/pessoas");
  revalidatePath("/cartoes");
  revalidatePath("/lancamentos");
}
