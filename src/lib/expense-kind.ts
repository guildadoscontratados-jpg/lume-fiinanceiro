import { normalizeMerchant } from "@/lib/merchant-rules";

export type ExpenseKindValue = "FIXA" | "VARIAVEL";

export function expenseKeyOf(merchantNormalized: string | null | undefined, description: string) {
  return normalizeMerchant(merchantNormalized || description);
}

// Sem classificação explícita, a despesa é tratada como variável.
export function expenseKindResolver(entries: Array<{ merchantKey: string; kind: ExpenseKindValue }>) {
  const byKey = new Map(entries.map(entry => [entry.merchantKey, entry.kind]));
  return (merchantNormalized: string | null | undefined, description: string): ExpenseKindValue => byKey.get(expenseKeyOf(merchantNormalized, description)) ?? "VARIAVEL";
}
