import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { createCard, updateCard } from "./actions";

export const dynamic = "force-dynamic";

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  const filters = await searchParams;
  const [people, cards] = await Promise.all([
    prisma.person.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.card.findMany({ include: { bank: true, holder: true }, orderBy: { name: "asc" } }),
  ]);
  const editing = filters.editar ? cards.find(card => card.id === filters.editar) : null;

  return <AppShell><section className="content">
    <header className="page-title"><div><p className="eyebrow">CADASTRO</p><h1>Cartões</h1><p className="intro">Acompanhe vencimento, limite e titular de cada cartão.</p></div></header>
    <div className="page-grid">
      {editing ? <form action={updateCard} className="panel form-panel">
        <input type="hidden" name="id" value={editing.id} />
        <h2>Editar cartão</h2>
        <label>Nome do cartão<input name="name" required defaultValue={editing.name} /></label>
        <div className="form-row">
          <label>Dia de fechamento<input name="closingDay" type="number" min="1" max="31" required defaultValue={editing.closingDay} /></label>
          <label>Dia de vencimento<input name="dueDay" type="number" min="1" max="31" required defaultValue={editing.dueDay} /></label>
        </div>
        <label>Limite<input name="limit" inputMode="decimal" defaultValue={editing.limitCents === null ? "" : (editing.limitCents / 100).toFixed(2).replace(".", ",")} placeholder="Sem limite" /></label>
        <p className="form-help">A mudança do fechamento será usada nos próximos cálculos. Lançamentos já confirmados não terão a competência alterada automaticamente.</p>
        <div className="button-row"><button className="primary" type="submit">Salvar alterações</button><Link className="secondary-button" href="/cartoes">Cancelar</Link></div>
      </form> : <form action={createCard} className="panel form-panel">
        <h2>Novo cartão</h2>
        <label>Nome do cartão<input name="name" required placeholder="Ex.: Nubank" /></label>
        <label>Banco<input name="bank" required placeholder="Ex.: Nubank" /></label>
        <label>Titular<select name="holderId" required><option value="">Selecione uma pessoa</option>{people.map(person => <option key={person.id} value={person.id}>{person.nickname || person.name}</option>)}</select></label>
        <div className="form-row"><label>Final<input name="lastFour" inputMode="numeric" maxLength={4} required placeholder="1234" /></label><label>Bandeira<input name="brand" placeholder="Visa" /></label></div>
        <div className="form-row"><label>Fechamento<input name="closingDay" type="number" min="1" max="31" required /></label><label>Vencimento<input name="dueDay" type="number" min="1" max="31" required /></label></div>
        <label>Limite<input name="limit" inputMode="decimal" placeholder="Ex.: 5000,00" /></label>
        <label>Cor<input name="color" type="color" defaultValue="#157a65" /></label>
        <button className="primary" type="submit">Salvar cartão</button>
      </form>}
      <section className="panel list-panel"><div className="panel-heading"><div><p className="eyebrow">{cards.length} CADASTRADO{cards.length === 1 ? "" : "S"}</p><h2>Seus cartões</h2></div></div>
        {cards.length ? <div className="card-list">{cards.map(card => <article key={card.id} style={{ borderLeftColor: card.color || "#157a65" }}><div><strong>{card.name} · {card.lastFour}</strong><p>{card.bank.name} · {card.holder.nickname || card.holder.name}</p></div><div className="card-meta"><span>Fecha dia {card.closingDay} · vence dia {card.dueDay}</span><b>{card.limitCents ? formatCents(card.limitCents) : "Sem limite"}</b><Link className="card-edit-link" href={`/cartoes?editar=${card.id}`}>Editar</Link></div></article>)}</div> : <div className="empty-state">Cadastre uma pessoa antes de criar seu primeiro cartão.</div>}
      </section>
    </div>
  </section></AppShell>;
}
