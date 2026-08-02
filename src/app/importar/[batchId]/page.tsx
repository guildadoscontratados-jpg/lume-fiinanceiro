import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ImportReviewTable } from "@/components/import-review-table";
import { applyColumnMapping, confirmImport } from "../actions";
import { createCategory } from "@/app/categorias/actions";
import { prisma } from "@/lib/prisma";
import { findMerchantRule } from "@/lib/merchant-rules";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const [batch, people, categories, rules] = await Promise.all([prisma.importBatch.findUnique({ where: { id: batchId }, include: { card: true, rows: { orderBy: { sourceLine: "asc" } } } }), prisma.person.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }), prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } }), prisma.merchantRule.findMany({ where: { active: true }, orderBy: [{ priority: "asc" }, { pattern: "asc" }] })]);
  if (!batch) notFound();
  const columns = batch.rows[0] ? Object.entries(JSON.parse(batch.rows[0].rawData) as Record<string, string>) : [];
  const mapping = applyColumnMapping.bind(null, batch.id);
  const confirm = confirmImport.bind(null, batch.id);
  const rows = batch.rows.map(row => { const rule = findMerchantRule(row.description ?? "", rules); return { id: row.id, status: row.status, occurredAt: row.occurredAt?.toISOString() ?? null, description: row.description, amountCents: row.amountCents, installmentNo: row.installmentNo, installmentTotal: row.installmentTotal, suggestedCategoryId: rule?.categoryId ?? null, suggestedPersonId: rule?.personId ?? null }; });
  return <AppShell><section className="content review-content"><header className="page-title"><div><p className="eyebrow">ETAPA DE REVISÃO</p><h1>Revise a fatura</h1><p className="intro">{batch.fileName} · {batch.card.name} · {batch.rows.length} linhas encontradas</p></div><Link className="secondary-link" href="/importar">Nova importação</Link></header>{batch.status === "CONFIRMED" ? <section className="panel completion"><h2>Importação confirmada</h2><p>Este lote já foi processado em {batch.confirmedAt?.toLocaleDateString("pt-BR")}.</p><Link className="primary button-link" href="/lancamentos">Ver lançamentos</Link></section> : batch.mappingRequired ? <form action={mapping} className="panel mapping-panel"><p className="eyebrow">MAPEAMENTO MANUAL</p><h2>Indique as colunas da planilha</h2><p className="intro">Não reconheci a data automaticamente. Selecione os campos corretos para preparar a revisão.</p><div className="mapping-fields">{[["dateField", "Data"], ["descriptionField", "Descrição / estabelecimento"], ["amountField", "Valor"]].map(([name, label]) => <label key={name}>{label}<select name={name} required><option value="">Selecione uma coluna</option>{columns.map(([column, sample]) => <option key={column} value={column}>{column} — exemplo: {sample || "vazio"}</option>)}</select></label>)}</div><button className="primary" type="submit">Aplicar mapeamento</button></form> : <ImportReviewTable rows={rows} people={people} categories={categories} action={confirm} createCategoryAction={createCategory} />}</section></AppShell>;
}
