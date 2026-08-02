export type ReceivableTransaction = {
  amountCents: number;
  personId: string | null;
  shares: Array<{ personId: string; percentageBps: number }>;
};

export function monthSelection(value?: string) {
  const now = new Date();
  const selected = value?.match(/^\d{4}-\d{2}$/) ? value : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, month] = selected.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { selected, year, month, start, end };
}

export function shiftMonth(selected: string, delta: number) {
  const [year, month] = selected.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function allocatedAmount(transaction: ReceivableTransaction, personId: string) {
  if (transaction.shares.length) {
    const share = transaction.shares.find(item => item.personId === personId);
    return share ? Math.round(transaction.amountCents * share.percentageBps / 10000) : 0;
  }
  return transaction.personId === personId ? transaction.amountCents : 0;
}
