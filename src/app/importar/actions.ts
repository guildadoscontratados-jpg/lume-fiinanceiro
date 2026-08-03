"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mapRawImportRow, parseStatement } from "@/lib/import-parser";
import { invoiceReferenceFromFileName } from "@/lib/invoice-period";
import { billingPeriodFromReferenceMonth, calculateFirstBillingPeriod } from "@/lib/billing-period";
import { createOrConfirmImportedTransaction } from "@/lib/installment-service";
import { prisma } from "@/lib/prisma";

function parseImportPercentage(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return 0;
  const result = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(result) || result < 0 || result > 10000) throw new Error("Os percentuais devem estar entre 0 e 100.");
  return result;
}

export async function stageImport(formData: FormData) {
  const file = formData.get("file"); const cardId = String(formData.get("cardId") ?? "");
  if (!(file instanceof File) || !file.size || !cardId) throw new Error("Selecione um cartão e um arquivo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 10 MB.");
  const format = file.name.toLowerCase().endsWith(".csv") ? "CSV" : file.name.toLowerCase().endsWith(".xlsx") ? "XLSX" : null;
  if (!format) throw new Error("Neste momento, envie um arquivo CSV ou XLSX.");
  const buffer = Buffer.from(await file.arrayBuffer()); const sourceHash = createHash("sha256").update(buffer).digest("hex");
  const existing = await prisma.importBatch.findUnique({ where: { cardId_sourceHash: { cardId, sourceHash } }, include: { rows: true } });
  const parsed = parseStatement(file.name, buffer); const rows = parsed.rows;
  const card = await prisma.card.findUnique({ where: { id: cardId }, select: { closingDay: true, dueDay: true } });
  const transactions = await prisma.transaction.findMany({ where: { cardId }, select: { id: true, amountCents: true, occurredAt: true, merchantNormalized: true } });
  const explicitDueDate = parsed.dueDate ?? null;
  const referenceMonth = explicitDueDate ? new Date(Date.UTC(explicitDueDate.getUTCFullYear(), explicitDueDate.getUTCMonth(), 1, 12)) : invoiceReferenceFromFileName(file.name);
  const billingPeriod = referenceMonth && card ? explicitDueDate ? { ...billingPeriodFromReferenceMonth(referenceMonth, card.dueDay), estimatedDueDate: explicitDueDate } : calculateFirstBillingPeriod(referenceMonth, card.closingDay, card.dueDay) : null;
  const invoice = billingPeriod ? await prisma.invoice.upsert({ where: { cardId_referenceMonth: { cardId, referenceMonth: new Date(Date.UTC(billingPeriod.billingYear, billingPeriod.billingMonth - 1, 1, 12)) } }, update: { dueDate: billingPeriod.estimatedDueDate }, create: { cardId, referenceMonth: new Date(Date.UTC(billingPeriod.billingYear, billingPeriod.billingMonth - 1, 1, 12)), dueDate: billingPeriod.estimatedDueDate } }) : null;
  if (existing) {
    if (existing.status === "REVIEW") {
      await prisma.$transaction(async tx => {
        await tx.importRow.deleteMany({ where: { batchId: existing.id } });
        await tx.importRow.createMany({ data: parsed.rows.map(row => { const merchant = row.description?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? ""; const duplicate = row.occurredAt && row.amountCents ? transactions.find(transaction => transaction.amountCents === row.amountCents && Math.abs(transaction.occurredAt.getTime() - row.occurredAt!.getTime()) <= 2 * 86400000 && transaction.merchantNormalized?.replace(/[^A-Z0-9]/g, "") === merchant) : undefined; return { ...row, batchId: existing.id, status: !row.occurredAt || !row.description || !row.amountCents ? "NEEDS_REVIEW" as const : duplicate ? "POSSIBLE_DUPLICATE" as const : "NEW" as const, duplicateOfId: duplicate?.id }; }) });
        await tx.importBatch.update({ where: { id: existing.id }, data: { mappingRequired: parsed.mappingRequired, invoiceId: invoice?.id ?? null } });
      });
    }
    redirect(`/importar/${existing.id}`);
  }
  const batch = await prisma.importBatch.create({ data: { fileName: file.name, format, sourceHash, cardId, invoiceId: invoice?.id ?? null, mappingRequired: parsed.mappingRequired, rows: { create: rows.map(row => { const merchant = row.description?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? ""; const duplicate = row.occurredAt && row.amountCents ? transactions.find(transaction => transaction.amountCents === row.amountCents && Math.abs(transaction.occurredAt.getTime() - row.occurredAt!.getTime()) <= 2 * 86400000 && transaction.merchantNormalized?.replace(/[^A-Z0-9]/g, "") === merchant) : undefined; return { ...row, status: !row.occurredAt || !row.description || !row.amountCents ? "NEEDS_REVIEW" : duplicate ? "POSSIBLE_DUPLICATE" : "NEW", duplicateOfId: duplicate?.id }; }) } } });
  redirect(`/importar/${batch.id}`);
}

export async function applyColumnMapping(batchId: string, formData: FormData) {
  const dateField = String(formData.get("dateField") ?? ""); const descriptionField = String(formData.get("descriptionField") ?? ""); const amountField = String(formData.get("amountField") ?? "");
  if (!dateField || !descriptionField || !amountField) throw new Error("Selecione as três colunas.");
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { rows: true, invoice: true } });
  if (!batch || batch.status !== "REVIEW") throw new Error("Lote não disponível.");
  const transactions = await prisma.transaction.findMany({ where: { cardId: batch.cardId }, select: { id: true, amountCents: true, occurredAt: true, merchantNormalized: true } });
  const referenceMatch = batch.fileName.match(/(20\d{2})-(\d{2})-(\d{2})/); const referenceDate = referenceMatch ? new Date(`${referenceMatch[1]}-${referenceMatch[2]}-${referenceMatch[3]}T12:00:00`) : null;
  await prisma.$transaction(batch.rows.map(row => { const mapped = mapRawImportRow(row.rawData, dateField, descriptionField, amountField, referenceDate); const merchant = mapped.description?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? ""; const duplicate = mapped.occurredAt && mapped.amountCents ? transactions.find(transaction => transaction.amountCents === mapped.amountCents && Math.abs(transaction.occurredAt.getTime() - mapped.occurredAt!.getTime()) <= 2 * 86400000 && transaction.merchantNormalized?.replace(/[^A-Z0-9]/g, "") === merchant) : undefined; return prisma.importRow.update({ where: { id: row.id }, data: { ...mapped, status: !mapped.occurredAt || !mapped.description || !mapped.amountCents ? "NEEDS_REVIEW" : duplicate ? "POSSIBLE_DUPLICATE" : "NEW", duplicateOfId: duplicate?.id } }); }));
  await prisma.importBatch.update({ where: { id: batch.id }, data: { mappingRequired: false } });
  revalidatePath(`/importar/${batchId}`);
}

export async function confirmImport(batchId: string, formData: FormData) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { rows: true, invoice: true } });
  if (!batch || batch.status !== "REVIEW") throw new Error("Este lote não está disponível para confirmação.");
  const selected = new Set(formData.getAll("selected").map(String));
  await prisma.$transaction(
    async tx => {
      for (const row of batch.rows) {
        if (!selected.has(row.id)) {
          await tx.importRow.update({
            where: { id: row.id },
            data: { status: "SKIPPED" },
          });
          continue;
        }

        const description = String(formData.get(`description-${row.id}`) ?? "").trim();
        const dateText = String(formData.get(`date-${row.id}`) ?? "");
        const amountText = String(formData.get(`amount-${row.id}`) ?? "");
        const amountCents = Math.round(Number(amountText.replace(",", ".")) * 100);

        if (!description || !dateText || !Number.isSafeInteger(amountCents) || amountCents === 0) {
          throw new Error("Revise descrição, data e valor dos lançamentos selecionados.");
        }

        const shareCount = Math.max(1, Number(formData.get(`share-count-${row.id}`) ?? 1));
        const shares = Array.from({ length: shareCount }, (_, index) => ({
          personId: String(formData.get(`share-person-${row.id}-${index}`) ?? ""),
          percentageBps: parseImportPercentage(formData.get(`share-percent-${row.id}-${index}`)),
        })).filter(share => share.personId);

        const hasPercentages = shareCount > 1;

        if (shares.length > 1 && shares.reduce((sum, share) => sum + share.percentageBps, 0) !== 10000) {
          throw new Error("A divisão entre pessoas deve totalizar exatamente 100%.");
        }

        if (shares.length === 1) shares[0].percentageBps = 10000;

        if (hasPercentages && shares.length !== shareCount) {
          throw new Error("Selecione uma pessoa em cada linha da divisão.");
        }

        const personId = shares.length === 1 ? shares[0].personId : null;
        const categoryId = String(formData.get(`category-${row.id}`) ?? "") || null;

        const transaction = await createOrConfirmImportedTransaction(tx, {
          cardId: batch.cardId,
          invoiceId: batch.invoiceId,
          invoiceMonth: batch.invoice?.referenceMonth ?? null,
          description,
          occurredAt: new Date(`${dateText}T12:00:00`),
          amountCents,
          installmentNo: row.installmentNo,
          installmentTotal: row.installmentTotal,
          personId,
          categoryId,
          shares,
          notes: `Importado de ${batch.fileName}, linha ${row.sourceLine}`,
        });

        await tx.importRow.update({
          where: { id: row.id },
          data: {
            status: "IMPORTED",
            transactionId: transaction.id,
            description,
            occurredAt: transaction.occurredAt,
            amountCents,
          },
        });
      }

      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      });
    },
    {
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
  if (batch.invoiceId) { const totals = await prisma.transaction.aggregate({ where: { invoiceId: batch.invoiceId, status: { not: "VOID" } }, _sum: { amountCents: true } }); await prisma.invoice.update({ where: { id: batch.invoiceId }, data: { totalCents: totals._sum.amountCents ?? 0 } }); }
  revalidatePath("/"); revalidatePath("/faturas"); revalidatePath("/lancamentos"); revalidatePath("/parcelamentos"); revalidatePath(`/importar/${batchId}`); redirect("/");
}
