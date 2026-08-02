import { AppShell } from "@/components/app-shell";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ForecastsPage() {
  const items = await prisma.installment.findMany({ where: { status: "PROJECTED" }, include: { plan: { include: { card: true, person: true, category: true } } }, orderBy: { dueMonth: "asc" } });
  const groups = new Map<string, { month: Date; total: number; cards: Map<string, { name: string; total: number }> }>();
  for (const item of items) { const key = item.dueMonth.toISOString().slice(0, 7); const group = groups.get(key) ?? { month: item.dueMonth, total: 0, cards: new Map() }; group.total += item.amountCents; const card = group.cards.get(item.plan.cardId) ?? { name: item.plan.card.name, total: 0 }; card.total += item.amountCents; group.cards.set(item.plan.cardId, card); groups.set(key, group); }
  return <AppShell><section className="content"><header className="page-title"><div><p className="eyebrow">COMPROMETIMENTO FUTURO</p><h1>Previsões</h1><p className="intro">Parcelas futuras criadas a partir das compras parceladas confirmadas.</p></div></header>{groups.size ? <div className="forecast-list">{Array.from(groups.values()).map(group => <section className="panel forecast-month" key={group.month.toISOString()}><div className="panel-heading"><div><p className="eyebrow">{group.month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).toUpperCase()}</p><h2>{formatCents(group.total)}</h2></div><span className="empty-pill">{group.cards.size} cartão{group.cards.size === 1 ? "" : "ões"}</span></div><div className="forecast-cards">{Array.from(group.cards.entries()).map(([cardId, card]) => <article key={cardId}><span className="color-dot" /><div><strong>{card.name}</strong><p>Parcelas previstas</p></div><b>{formatCents(card.total)}</b></article>)}</div></section>)}</div> : <section className="panel placeholder-panel"><span>◷</span><h2>Nenhuma previsão ainda</h2><p>Ao confirmar uma compra parcelada, as parcelas futuras aparecerão aqui automaticamente.</p></section>}</section></AppShell>;
}
