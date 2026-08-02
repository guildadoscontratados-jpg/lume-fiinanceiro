export function normalizeMerchant(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function findMerchantRule<T extends { pattern: string; categoryId: string | null; personId: string | null }>(description: string, rules: T[]) {
  const normalized = normalizeMerchant(description);
  return rules.find(rule => normalized.includes(normalizeMerchant(rule.pattern))) ?? null;
}
