import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/prisma";
import { stageImport } from "./actions";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const cards = await prisma.card.findMany({ include: { bank: true }, orderBy: { name: "asc" } });
  return <AppShell><section className="content"><header className="page-title"><div><p className="eyebrow">IMPORTAÇÃO ASSISTIDA</p><h1>Importar fatura</h1><p className="intro">Envie uma planilha e revise cada lançamento antes de gravá-lo no financeiro.</p></div></header><div className="page-grid"><form action={stageImport} className="panel form-panel"><h2>Enviar arquivo</h2><label>Cartão da fatura<select name="cardId" required><option value="">Selecione o cartão</option>{cards.map(card => <option key={card.id} value={card.id}>{card.name} · {card.lastFour} ({card.bank.name})</option>)}</select></label><label>Arquivo CSV ou XLSX<input name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></label><p className="form-help">Tamanho máximo: 10 MB. O arquivo não é confirmado sem a sua revisão.</p><button className="primary" type="submit">Preparar revisão</button></form><section className="panel import-guide"><p className="eyebrow">FORMATO RECONHECIDO</p><h2>O que buscamos</h2><ul><li>Data do lançamento</li><li>Descrição ou estabelecimento</li><li>Valor</li></ul><p>As colunas podem se chamar, por exemplo, <strong>Data</strong>, <strong>Descrição</strong> e <strong>Valor</strong>. Linhas incompletas ficam marcadas para revisão.</p></section></div></section></AppShell>;
}
