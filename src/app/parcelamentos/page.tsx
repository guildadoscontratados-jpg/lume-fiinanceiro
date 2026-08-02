import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function InstallmentsPage() {
  const plans = await prisma.installmentPlan.findMany({ include: { card: true, person: true, category: true, installments: { orderBy: { sequence: "asc" } } }, orderBy: { endDate: "asc" } });
  const projected = plans.reduce((sum, plan) => sum + plan.installments.filter(item => item.status === "PROJECTED").reduce((total, item) => total + item.amountCents, 0), 0);
  return <AppShell><section className="content"><header className="page-title"><div><p className="eyebrow">COMPROMISSOS FUTUROS</p><h1>Parcelamentos</h1><p className="intro">Compras parceladas confirmadas e parcelas que ainda entrarão nas próximas faturas.</p></div><span className="empty-pill">Saldo futuro {formatCents(projected)}</span></header>{plans.length ? <div className="installment-grid">{plans.map(plan => <section className="panel installment-card" key={plan.id}><div className="panel-heading"><div><h2>{plan.description}</h2><p className="intro">{plan.card.name} · final {plan.card.lastFour} · {plan.person?.nickname || plan.person?.name || "Pessoa não atribuída"}</p></div><strong>{formatCents(plan.totalCents)}</strong></div><div className="installment-meta"><span>{plan.totalInstallments}x de {formatCents(plan.installmentCents)}</span><span>Até {plan.endDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span><span>{plan.category?.name || "Sem categoria"}</span></div><div className="installment-track">{plan.installments.map(item => <span className={`installment-dot ${item.status.toLowerCase()}`} title={`${item.sequence}/${plan.totalInstallments} · ${item.status}`} key={item.id}>{item.sequence}</span>)}</div><Link className="secondary-link" href={`/lancamentos?cardId=${plan.cardId}`}>Ver lançamentos →</Link></section>)}</div> : <section className="panel placeholder-panel"><span>↗</span><h2>Nenhum parcelamento encontrado</h2><p>Importe uma fatura com descrições como “01/10” para gerar automaticamente as parcelas futuras.</p><Link className="secondary-button" href="/importar">Importar fatura</Link></section>}</section></AppShell>;
}
