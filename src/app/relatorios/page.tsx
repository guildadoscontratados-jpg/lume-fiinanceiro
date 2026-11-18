import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { allocatedAmount, allocatedInstallmentAmount, monthSelection, shiftMonth } from "@/lib/receivables";
import { buildCategoryMeta, lastMonths } from "@/lib/reports";
import { CategoryBreakdownChart, CategoryMonthHeatmap, MonthlyTrendChart, PersonBreakdownChart, RankingList } from "@/components/reports-charts";
import { expenseKeyOf, expenseKindResolver } from "@/lib/expense-kind";
import { setMerchantExpenseKindFromForm } from "./actions";

export const dynamic = "force-dynamic";

function monthKeyOf(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ mes?: string; personId?: string; grupoId?: string; tipo?: string; cat?: string; catMes?: string }> }) {
  const filters = await searchParams;
  const period = monthSelection(filters.mes);
  const months = lastMonths(period.year, period.month, 12);
  const rangeStart = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
  const rangeEnd = new Date(Date.UTC(period.year, period.month, 1));

  const [categories, people, transactions, installments, expenseKinds] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, parentId: true, nature: true } }),
    prisma.person.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      where: { status: { not: "VOID" }, OR: [...months.map(m => ({ billingYear: m.year, billingMonth: m.month })), { billingYear: null, invoice: { referenceMonth: { gte: rangeStart, lt: rangeEnd } } }, { billingYear: null, invoiceId: null, occurredAt: { gte: rangeStart, lt: rangeEnd } }] },
      select: { id: true, amountCents: true, personId: true, categoryId: true, billingYear: true, billingMonth: true, occurredAt: true, description: true, merchantNormalized: true, installmentPlanId: true, shares: { select: { personId: true, percentageBps: true } }, invoice: { select: { referenceMonth: true } } },
    }),
    prisma.installment.findMany({
      where: { status: { in: ["PROJECTED", "DIVERGENT"] }, OR: months.map(m => ({ billingYear: m.year, billingMonth: m.month })) },
      select: { id: true, sequence: true, amountCents: true, billingYear: true, billingMonth: true, dueMonth: true, plan: { select: { totalInstallments: true, categoryId: true, personId: true, description: true, merchantNormalized: true, shares: { select: { personId: true, percentageBps: true } } } } },
    }),
    prisma.merchantExpenseKind.findMany({ select: { merchantKey: true, kind: true } }),
  ]);

  const categoryMeta = buildCategoryMeta(categories);
  const natureOf = (categoryId: string | null) => (categoryId ? categoryMeta.get(categoryId)?.nature : undefined) ?? "A_CLASSIFICAR";
  const rootIdOf = (categoryId: string | null) => (categoryId ? categoryMeta.get(categoryId)?.rootId : undefined) ?? null;
  const rootNameOf = (categoryId: string | null) => (categoryId ? categoryMeta.get(categoryId)?.rootName : undefined) ?? "Sem categoria";
  const leafNameOf = (categoryId: string | null) => (categoryId ? categoryMeta.get(categoryId)?.name : undefined) ?? "Sem categoria";

  const familyGroups = categories.filter(c => !c.parentId && c.nature === "DESPESA_FAMILIAR").sort((a, b) => a.name.localeCompare(b.name));
  const personFilter = filters.personId && people.some(p => p.id === filters.personId) ? filters.personId : null;
  const groupFilter = filters.grupoId && familyGroups.some(g => g.id === filters.grupoId) ? filters.grupoId : null;
  const personFilterName = personFilter ? (people.find(p => p.id === personFilter)!.nickname || people.find(p => p.id === personFilter)!.name) : null;
  const groupFilterName = groupFilter ? familyGroups.find(g => g.id === groupFilter)!.name : null;

  const txMonthKey = (t: (typeof transactions)[number]) => {
    if (t.billingYear && t.billingMonth) return monthKeyOf(t.billingYear, t.billingMonth);
    if (t.invoice?.referenceMonth) return monthKeyOf(t.invoice.referenceMonth.getUTCFullYear(), t.invoice.referenceMonth.getUTCMonth() + 1);
    return monthKeyOf(t.occurredAt.getUTCFullYear(), t.occurredAt.getUTCMonth() + 1);
  };
  const instMonthKey = (i: (typeof installments)[number]) => {
    if (i.billingYear && i.billingMonth) return monthKeyOf(i.billingYear, i.billingMonth);
    return monthKeyOf(i.dueMonth.getUTCFullYear(), i.dueMonth.getUTCMonth() + 1);
  };

  const kindOf = expenseKindResolver(expenseKinds);
  const txKind = (t: (typeof transactions)[number]) => kindOf(t.merchantNormalized, t.description);
  const instKind = (i: (typeof installments)[number]) => kindOf(i.plan.merchantNormalized, i.plan.description);
  const kindFilter = filters.tipo === "FIXA" || filters.tipo === "VARIAVEL" ? filters.tipo : null;
  const kindFilterName = kindFilter === "FIXA" ? "Despesas fixas" : kindFilter === "VARIAVEL" ? "Despesas variáveis" : null;

  const scopedTx = transactions.filter(t => natureOf(t.categoryId) === "DESPESA_FAMILIAR" && (!groupFilter || rootIdOf(t.categoryId) === groupFilter));
  const scopedInst = installments.filter(i => natureOf(i.plan.categoryId) === "DESPESA_FAMILIAR" && (!groupFilter || rootIdOf(i.plan.categoryId) === groupFilter));
  const familyTx = kindFilter ? scopedTx.filter(t => txKind(t) === kindFilter) : scopedTx;
  const familyInst = kindFilter ? scopedInst.filter(i => instKind(i) === kindFilter) : scopedInst;
  const txValue = (t: (typeof transactions)[number]) => personFilter ? allocatedAmount(t, personFilter) : t.amountCents;
  const instValue = (i: (typeof installments)[number]) => personFilter ? allocatedInstallmentAmount(i, personFilter) : i.amountCents;

  const kindSplit = { FIXA: 0, VARIAVEL: 0 };
  const fixedByMerchant = new Map<string, { label: string; valueCents: number; count: number }>();
  const fixedMonthly = new Map(months.map(m => [m.key, 0]));
  for (const t of scopedTx) {
    const kind = txKind(t);
    const monthKey = txMonthKey(t);
    if (kind === "FIXA" && fixedMonthly.has(monthKey)) fixedMonthly.set(monthKey, fixedMonthly.get(monthKey)! + txValue(t));
    if (monthKey !== period.selected) continue;
    kindSplit[kind] += txValue(t);
    if (kind === "FIXA") { const key = expenseKeyOf(t.merchantNormalized, t.description); const entry = fixedByMerchant.get(key) ?? { label: t.description, valueCents: 0, count: 0 }; entry.valueCents += txValue(t); entry.count += 1; fixedByMerchant.set(key, entry); }
  }
  for (const i of scopedInst) {
    const kind = instKind(i);
    const monthKey = instMonthKey(i);
    if (kind === "FIXA" && fixedMonthly.has(monthKey)) fixedMonthly.set(monthKey, fixedMonthly.get(monthKey)! + instValue(i));
    if (monthKey !== period.selected) continue;
    kindSplit[kind] += instValue(i);
    if (kind === "FIXA") { const key = expenseKeyOf(i.plan.merchantNormalized, i.plan.description); const entry = fixedByMerchant.get(key) ?? { label: i.plan.description, valueCents: 0, count: 0 }; entry.valueCents += instValue(i); entry.count += 1; fixedByMerchant.set(key, entry); }
  }
  const kindSplitTotal = kindSplit.FIXA + kindSplit.VARIAVEL;
  const kindPct = (value: number) => kindSplitTotal ? Math.round(value / kindSplitTotal * 1000) / 10 : 0;
  const fixedItems = [...fixedByMerchant.entries()].map(([key, entry]) => ({ key, ...entry })).sort((a, b) => b.valueCents - a.valueCents);
  const fixedMonthsWithData = [...fixedMonthly.values()].filter(value => value > 0);
  const fixedAverageCents = fixedMonthsWithData.length ? Math.round(fixedMonthsWithData.reduce((sum, value) => sum + value, 0) / fixedMonthsWithData.length) : 0;

  const monthly = new Map(months.map(m => [m.key, { confirmedCents: 0, projectedCents: 0 }]));
  for (const t of familyTx) { const bucket = monthly.get(txMonthKey(t)); if (bucket) bucket.confirmedCents += txValue(t); }
  for (const i of familyInst) { const bucket = monthly.get(instMonthKey(i)); if (bucket) bucket.projectedCents += instValue(i); }
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

  const nameOf = groupFilter ? leafNameOf : rootNameOf;
  const categoryTotals = new Map<string, number>();
  for (const t of selectedFamilyTx) categoryTotals.set(nameOf(t.categoryId), (categoryTotals.get(nameOf(t.categoryId)) ?? 0) + txValue(t));
  for (const i of selectedFamilyInst) categoryTotals.set(nameOf(i.plan.categoryId), (categoryTotals.get(nameOf(i.plan.categoryId)) ?? 0) + instValue(i));
  const sortedCategories = [...categoryTotals.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  const topCategories = sortedCategories.slice(0, 7).map(([name, valueCents], index) => ({ name, valueCents, colorIndex: index }));
  const otherCategoriesTotal = sortedCategories.slice(7).reduce((sum, [, value]) => sum + value, 0);
  const categoryItems = otherCategoriesTotal > 0 ? [...topCategories, { name: groupFilter ? "Outras subcategorias" : "Outras", valueCents: otherCategoriesTotal, colorIndex: null }] : topCategories;

  const personTotals = people.map(person => {
    const confirmed = selectedFamilyTx.reduce((sum, t) => sum + allocatedAmount(t, person.id), 0);
    const projected = selectedFamilyInst.reduce((sum, i) => sum + allocatedInstallmentAmount(i, person.id), 0);
    return { id: person.id, name: person.nickname || person.name, valueCents: confirmed + projected };
  }).filter(item => item.valueCents > 0).sort((a, b) => b.valueCents - a.valueCents);

  const merchantTotals = new Map<string, { label: string; valueCents: number; count: number }>();
  for (const t of selectedFamilyTx) {
    const key = t.merchantNormalized || t.description;
    const entry = merchantTotals.get(key) ?? { label: t.description, valueCents: 0, count: 0 };
    entry.valueCents += txValue(t); entry.count += 1; merchantTotals.set(key, entry);
  }
  for (const i of selectedFamilyInst) {
    const key = i.plan.merchantNormalized || i.plan.description;
    const entry = merchantTotals.get(key) ?? { label: i.plan.description, valueCents: 0, count: 0 };
    entry.valueCents += instValue(i); entry.count += 1; merchantTotals.set(key, entry);
  }
  const merchantRanking = [...merchantTotals.entries()].filter(([, m]) => m.valueCents > 0).sort((a, b) => b[1].valueCents - a[1].valueCents).slice(0, 10)
    .map(([key, m]) => ({ id: key, label: m.label, valueCents: m.valueCents, meta: `${m.count}x` }));

  const recentMonthKeys = new Set(months.slice(-2).map(m => m.key));
  const recurringByMerchant = new Map<string, { label: string; months: Set<string>; totalCents: number; lastMonth: string }>();
  for (const t of familyTx) {
    if (t.installmentPlanId) continue;
    const key = t.merchantNormalized || t.description;
    const monthKey = txMonthKey(t);
    const entry = recurringByMerchant.get(key) ?? { label: t.description, months: new Set<string>(), totalCents: 0, lastMonth: monthKey };
    entry.months.add(monthKey);
    entry.totalCents += txValue(t);
    if (monthKey >= entry.lastMonth) { entry.lastMonth = monthKey; entry.label = t.description; }
    recurringByMerchant.set(key, entry);
  }
  const recurringItems = [...recurringByMerchant.entries()].map(([key, entry]) => ({ key, ...entry }))
    .filter(entry => entry.months.size >= 3 && [...entry.months].some(key => recentMonthKeys.has(key)))
    .map(entry => ({ key: entry.key, name: entry.label, monthsCount: entry.months.size, avgMonthlyCents: Math.round(entry.totalCents / entry.months.size), fixed: kindOf(entry.key, entry.label) === "FIXA" }))
    .sort((a, b) => b.avgMonthlyCents - a.avgMonthlyCents);
  const recurringMonthlyTotal = recurringItems.reduce((sum, item) => sum + item.avgMonthlyCents, 0);

  const monthIndexByKey = new Map(months.map((m, index) => [m.key, index]));
  const groupKeyOf = (categoryId: string | null) => (groupFilter ? categoryId : rootIdOf(categoryId)) ?? "none";
  const heatmapRows = new Map<string, { name: string; values: number[] }>();
  const addToHeatmap = (categoryId: string | null, key: string, value: number) => {
    const index = monthIndexByKey.get(key);
    if (index === undefined) return;
    const rowKey = groupKeyOf(categoryId);
    const row = heatmapRows.get(rowKey) ?? { name: nameOf(categoryId), values: new Array(months.length).fill(0) };
    row.values[index] += value;
    heatmapRows.set(rowKey, row);
  };
  for (const t of familyTx) addToHeatmap(t.categoryId, txMonthKey(t), txValue(t));
  for (const i of familyInst) addToHeatmap(i.plan.categoryId, instMonthKey(i), instValue(i));
  const heatmapData = [...heatmapRows.entries()].map(([key, row]) => ({ key, ...row, total: row.values.reduce((sum, v) => sum + v, 0) })).filter(row => row.total > 0).sort((a, b) => b.total - a.total);

  const drillCat = filters.cat && heatmapRows.has(filters.cat) ? filters.cat : null;
  const drillMonth = drillCat && filters.catMes && monthIndexByKey.has(filters.catMes) ? filters.catMes : null;
  const personName = (id: string | null) => { const person = id ? people.find(p => p.id === id) : undefined; return person ? person.nickname || person.name : "—"; };
  const drillItems = drillCat && drillMonth ? [
    ...familyTx.filter(t => groupKeyOf(t.categoryId) === drillCat && txMonthKey(t) === drillMonth).map(t => ({ id: t.id, date: t.occurredAt.toLocaleDateString("pt-BR", { timeZone: "UTC" }), description: t.description, category: leafNameOf(t.categoryId), person: t.shares.length ? `Rateio (${t.shares.map(s => personName(s.personId)).join(", ")})` : personName(t.personId), status: "Confirmado", valueCents: txValue(t) })),
    ...familyInst.filter(i => groupKeyOf(i.plan.categoryId) === drillCat && instMonthKey(i) === drillMonth).map(i => ({ id: i.id, date: "—", description: `${i.plan.description} (${i.sequence}/${i.plan.totalInstallments})`, category: leafNameOf(i.plan.categoryId), person: i.plan.shares.length ? `Rateio (${i.plan.shares.map(s => personName(s.personId)).join(", ")})` : personName(i.plan.personId), status: "Previsto", valueCents: instValue(i) })),
  ].filter(item => item.valueCents !== 0).sort((a, b) => b.valueCents - a.valueCents) : [];
  const drillTotal = drillItems.reduce((sum, item) => sum + item.valueCents, 0);
  const drillSubtotalMap = new Map<string, { valueCents: number; count: number }>();
  for (const item of drillItems) { const entry = drillSubtotalMap.get(item.category) ?? { valueCents: 0, count: 0 }; entry.valueCents += item.valueCents; entry.count += 1; drillSubtotalMap.set(item.category, entry); }
  const drillSubtotals = [...drillSubtotalMap.entries()].map(([name, entry]) => ({ name, ...entry, pct: drillTotal ? Math.round(entry.valueCents / drillTotal * 1000) / 10 : 0 })).sort((a, b) => b.valueCents - a.valueCents);
  const drillLabel = drillMonth ? months.find(m => m.key === drillMonth)!.label : "";

  const uncategorizedTxCount = transactions.filter(t => txMonthKey(t) === selectedKey && !t.categoryId).length;
  const uncategorizedInstCount = installments.filter(i => instMonthKey(i) === selectedKey && !i.plan.categoryId).length;

  const now = new Date();
  const isCurrentRealMonth = now.getUTCFullYear() === period.year && now.getUTCMonth() + 1 === period.month;
  const daysInMonth = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  const daysElapsed = isCurrentRealMonth ? now.getUTCDate() : daysInMonth;
  const dailyAverageCents = Math.round(selectedTotals.confirmedCents / Math.max(1, daysElapsed));

  const monthLabel = period.start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthUrl = (value: string) => { const params = new URLSearchParams(); params.set("mes", value); if (personFilter) params.set("personId", personFilter); if (groupFilter) params.set("grupoId", groupFilter); if (kindFilter) params.set("tipo", kindFilter); return `/relatorios?${params.toString()}`; };
  const cellHref = (rowKey: string, monthIndex: number) => { const params = new URLSearchParams(); params.set("mes", period.selected); if (personFilter) params.set("personId", personFilter); if (groupFilter) params.set("grupoId", groupFilter); if (kindFilter) params.set("tipo", kindFilter); params.set("cat", rowKey); params.set("catMes", months[monthIndex].key); return `/relatorios?${params.toString()}#detalhe-categoria`; };
  const kindUrl = (kind: "FIXA" | "VARIAVEL") => { const params = new URLSearchParams(); params.set("mes", period.selected); if (personFilter) params.set("personId", personFilter); if (groupFilter) params.set("grupoId", groupFilter); params.set("tipo", kind); return `/relatorios?${params.toString()}`; };
  const closeDrillHref = `${monthUrl(period.selected)}#mes-a-mes`;
  const scopeLabel = [kindFilterName, personFilterName, groupFilterName].filter(Boolean).join(" · ");

  return <AppShell><section className="content"><header className="page-title"><div><p className="eyebrow">ANÁLISE FINANCEIRA</p><h1>Relatórios</h1><p className="intro">Somente despesas da família — compras para terceiros e movimentações internas ficam de fora.{scopeLabel && ` Filtrado por: ${scopeLabel}.`}</p></div></header>
    <section className="month-switcher panel"><Link href={monthUrl(shiftMonth(period.selected, -1))}>‹</Link><div><span>COMPETÊNCIA</span><strong>{monthLabel}</strong><small>Últimos 12 meses no gráfico de evolução</small></div><Link href={monthUrl(shiftMonth(period.selected, 1))}>›</Link></section>
    <form className="panel dashboard-filter"><input type="hidden" name="mes" value={period.selected} /><label>Pessoa<select name="personId" defaultValue={personFilter ?? ""}><option value="">Todas as pessoas</option>{people.map(person => <option key={person.id} value={person.id}>{person.nickname || person.name}</option>)}</select></label><label>Grupo de categoria<select name="grupoId" defaultValue={groupFilter ?? ""}><option value="">Todos os grupos</option>{familyGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label>Tipo de despesa<select name="tipo" defaultValue={kindFilter ?? ""}><option value="">Fixas e variáveis</option><option value="FIXA">Somente fixas</option><option value="VARIAVEL">Somente variáveis</option></select></label><button className="secondary-button" type="submit">Aplicar filtro</button>{(personFilter || groupFilter || kindFilter) && <Link className="secondary-link" href="/relatorios">Limpar filtros</Link>}</form>
    {(uncategorizedTxCount > 0 || uncategorizedInstCount > 0) && <p className="reports-note">
      {uncategorizedTxCount > 0 && <><strong>{uncategorizedTxCount} lançamento(s)</strong> sem categoria nesta competência não entram nos gráficos. <Link href={`/lancamentos?mes=${period.selected}&categoryId=__none__`}>Classificar agora →</Link></>}
      {uncategorizedInstCount > 0 && <>{uncategorizedTxCount > 0 ? " · " : ""}<strong>{uncategorizedInstCount} parcela(s) prevista(s)</strong> sem categoria — ajuste pela aba Faturas a vencer, editando a categoria de uma parcela já confirmada desse parcelamento com a opção &quot;todas as parcelas&quot;.</>}
    </p>}
    <div className="summary-grid">
      <article className="summary-card"><p>Gasto {scopeLabel ? "no filtro" : "da família"} no mês</p><strong>{formatCents(selectedTotalCents)}</strong><span>Confirmado + previsto</span></article>
      <article className="summary-card"><p>Variação vs. mês anterior</p><strong className={variationPct !== null && variationPct > 0 ? "refund-value" : ""}>{variationPct === null ? "—" : `${variationPct > 0 ? "+" : ""}${variationPct.toLocaleString("pt-BR")}%`}</strong><span>{previousKey ? `Base: ${formatCents(previousTotalCents)}` : "Sem mês anterior"}</span></article>
      <article className="summary-card"><p>{groupFilter ? "Maior subcategoria" : "Maior categoria"}</p><strong>{categoryItems[0]?.name ?? "—"}</strong><span>{categoryItems[0] ? formatCents(categoryItems[0].valueCents) : "Sem dados"}</span></article>
      <article className="summary-card"><p>Média diária</p><strong>{formatCents(dailyAverageCents)}</strong><span>{isCurrentRealMonth ? `Nos ${daysElapsed} dia(s) já passados` : `Ao longo de ${daysInMonth} dia(s)`}</span></article>
    </div>
    <section className="panel" id="fixas-variaveis" style={{ marginBottom: 18 }}><div className="panel-heading"><div><p className="eyebrow">FIXAS × VARIÁVEIS</p><h2>Natureza do gasto em {monthLabel}</h2></div></div>
      <div className="drill-subtotals">
        <article><span>Despesas fixas</span><strong>{formatCents(kindSplit.FIXA)}</strong><small>{kindPct(kindSplit.FIXA).toLocaleString("pt-BR")}% do mês · <Link href={kindUrl("FIXA")}>ver relatório</Link></small></article>
        <article><span>Despesas variáveis</span><strong>{formatCents(kindSplit.VARIAVEL)}</strong><small>{kindPct(kindSplit.VARIAVEL).toLocaleString("pt-BR")}% do mês · <Link href={kindUrl("VARIAVEL")}>ver relatório</Link></small></article>
        <article><span>Média mensal das fixas</span><strong>{formatCents(fixedAverageCents)}</strong><small>Nos {fixedMonthsWithData.length} mês(es) com fixas, dos últimos 12</small></article>
      </div>
      {fixedItems.length ? <div className="detail-table-wrap" style={{ marginTop: 14 }}><table className="detail-table recurring-table"><thead><tr><th>Despesa fixa</th><th>Lançamentos</th><th>Valor no mês</th><th></th></tr></thead><tbody>{fixedItems.map(item => <tr key={item.key}><td>{item.label}</td><td>{item.count}</td><td>{formatCents(item.valueCents)}</td><td><form action={setMerchantExpenseKindFromForm}><input type="hidden" name="merchantKey" value={item.key} /><input type="hidden" name="label" value={item.label} /><input type="hidden" name="kind" value="VARIAVEL" /><button className="secondary-button" type="submit">Tornar variável</button></form></td></tr>)}</tbody></table></div>
        : <p className="reports-note" style={{ marginTop: 14 }}>Nenhuma despesa marcada como fixa neste mês. Marque pela coluna <strong>Tipo</strong> no detalhe da fatura (Faturas a vencer) ou pelo botão em &quot;Assinaturas e gastos recorrentes&quot; abaixo — a marcação vale para todos os lançamentos do mesmo estabelecimento.</p>}
    </section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">EVOLUÇÃO</p><h2>Gasto {scopeLabel ? `(${scopeLabel})` : "da família"} — últimos 12 meses</h2></div></div><MonthlyTrendChart points={trendPoints} /></section>
    <div className="dashboard-grid" style={{ marginTop: 18, ...(personFilter ? { gridTemplateColumns: "1fr" } : {}) }}>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">DISTRIBUIÇÃO</p><h2>{groupFilter ? `Subcategorias de ${groupFilterName}` : "Por categoria"} em {monthLabel}</h2></div></div>{categoryItems.length ? <CategoryBreakdownChart items={categoryItems} /> : <div className="empty-state compact"><strong>Sem despesas classificadas</strong><span>Nenhum gasto nesta competência com os filtros atuais.</span></div>}</section>
      {!personFilter && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">POR PESSOA</p><h2>Quem gastou em {monthLabel}</h2></div></div>{personTotals.length ? <PersonBreakdownChart items={personTotals} /> : <div className="empty-state compact"><strong>Sem valores atribuídos</strong><span>Nenhuma pessoa com gasto nesta competência.</span></div>}</section>}
    </div>
    <div className="dashboard-grid" style={{ marginTop: 18 }}>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">ONDE O DINHEIRO FOI</p><h2>Estabelecimentos em {monthLabel}</h2></div></div>{merchantRanking.length ? <RankingList items={merchantRanking} /> : <div className="empty-state compact"><strong>Sem lançamentos</strong><span>Nenhum estabelecimento nesta competência.</span></div>}</section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">COMPROMISSOS FIXOS</p><h2>Assinaturas e gastos recorrentes</h2></div></div>
        {recurringItems.length ? <>
          <p className="reports-note"><strong>{formatCents(recurringMonthlyTotal)}/mês</strong> em compromissos fixos identificados — estimativa anual de {formatCents(recurringMonthlyTotal * 12)}.</p>
          <div className="detail-table-wrap"><table className="detail-table recurring-table"><thead><tr><th>Estabelecimento</th><th>Meses ativos</th><th>Média mensal</th><th>Tipo</th></tr></thead><tbody>{recurringItems.map(item => <tr key={item.key}><td>{item.name}</td><td>{item.monthsCount}/12</td><td>{formatCents(item.avgMonthlyCents)}</td><td>{item.fixed ? "Fixa" : <form action={setMerchantExpenseKindFromForm}><input type="hidden" name="merchantKey" value={item.key} /><input type="hidden" name="label" value={item.name} /><input type="hidden" name="kind" value="FIXA" /><button className="secondary-button" type="submit">Marcar como fixa</button></form>}</td></tr>)}</tbody></table></div>
        </> : <div className="empty-state compact"><strong>Nada identificado ainda</strong><span>Precisa de pelo menos 3 dos últimos 12 meses com o mesmo estabelecimento (fora compras parceladas).</span></div>}
      </section>
    </div>
    <section className="panel" id="mes-a-mes" style={{ marginTop: 18 }}><div className="panel-heading"><div><p className="eyebrow">SAZONALIDADE · CLIQUE NUM VALOR PARA VER OS GASTOS</p><h2>{groupFilter ? `Subcategorias de ${groupFilterName}` : "Categorias"} mês a mês</h2></div></div>{heatmapData.length ? <CategoryMonthHeatmap monthLabels={months.map(m => m.label)} rows={heatmapData} cellHref={cellHref} activeKey={drillCat} activeMonthIndex={drillMonth ? monthIndexByKey.get(drillMonth)! : null} /> : <div className="empty-state compact"><strong>Sem dados</strong><span>Nenhum gasto nos últimos 12 meses com os filtros atuais.</span></div>}</section>
    {drillCat && drillMonth && <section className="panel" id="detalhe-categoria" style={{ marginTop: 18 }}><div className="panel-heading"><div><p className="eyebrow">DETALHE · {drillLabel.toUpperCase()}</p><h2>{heatmapRows.get(drillCat)!.name} — {formatCents(drillTotal)}</h2></div><Link className="secondary-link" href={closeDrillHref}>Fechar ✕</Link></div>
      {drillSubtotals.length > 0 && <div className="drill-subtotals">{drillSubtotals.map(item => <article key={item.name}><span>{item.name}</span><strong>{formatCents(item.valueCents)}</strong><small>{item.pct.toLocaleString("pt-BR")}% · {item.count} lançamento(s)</small></article>)}</div>}
      {drillItems.length ? <div className="detail-table-wrap"><table className="drill-table"><thead><tr><th>Data</th><th>Descrição</th><th>Subcategoria</th><th>Pessoa</th><th>Situação</th><th>Valor</th></tr></thead><tbody>{drillItems.map(item => <tr key={item.id}><td>{item.date}</td><td>{item.description}</td><td>{item.category}</td><td>{item.person}</td><td>{item.status}</td><td>{formatCents(item.valueCents)}</td></tr>)}</tbody></table></div> : <div className="empty-state compact"><strong>Sem gastos</strong><span>Nenhum lançamento nesta categoria no mês escolhido.</span></div>}
    </section>}
  </section></AppShell>;
}
