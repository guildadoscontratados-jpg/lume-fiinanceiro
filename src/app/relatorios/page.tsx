import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { allocatedAmount, allocatedInstallmentAmount, monthSelection, shiftMonth } from "@/lib/receivables";
import { buildCategoryMeta, lastMonths } from "@/lib/reports";
import { CategoryBreakdownChart, MonthlyTrendChart, PersonBreakdownChart } from "@/components/reports-charts";

export const dynamic = "force-dynamic";

function monthKeyOf(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const filters = await searchParams;
  const period = monthSelection(filters.mes);
  const months = lastMonths(period.year, period.month, 12);
  const rangeStart = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
  const rangeEnd = new Date(Date.UTC(period.year, period.month, 1));

  const [categories, people, transactions, installments] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, parentId: true, nature: true } }),
    prisma.person.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      where: { status: { not: "VOID" }, OR: [...months.map(m => ({ billingYear: m.year, billingMonth: m.month })), { billingYear: null, invoice: { referenceMonth: { gte: rangeStart, lt: rangeEnd } } }, { billingYear: null, invoiceId: null, occurredAt: { gte: rangeStart, lt: rangeEnd } }] },
      select: { amountCents: true, personId: true, categoryId: true, billingYear: true, billingMonth: true, occurredAt: true, shares: { select: { personId: true, percentageBps: true } }, invoice: { select: { referenceMonth: true } } },
    }),
    prisma.installment.findMany({
      where: { status: { in: ["PROJECTED", "DIVERGENT"] }, OR: months.map(m => ({ billingYear: m.year, billingMonth: m.month })) },
      select: { amountCents: true, billingYear: true, billingMonth: true, dueMonth: true, plan: { select: { categoryId: true, personId: true, shares: { select: { personId: true, percentageBps: true } } } } },
    }),
  ]);

  const categoryMeta = buildCategoryMeta(categories);
  const natureOf = (categoryId: string | null) => (categoryId ? categoryMeta.get(categoryId)?.nature : undefined) ?? "A_CLASSIFICAR";
  const rootNameOf = (categoryId: string | null) => (categoryId ? categoryMeta.get(categoryId)?.rootName : undefined) ?? "Sem categoria";

  const txMonthKey = (t: (typeof transactions)[number]) => {
    if (t.billingYear && t.billingMonth) return monthKeyOf(t.billingYear, t.billingMonth);
    if (t.invoice?.referenceMonth) return monthKeyOf(t.invoice.referenceMonth.getUTCFullYear(), t.invoice.referenceMonth.getUTCMonth() + 1);
    return monthKeyOf(t.occurredAt.getUTCFullYear(), t.occurredAt.getUTCMonth() + 1);
  };
  const instMonthKey = (i: (typeof installments)[number]) => {
    if (i.billingYear && i.billingMonth) return monthKeyOf(i.billingYear, i.billingMonth);
    return monthKeyOf(i.dueMonth.getUTCFullYear(), i.dueMonth.getUTCMonth() + 1);
  };

  const familyTx = transactions.filter(t => natureOf(t.categoryId) === "DESPESA_FAMILIAR");
  const familyInst = installments.filter(i => natureOf(i.plan.categoryId) === "DESPESA_FAMILIAR");

  const monthly = new Map(months.map(m => [m.key, { confirmedCents: 0, projectedCents: 0 }]));
  for (const t of familyTx) { const bucket = monthly.get(txMonthKey(t)); if (bucket) bucket.confirmedCents += t.amountCents; }
  for (const i of familyInst) { const bucket = monthly.get(instMonthKey(i)); if (bucket) bucket.projectedCents += i.amountCents; }
  const trendPoints = months.map(m => ({ key: m.key, label: m.label, ...monthly.get(m.key)! }));

  const selectedKey = period.selected;
  const previousKey = months[months.length - 2]?.key;
  const selectedTotals = monthly.get(selectedKey)!;
  const previousTotals = previousKey ? monthly.get(previousKey) : undefined;
  const selectedTotalCents = selectedTotals.confirmedCents + selectedTotals.projectedCents;
  const previousTotalCents = previousTotals ? previousTotals.confirmedCents + previousTotals.projectedCents : 0;
  const variationPct = previousTotalCents > 0 ? Math.round((selectedTotalCents - previousTotalCents) / previousTotalCents * 1000) / 10 : null;

  const selectedFamilyTx = familyTx.filter(t => txMonthKey(t) === selectedKey);
  const selectedFamilyInst = familyInst.filter(i => instMonthKey(i) === selectedKey);

  const categoryTotals = new Map<string, number>();
  for (const t of selectedFamilyTx) categoryTotals.set(rootNameOf(t.categoryId), (categoryTotals.get(rootNameOf(t.categoryId)) ?? 0) + t.amountCents);
  for (const i of selectedFamilyInst) categoryTotals.set(rootNameOf(i.plan.categoryId), (categoryTotals.get(rootNameOf(i.plan.categoryId)) ?? 0) + i.amountCents);
  const sortedCategories = [...categoryTotals.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  const topCategories = sortedCategories.slice(0, 7).map(([name, valueCents], index) => ({ name, valueCents, colorIndex: index }));
  const otherCategoriesTotal = sortedCategories.slice(7).reduce((sum, [, value]) => sum + value, 0);
  const categoryItems = otherCategoriesTotal > 0 ? [...topCategories, { name: "Outras", valueCents: otherCategoriesTotal, colorIndex: null }] : topCategories;

  const personTotals = people.map(person => {
    const confirmed = selectedFamilyTx.reduce((sum, t) => sum + allocatedAmount(t, person.id), 0);
    const projected = selectedFamilyInst.reduce((sum, i) => sum + allocatedInstallmentAmount(i, person.id), 0);
    return { id: person.id, name: person.nickname || person.name, valueCents: confirmed + projected };
  }).filter(item => item.valueCents > 0).sort((a, b) => b.valueCents - a.valueCents);

  const uncategorizedTx = transactions.filter(t => txMonthKey(t) === selectedKey && !t.categoryId).length + installments.filter(i => instMonthKey(i) === selectedKey && !i.plan.categoryId).length;

  const now = new Date();
  const isCurrentRealMonth = now.getUTCFullYear() === period.year && now.getUTCMonth() + 1 === period.month;
  const daysInMonth = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  const daysElapsed = isCurrentRealMonth ? now.getUTCDate() : daysInMonth;
  const dailyAverageCents = Math.round(selectedTotals.confirmedCents / Math.max(1, daysElapsed));

  const monthLabel = period.start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthUrl = (value: string) => `/relatorios?mes=${value}`;

  return <AppShell><section className="content"><header className="page-title"><div><p className="eyebrow">ANÁLISE FINANCEIRA</p><h1>Relatórios</h1><p className="intro">Somente despesas da família — compras para terceiros e movimentações internas ficam de fora.</p></div></header>
    <section className="month-switcher panel"><Link href={monthUrl(shiftMonth(period.selected, -1))}>‹</Link><div><span>COMPETÊNCIA</span><strong>{monthLabel}</strong><small>Últimos 12 meses no gráfico de evolução</small></div><Link href={monthUrl(shiftMonth(period.selected, 1))}>›</Link></section>
    {uncategorizedTx > 0 && <p className="reports-note"><strong>{uncategorizedTx} lançamento(s)</strong> sem categoria nesta competência não entram nos gráficos abaixo. <Link href={`/lancamentos?mes=${period.selected}`}>Classificar agora →</Link></p>}
    <div className="summary-grid">
      <article className="summary-card"><p>Gasto da família no mês</p><strong>{formatCents(selectedTotalCents)}</strong><span>Confirmado + previsto</span></article>
      <article className="summary-card"><p>Variação vs. mês anterior</p><strong className={variationPct !== null && variationPct > 0 ? "refund-value" : ""}>{variationPct === null ? "—" : `${variationPct > 0 ? "+" : ""}${variationPct.toLocaleString("pt-BR")}%`}</strong><span>{previousKey ? `Base: ${formatCents(previousTotalCents)}` : "Sem mês anterior"}</span></article>
      <article className="summary-card"><p>Maior categoria</p><strong>{categoryItems[0]?.name ?? "—"}</strong><span>{categoryItems[0] ? formatCents(categoryItems[0].valueCents) : "Sem dados"}</span></article>
      <article className="summary-card"><p>Média diária</p><strong>{formatCents(dailyAverageCents)}</strong><span>{isCurrentRealMonth ? `Nos ${daysElapsed} dia(s) já passados` : `Ao longo de ${daysInMonth} dia(s)`}</span></article>
    </div>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">EVOLUÇÃO</p><h2>Gasto da família — últimos 12 meses</h2></div></div><MonthlyTrendChart points={trendPoints} /></section>
    <div className="dashboard-grid" style={{ marginTop: 18 }}>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">DISTRIBUIÇÃO</p><h2>Por categoria em {monthLabel}</h2></div></div>{categoryItems.length ? <CategoryBreakdownChart items={categoryItems} /> : <div className="empty-state compact"><strong>Sem despesas classificadas</strong><span>Nenhum gasto de família nesta competência.</span></div>}</section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">POR PESSOA</p><h2>Quem gastou em {monthLabel}</h2></div></div>{personTotals.length ? <PersonBreakdownChart items={personTotals} /> : <div className="empty-state compact"><strong>Sem valores atribuídos</strong><span>Nenhuma pessoa com gasto nesta competência.</span></div>}</section>
    </div>
  </section></AppShell>;
}
