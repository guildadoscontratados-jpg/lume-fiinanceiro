"use client";

import { useState, type ChangeEvent } from "react";
import { flushSync } from "react-dom";

type Person = { id: string; name: string; nickname: string | null };
type Category = { id: string; name: string };
type Row = { id: string; date: string; description: string; personLabel: string; personId: string | null; shares: Array<{ personId: string; percentage: number }>; categoryId: string | null; categoryLabel: string; installmentLabel: string; hasInstallment: boolean; amountLabel: string; refund: boolean; dueLabel: string };
type Projected = Omit<Row, "personId" | "shares" | "categoryId" | "hasInstallment" | "refund"> & { status: string };
type ServerAction = (formData: FormData) => void;

export function DueInvoiceEditor({ title, rows, projected, people, categories, bulkAction: serverBulkAction, shareAction: serverShareAction, itemAction: serverItemAction }: { title: string; rows: Row[]; projected: Projected[]; people: Person[]; categories: Category[]; bulkAction: ServerAction; shareAction: ServerAction; itemAction: ServerAction }) {
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(rows.map(row => [row.id, Math.max(1, row.shares.length)])));
  const [personValues, setPersonValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map(row => [row.id, row.shares[0]?.personId ?? row.personId ?? ""])));
  const [categoryValues, setCategoryValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map(row => [row.id, row.categoryId ?? ""])));
  const [extraPeople, setExtraPeople] = useState<Record<string, string>>(() => Object.fromEntries(rows.flatMap(row => row.shares.slice(1).map((share, index) => [`${row.id}-${index + 1}`, share.personId]))));

  const showFeedback = (message: string, saved = false) => {
    let toast = document.getElementById("save-feedback");
    if (!toast) { toast = document.createElement("div"); toast.id = "save-feedback"; document.body.appendChild(toast); }
    toast.className = `save-feedback${saved ? " saved" : ""}`;
    toast.textContent = message;
  };
  const finish = () => { showFeedback("Alteração salva ✓", true); window.setTimeout(() => document.getElementById("save-feedback")?.remove(), 2200); };
  const runRowAction = async (action: ServerAction, formData: FormData) => { showFeedback("Salvando alteração..."); await action(formData); finish(); };
  const shareAction = async (formData: FormData) => runRowAction(serverShareAction, formData);
  const itemAction = async (formData: FormData) => runRowAction(serverItemAction, formData);
  const bulkAction = async (formData: FormData) => {
    showFeedback("Salvando alterações...");
    await serverBulkAction(formData);
    const selected = new Set(formData.getAll("selected").map(String));
    const operation = String(formData.get("bulkAction") ?? "");
    if (operation === "CATEGORY") { const value = String(formData.get("categoryId") ?? ""); setCategoryValues(current => ({ ...current, ...Object.fromEntries([...selected].map(id => [id, value])) })); }
    if (operation === "PERSON") { const value = String(formData.get("personId") ?? ""); setPersonValues(current => ({ ...current, ...Object.fromEntries([...selected].map(id => [id, value])) })); }
    finish();
  };
  const submitInline = (event: ChangeEvent<HTMLSelectElement>, installment: boolean) => {
    const form = event.currentTarget.form; if (!form) return;
    const scope = form.elements.namedItem("scope") as HTMLInputElement;
    scope.value = installment && window.confirm("Deseja aplicar esta mudança a todo o parcelamento?\n\nOK: todos os lançamentos.\nCancelar: somente este lançamento.") ? "ALL" : "ONLY_THIS";
    form.requestSubmit();
  };

  return <section className="panel detail-panel">
    <div className="panel-heading"><div><p className="eyebrow">LANÇAMENTOS DA FATURA</p><h2>{title}</h2></div></div>
    {rows.length ? <form id="due-bulk-form" action={bulkAction} className="due-bulk-toolbar"><select name="bulkAction" required defaultValue=""><option value="" disabled>Alteração em massa...</option><option value="CATEGORY">Definir categoria</option><option value="PERSON">Definir devedor</option></select><select name="categoryId"><option value="">Categoria...</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select name="personId"><option value="">Devedor...</option>{people.map(person => <option key={person.id} value={person.id}>{person.nickname || person.name}</option>)}</select><button className="primary" type="submit">Aplicar aos selecionados</button></form> : null}
    {rows.length || projected.length ? <div className="detail-table-wrap"><table className="detail-table due-editor-table"><thead><tr><th>Sel.</th><th>Data</th><th>Estabelecimento</th><th>Devedor / rateio</th><th>Categoria</th><th>Parcela</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>
      {rows.map(row => { const count = counts[row.id] ?? 1; return <tr key={row.id}><td><input form="due-bulk-form" type="checkbox" name="selected" value={row.id} aria-label={`Selecionar ${row.description}`} /></td><td>{row.date}</td><td><strong>{row.description}</strong></td><td>
        <form action={shareAction} className={`inline-share-form ${count > 1 ? "is-splitting" : ""}`}><input type="hidden" name="transactionId" value={row.id} /><input type="hidden" name="shareCount" value={count} /><input type="hidden" name="scope" value="ONLY_THIS" /><div className="assignment-list">{Array.from({ length: count }, (_, index) => { const existing = row.shares[index]; const extraKey = `${row.id}-${index}`; return <div className="assignment-row" key={index}><select name={`sharePerson-${index}`} value={index === 0 ? personValues[row.id] ?? row.personId ?? "" : extraPeople[extraKey] ?? existing?.personId ?? ""} onChange={event => { const value = event.currentTarget.value; flushSync(() => { if (index === 0) setPersonValues(current => ({ ...current, [row.id]: value })); else setExtraPeople(current => ({ ...current, [extraKey]: value })); }); if (count === 1) submitInline(event, row.hasInstallment); }} required><option value="">Selecione</option>{people.map(person => <option key={person.id} value={person.id}>{person.nickname || person.name}</option>)}</select>{count > 1 && <><input className="assignment-percent" name={`sharePercent-${index}`} inputMode="decimal" defaultValue={existing?.percentage ? String(existing.percentage).replace(".", ",") : ""} placeholder="%" required /><span>%</span></>}{index === 0 ? <button type="button" className="assignment-plus" disabled={count >= people.length} onClick={() => flushSync(() => setCounts(current => ({ ...current, [row.id]: Math.min(people.length, count + 1) })))} aria-label="Adicionar pessoa">+</button> : <button type="button" className="assignment-minus" onClick={() => flushSync(() => setCounts(current => ({ ...current, [row.id]: Math.max(1, count - 1) })))} aria-label="Remover pessoa">−</button>}</div>; })}</div>{count > 1 && <button className="save-share" type="submit">Salvar rateio</button>}</form>
      </td><td><form action={itemAction} className="inline-edit-form"><input type="hidden" name="transactionId" value={row.id} /><input type="hidden" name="field" value="categoryId" /><input type="hidden" name="scope" value="ONLY_THIS" /><select name="value" value={categoryValues[row.id] ?? row.categoryId ?? ""} onChange={event => { const value = event.currentTarget.value; flushSync(() => setCategoryValues(current => ({ ...current, [row.id]: value }))); submitInline(event, row.hasInstallment); }}><option value="" disabled>Categoria...</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></form></td><td>{row.installmentLabel}</td><td className={row.refund ? "refund-value" : ""}>{row.amountLabel}</td><td>{row.dueLabel}</td><td><span className="detail-status confirmed">Confirmado</span></td></tr>; })}
      {projected.map(row => <tr key={row.id} className="projected-row"><td>—</td><td>{row.date}</td><td><strong>{row.description}</strong></td><td>{row.personLabel}</td><td>{row.categoryLabel}</td><td>{row.installmentLabel}</td><td>{row.amountLabel}</td><td>{row.dueLabel}</td><td><span className={`detail-status ${row.status.toLowerCase()}`}>{row.status === "DIVERGENT" ? "Divergente" : "Previsto"}</span></td></tr>)}
    </tbody></table></div> : <div className="empty-state compact"><strong>Nenhum lançamento nesta competência</strong><span>Importe uma fatura ou aguarde uma parcela prevista.</span></div>}
  </section>;
}
