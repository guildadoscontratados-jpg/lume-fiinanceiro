export function invoiceReferenceFromFileName(fileName: string) {
  const match = fileName.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(`${match[1]}-${match[2]}-01T12:00:00`);
}

export function invoiceDueDate(referenceMonth: Date, dueDay: number) {
  const year = referenceMonth.getUTCFullYear();
  const month = referenceMonth.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(Math.max(1, dueDay), lastDay), 12));
}
