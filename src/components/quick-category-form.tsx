"use client";

import { useActionState, useEffect, useRef } from "react";

type State = { success: boolean; message: string };

export function QuickCategoryForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState(async (_previous: State, formData: FormData) => {
    const name = String(formData.get("name") ?? "").trim();
    try {
      await action(formData);
      return { success: true, message: `Categoria “${name}” cadastrada e disponível na lista.` };
    } catch {
      return { success: false, message: "Não foi possível cadastrar. Verifique se essa categoria já existe." };
    }
  }, { success: false, message: "" });
  useEffect(() => { if (state.success) formRef.current?.reset(); }, [state]);
  return <div className="quick-category-area"><form ref={formRef} action={submit} className="quick-category due-category"><label>Nova categoria<input name="name" required placeholder="Ex.: Alimentação" /></label><label>Cor<input name="color" type="color" defaultValue="#157a65" /></label><button className="primary quick-category-submit" type="submit" disabled={pending}>{pending ? "Salvando..." : "+ Cadastrar categoria"}</button></form>{state.message && <p className={`category-feedback ${state.success ? "success" : "error"}`} role="status">{state.success ? "✓ " : "! "}{state.message}</p>}</div>;
}
