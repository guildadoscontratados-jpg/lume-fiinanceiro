import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  const received = Buffer.from(header.slice(6), "base64");
  const expected = Buffer.from(`${process.env.LOGIN_USER ?? ""}:${process.env.LOGIN_PASSWORD ?? ""}`);
  return Boolean(process.env.LOGIN_USER && process.env.LOGIN_PASSWORD) && received.length === expected.length && timingSafeEqual(received, expected);
}

async function target() {
  const categories = await prisma.category.findMany({ where: { name: { equals: "Transporte", mode: "insensitive" } }, select: { id: true, name: true } });
  if (categories.length !== 1) throw new Error(`Esperado exatamente 1 categoria Transporte; encontradas: ${categories.length}.`);
  return categories[0];
}

async function usage(categoryId: string) {
  const [transactions, installmentPlans, merchantRules, children] = await Promise.all([
    prisma.transaction.count({ where: { categoryId } }),
    prisma.installmentPlan.count({ where: { categoryId } }),
    prisma.merchantRule.count({ where: { categoryId } }),
    prisma.category.count({ where: { parentId: categoryId } }),
  ]);
  return { transactions, installmentPlans, merchantRules, children };
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try { const category = await target(); return Response.json({ category, usage: await usage(category.id) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha na verificação." }, { status: 409 }); }
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const category = await target();
    const before = await usage(category.id);
    await prisma.$transaction(async tx => {
      await tx.transaction.updateMany({ where: { categoryId: category.id }, data: { categoryId: null } });
      await tx.installmentPlan.updateMany({ where: { categoryId: category.id }, data: { categoryId: null } });
      await tx.merchantRule.updateMany({ where: { categoryId: category.id }, data: { categoryId: null, active: false } });
      await tx.category.updateMany({ where: { parentId: category.id }, data: { parentId: null } });
      await tx.category.delete({ where: { id: category.id } });
    });
    return Response.json({ removed: category, affected: before });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha na exclusão." }, { status: 409 }); }
}
