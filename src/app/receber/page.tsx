import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { allocatedAmount, monthSelection, shiftMonth } from "@/lib/receivables";
import { settleMonthlyBalance } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ mes?: string; personId?: string }> }) {
  const filters = await searchParams;
  const period = monthSelection(filters.mes);
  const people = await prisma.person.findMany({ orderBy: { name: "asc" } });
  const transactions = await prisma.transaction.findMany({
    where: { status: { not: "VOID" }, OR: [{ billingYear: period.year, billingMonth: period.month }, { billingYear: null, invoice: { referenceMonth: { gte: period.start, lt: period.end } } }, { billingYear: null, invoiceId: null, occurredAt: { gte: period.start, lt: period.end } }] },
    include: { shares: true, category: true, card: true }, orderBy: { occurredAt: "desc" },
  });
  const payments = await prisma.payment.findMany({ where: { paidAt: { gte: period.start, lt: period.end } }, include: { person: true }, orderBy: { paidAt: "desc" } });
  const projectedInstallments = await prisma.installment.findMany({ where: { billingYear: period.year, billingMonth: period.month, status: { in: ["PROJECTED", "DIVERGENT"] } }, include: { plan: { include: { person: true, category: true } } }, orderBy: { sequence: "asc" } });
  const visiblePeople = filters.personId ? people.filter(person => person.id === filters.personId) : people;
  const rows = visiblePeople.map(person => {
    const items = transactions.map(transaction => ({ transaction, amount: allocatedAmount(transaction, person.id) })).filter(item => item.amount !== 0);
    const charged = items.reduce((sum, item) => sum + item.amount, 0);
    const received = payments.filter(payment => payment.personId === person.id).reduce((sum, payment) => sum + payment.amountCents, 0);
    const projectedItems = projectedInstallments.filter(installment => installment.plan.personId === person.id);
    const projected = projectedItems.reduce((sum, item) => sum + item.amountCents, 0);
    return { person, items, charged, received, balance: charged - received, projectedItems, projected };
  }).filter(row => row.charged !== 0 || row.received !== 0 || row.projected !== 0);
  const totalCharged = rows.reduce((sum, row) => sum + row.charged, 0);
  const totalReceived = rows.reduce((sum, row) => sum + row.received, 0);
  const totalProjected = rows.reduce((sum, row) => sum + row.projected, 0);
  const monthLabel = period.start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthUrl = (value: string) => `/receber?mes=${value}${filters.personId ? `&personId=${filters.personId}` : ""}`;
  return <AppShell><section className="content"><header className="page-title"><div><p className="eyebrow">CONTAS A RECEBER</p><h1>Valores a receber</h1><p className="intro">Acompanhe despesas atribuídas, pagamentos e o saldo de cada pessoa.</p></div></header>
    <section className="month-switcher panel"><Link href={monthUrl(shiftMonth(period.selected, -1))}>‹</Link><div><span>COMPETÊNCIA</span><strong>{monthLabel}</strong><small>{rows.length} pessoa(s) com movimento</small></div><Link href={monthUrl(shiftMonth(period.selected, 1))}>›</Link></section>
    <form className="panel receivable-filter"><input type="hidden" name="mes" value={period.selected} /><label>Pessoa<select name="personId" defaultValue={filters.personId ?? ""}><option value="">Todas as pessoas</option>{people.map(person => <option key={person.id} value={person.id}>{person.nickname || person.name}</option>)}</select></label><button className="secondary-button" type="submit">Filtrar</button>{filters.personId && <Link className="secondary-link" href={`/receber?mes=${period.selected}`}>Limpar filtro</Link>}</form>
    <div className="summary-grid receivable-summary"><article className="summary-card"><p>Cobrado no mês</p><strong>{formatCents(totalCharged)}</strong><span>Despesas atribuídas</span></article><article className="summary-card"><p>Recebido no mês</p><strong>{formatCents(totalReceived)}</strong><span>Pagamentos registrados</span></article><article className="summary-card"><p>Saldo pendente</p><strong>{formatCents(totalCharged - totalReceived)}</strong><span>A receber nesta competência</span></article><article className="summary-card"><p>Previsto no mês</p><strong>{formatCents(totalProjected)}</strong><span>Parcelas futuras ainda não faturadas</span></article></div>
    <section className="panel receivable-main"><div className="panel-heading"><div><p className="eyebrow">POR PESSOA</p><h2>Fechamento mensal</h2></div></div>{rows.length ? <div className="receivable-people">{rows.map(row => <details key={row.person.id} open={Boolean(filters.personId)}><summary><span className="avatar">{row.person.name[0]}</span><div><strong>{row.person.nickname || row.person.name}</strong><small>{row.items.length} lançamento(s) · recebido {formatCents(row.received)}{row.projected > 0 ? ` · previsto ${formatCents(row.projected)}` : ""}</small></div><b className={row.balance < 0 ? "refund-value" : ""}>{row.balance > 0 ? `${formatCents(row.balance)} em aberto` : row.charged || row.received ? "Quitado" : "Sem fatura ainda"}</b></summary><div className="receivable-settle"><span>{row.balance > 0 ? `Saldo pendente de ${formatCents(row.balance)}` : row.charged || row.received ? `Pagamento de ${formatCents(row.received)} registrado nesta competência` : "Nenhuma despesa faturada ainda nesta competência"}</span>{row.balance > 0 && <form action={settleMonthlyBalance}><input type="hidden" name="personId" value={row.person.id} /><input type="hidden" name="mes" value={period.selected} /><button className="primary" type="submit">Quitar saldo do mês</button></form>}</div><div className="receivable-items">{row.items.map(({ transaction, amount }) => <article key={transaction.id}><div><strong>{transaction.description}</strong><small>{transaction.occurredAt.toLocaleDateString("pt-BR")} · {transaction.category?.name || "Sem categoria"} · {transaction.card?.name || "Sem cartão"}</small></div><b>{formatCents(amount)}</b></article>)}</div>{row.projectedItems.length > 0 && <div className="receivable-forecast"><p className="eyebrow">PREVISTO PARA {monthLabel.toUpperCase()} · AINDA NÃO FATURADO</p><div className="receivable-items">{row.projectedItems.map(installment => <article key={installment.id}><div><strong>{installment.plan.description}</strong><small>Parcela {installment.sequence}/{installment.plan.totalInstallments} · {installment.plan.category?.name || "Sem categoria"} · vence {installment.estimatedDueDate?.toLocaleDateString("pt-BR") || "a definir"}</small></div><b>{formatCents(installment.amountCents)}</b></article>)}</div></div>}</details>)}</div> : <div className="empty-state compact"><strong>Nenhum valor encontrado</strong><span>Não há despesas, pagamentos ou parcelas previstas para este filtro no mês escolhido.</span></div>}</section>
    </section></AppShell>;
}
