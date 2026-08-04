import { AppShell } from "@/components/app-shell";
import { CategoryOptions } from "@/components/category-options";
import { prisma } from "@/lib/prisma";
import { createCategory, createMerchantRule, deleteMerchantRule, toggleCategory } from "./actions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const filters = await searchParams;
  const query = filters.q?.trim() ?? "";
  const status = ["active", "inactive", "all"].includes(filters.status ?? "") ? filters.status! : "active";
  const where = { ...(query ? { name: { contains: query } } : {}), ...(status === "all" ? {} : { active: status === "active" }) };
  const [categories, activeCategories, people, rules] = await Promise.all([
    prisma.category.findMany({ where, include: { parent: true, children: true, _count: { select: { transactions: true, installmentPlans: true } } }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.person.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.merchantRule.findMany({ include: { category: true, person: true }, orderBy: [{ priority: "asc" }, { pattern: "asc" }] }),
  ]);
  const roots = activeCategories.filter(category => !category.parentId);
  const rootNameById = new Map(roots.map(root => [root.id, root.name]));
  const ruleCategories = activeCategories.filter(category => category.parentId).map(category => ({ id: category.id, name: category.name, parent: rootNameById.has(category.parentId!) ? { name: rootNameById.get(category.parentId!)! } : null }));

  const roots_ = categories.filter(category => !category.parentId);
  const children = categories.filter(category => category.parentId);
  const groupKeys = new Set([...roots_.map(category => category.id), ...children.map(category => category.parentId!)]);
  const groups = [...groupKeys].map(groupId => {
    const rootMatch = roots_.find(category => category.id === groupId);
    const childParent = children.find(category => category.parentId === groupId)?.parent;
    const header = rootMatch ?? childParent!;
    const items = children.filter(category => category.parentId === groupId);
    return { header, matchedDirectly: Boolean(rootMatch), items, subcount: rootMatch ? rootMatch.children.length : items.length };
  }).sort((a, b) => a.header.name.localeCompare(b.header.name));

  return <AppShell><section className="content"><header className="page-title"><div><p className="eyebrow">ORGANIZAÇÃO</p><h1>Categorias</h1><p className="intro">Grupos e subcategorias usados nos lançamentos. Um lançamento sempre usa uma subcategoria — o grupo é só organização.</p></div></header><div className="page-grid"><form action={createCategory} className="panel form-panel"><h2>Nova categoria</h2><label>Nome<input name="name" required placeholder="Ex.: Alimentação" /></label><label>Categoria pai<select name="parentId"><option value="">Categoria principal (novo grupo)</option>{roots.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Cor de identificação<input name="color" type="color" defaultValue="#157a65" /></label><button className="primary" type="submit">Salvar categoria</button></form><section className="panel list-panel"><div className="panel-heading"><div><p className="eyebrow">CONSULTA</p><h2>Categorias cadastradas</h2></div><span className="empty-pill">{categories.length}</span></div><form className="category-filters"><input name="q" defaultValue={query} placeholder="Buscar categoria..." /><select name="status" defaultValue={status}><option value="active">Ativas</option><option value="inactive">Inativas</option><option value="all">Todas</option></select><button className="secondary-button" type="submit">Filtrar</button></form>{groups.length ? <div className="category-tree">{groups.map(group => <div className="category-group" key={group.header.id}><article className={`category-group-header ${group.header.active ? "" : "inactive-category"}`}><span className="color-dot" style={{ background: group.header.color || "#157a65" }} /><div><strong>{group.header.name}</strong><p>Grupo · {group.subcount} subcategoria(s){!group.matchedDirectly && " · fora do filtro"}</p></div><span className={`status ${group.header.active ? "" : "inactive"}`}>{group.header.active ? "Ativa" : "Inativa"}</span>{group.matchedDirectly && <form action={toggleCategory}><input type="hidden" name="id" value={group.header.id} /><button className="category-toggle" type="submit">{group.header.active ? "Inativar" : "Ativar"}</button></form>}</article>{group.items.map(category => <article key={category.id} className={`category-subitem ${category.active ? "" : "inactive-category"}`}><span className="color-dot" style={{ background: category.color || "#9fcabf" }} /><div><strong>{category.name}</strong><p>{category._count.transactions} lançamento(s)</p></div><span className={`status ${category.active ? "" : "inactive"}`}>{category.active ? "Ativa" : "Inativa"}</span><form action={toggleCategory}><input type="hidden" name="id" value={category.id} /><button className="category-toggle" type="submit">{category.active ? "Inativar" : "Ativar"}</button></form></article>)}</div>)}</div> : <div className="empty-state compact"><strong>Nenhuma categoria encontrada</strong><span>Ajuste os filtros ou cadastre uma nova categoria.</span></div>}</section></div><section className="panel rules-panel"><div className="panel-heading"><div><p className="eyebrow">AUTOMAÇÃO</p><h2>Regras por estabelecimento</h2><p className="intro">As regras sugerem categoria e devedor nas próximas importações.</p></div></div><form action={createMerchantRule} className="rule-form"><label>Estabelecimento contém<input name="pattern" required placeholder="Ex.: UBER" /></label><label>Categoria<select name="categoryId"><option value="">Não alterar categoria</option><CategoryOptions categories={ruleCategories} /></select></label><label>Responsável<select name="personId"><option value="">Não atribuir pessoa</option>{people.map(person => <option key={person.id} value={person.id}>{person.nickname || person.name}</option>)}</select></label><label>Prioridade<input name="priority" type="number" min="1" defaultValue="100" /></label><button className="primary" type="submit">Criar regra</button></form>{rules.length ? <div className="rules-list">{rules.map(rule => <article key={rule.id}><span className="rule-match">{rule.pattern}</span><span>{rule.category?.name || "—"}</span><span>{rule.person?.nickname || rule.person?.name || "—"}</span><small>Prioridade {rule.priority}</small><form action={deleteMerchantRule}><input type="hidden" name="id" value={rule.id} /><button type="submit">Excluir</button></form></article>)}</div> : <div className="empty-state compact">Nenhuma regra criada ainda.</div>}</section></section></AppShell>;
}
