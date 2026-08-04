import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DueInvoiceEditor } from "@/components/due-invoice-editor";
import { QuickCategoryForm } from "@/components/quick-category-form";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { bulkClassifyDueItems, createDueCategory, updateDueItemField, updateDueItemShares, updateProjectedDueDate } from "./actions";

export const dynamic = "force-dynamic";

export default async function DueInvoiceDetailPage({ params, searchParams }: { params: Promise<{ cardId: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { cardId } = await params;
  const filters = await searchParams;
  const now = new Date();
  const selected = filters.mes?.match(/^\d{4}-\d{2}$/) ? filters.mes : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, month] = selected.split("-").map(Number);
  const [card, transactions, installments, people, categories] = await Promise.all([
    prisma.card.findUnique({ where: { id: cardId }, include: { bank: true } }),
    prisma.transaction.findMany({ where: { cardId, billingYear: year, billingMonth: month, status: { not: "VOID" } }, include: { person: true, category: true, installment: true, installmentPlan: true, shares: { include: { person: true } } }, orderBy: { occurredAt: "asc" } }),
    prisma.installment.findMany({ where: { plan: { cardId }, billingYear: year, billingMonth: month, status: { in: ["PROJECTED", "DIVERGENT"] } }, include: { plan: { include: { person: true, category: true } } }, orderBy: { sequence: "asc" } }),
    prisma.person.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { active: true, parentId: { not: null } }, select: { id: true, name: true, parent: { select: { name: true } } }, orderBy: [{ parent: { name: "asc" } }, { name: "asc" }] }),
  ]);
  const categoryGroups = await prisma.category.findMany({ where: { active: true, parentId: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  if (!card) notFound();
  const confirmedTotal = transactions.reduce((sum, item) => sum + item.amountCents, 0);
  const projectedTotal = installments.reduce((sum, item) => sum + item.amountCents, 0);
  const monthLabel = new Date(Date.UTC(year, month - 1, 1, 12)).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const shiftMonth = (offset: number) => { const date = new Date(Date.UTC(year, month - 1 + offset, 1, 12)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; };
  const classify = bulkClassifyDueItems.bind(null, cardId);
  const createCategory = createDueCategory.bind(null, cardId);
  const updateShares = updateDueItemShares.bind(null, cardId);
  const updateItem = updateDueItemField.bind(null, cardId);
  const updateProjected = updateProjectedDueDate.bind(null, cardId);
  const rows = transactions.map(item => ({ id: item.id, date: item.occurredAt.toLocaleDateString("pt-BR"), description: item.description, personLabel: item.shares.length ? item.shares.map(share => `${share.person.nickname || share.person.name} ${share.percentageBps / 100}%`).join(" · ") : item.person?.nickname || item.person?.name || "Revisão necessária", personId: item.personId, shares: item.shares.map(share => ({ personId: share.personId, percentage: share.percentageBps / 100 })), categoryId: item.categoryId, categoryLabel: item.category?.name || "Sem categoria", installmentLabel: item.installment && item.installmentPlan ? `${item.installment.sequence}/${item.installmentPlan.totalInstallments}` : "À vista", hasInstallment: Boolean(item.installmentPlanId), amountLabel: formatCents(item.amountCents), refund: item.amountCents < 0, dueDate: item.estimatedDueDate?.toISOString().slice(0, 10) || "", dueLabel: item.estimatedDueDate?.toLocaleDateString("pt-BR") || "—" }));
  const projectedRows = installments.map(item => ({ id: item.id, date: item.purchaseDate?.toLocaleDateString("pt-BR") || "—", description: item.plan.description, personLabel: item.plan.person?.nickname || item.plan.person?.name || "Revisão necessária", categoryLabel: item.plan.category?.name || "Sem categoria", installmentLabel: `${item.sequence}/${item.plan.totalInstallments}`, amountLabel: formatCents(item.amountCents), dueDate: item.estimatedDueDate?.toISOString().slice(0, 10) || "", dueLabel: item.estimatedDueDate?.toLocaleDateString("pt-BR") || "—", status: item.status }));

  return <AppShell><section className="content"><header className="page-title"><div><p className="eyebrow">DETALHAMENTO DA COMPETÊNCIA</p><h1>{card.name}</h1><p className="intro">{card.bank.name} · final {card.lastFour}</p></div><Link className="secondary-link" href={`/faturas-a-vencer?mes=${selected}`}>← Voltar para faturas</Link></header><section className="month-switcher panel"><Link href={`/faturas-a-vencer/${cardId}?mes=${shiftMonth(-1)}`} aria-label="Mês anterior">‹</Link><div><span>COMPETÊNCIA</span><strong>{monthLabel}</strong><small>{transactions.length + installments.length} item(ns) · {formatCents(confirmedTotal + projectedTotal)}</small></div><Link href={`/faturas-a-vencer/${cardId}?mes=${shiftMonth(1)}`} aria-label="Próximo mês">›</Link></section><section className="summary-grid"><article className="summary-card"><p>Total da competência</p><strong>{formatCents(confirmedTotal + projectedTotal)}</strong><span>Confirmado + previsto</span></article><article className="summary-card"><p>Confirmado</p><strong>{formatCents(confirmedTotal)}</strong><span>{transactions.length} lançamento(s)</span></article><article className="summary-card"><p>Previsto</p><strong>{formatCents(projectedTotal)}</strong><span>{installments.length} parcela(s)</span></article></section><QuickCategoryForm action={createCategory} groups={categoryGroups} /><DueInvoiceEditor title={monthLabel} rows={rows} projected={projectedRows} people={people} categories={categories} bulkAction={classify} shareAction={updateShares} itemAction={updateItem} projectedAction={updateProjected} /></section></AppShell>;
}
