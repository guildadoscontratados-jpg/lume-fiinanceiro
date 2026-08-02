export function toCents(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim().replace(/R\$\s?/g, "");
  if (!text) throw new Error("Informe um valor.");
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const result = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error("Informe um valor válido.");
  return result;
}

export function formatCents(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}
