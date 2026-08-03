import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const expected = `${process.env.LOGIN_USER ?? ""}:${process.env.LOGIN_PASSWORD ?? ""}`;
  const left = Buffer.from(decoded);
  const right = Buffer.from(expected);
  return Boolean(process.env.LOGIN_USER && process.env.LOGIN_PASSWORD) && left.length === right.length && timingSafeEqual(left, right);
}

async function targetCard() {
  const cards = await prisma.card.findMany({
    where: {
      bank: { name: { contains: "Sicredi", mode: "insensitive" } },
      OR: [
        { name: { contains: "MC", mode: "insensitive" } },
        { name: { contains: "Master", mode: "insensitive" } },
        { brand: { contains: "Master", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, brand: true, lastFour: true, bank: { select: { name: true } } },
  });
  if (cards.length !== 1) throw new Error(`Esperado exatamente 1 cartão Sicredi MC; encontrados: ${cards.length}.`);
  return cards[0];
}

async function counts(cardId: string) {
  const [transactions, imports, invoices, installmentPlans, statements] = await Promise.all([
    prisma.transaction.count({ where: { cardId } }),
    prisma.importBatch.count({ where: { cardId } }),
    prisma.invoice.count({ where: { cardId } }),
    prisma.installmentPlan.count({ where: { cardId } }),
    prisma.statement.count({ where: { cardId } }),
  ]);
  return { transactions, imports, invoices, installmentPlans, statements };
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const card = await targetCard();
    return Response.json({ card, counts: await counts(card.id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha na verificação." }, { status: 409 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const card = await targetCard();
    const before = await counts(card.id);
    await prisma.$transaction(async tx => {
      await tx.importRow.deleteMany({ where: { batch: { cardId: card.id } } });
      await tx.installment.updateMany({ where: { plan: { cardId: card.id } }, data: { transactionId: null } });
      await tx.transaction.deleteMany({ where: { cardId: card.id } });
      await tx.installment.deleteMany({ where: { plan: { cardId: card.id } } });
      await tx.installmentPlan.deleteMany({ where: { cardId: card.id } });
      await tx.importBatch.deleteMany({ where: { cardId: card.id } });
      await tx.invoice.deleteMany({ where: { cardId: card.id } });
      await tx.statement.deleteMany({ where: { cardId: card.id } });
    });
    return Response.json({ card, removed: before, remaining: await counts(card.id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha na limpeza." }, { status: 409 });
  }
}
