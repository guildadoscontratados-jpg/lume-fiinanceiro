import * as XLSX from "xlsx";

export type ParsedImportRow = { sourceLine: number; rawData: string; occurredAt: Date | null; description: string | null; amountCents: number | null; installmentNo: number | null; installmentTotal: number | null };
export type ParsedStatement = { rows: ParsedImportRow[]; mappingRequired: boolean };

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function csvRows(content: string) {
  const delimiter = (content.split("\n")[0].match(/;/g) || []).length > (content.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const result: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < content.length; i += 1) { const char = content[i]; const next = content[i + 1]; if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; } else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") i += 1; row.push(cell.trim()); if (row.some(Boolean)) result.push(row); row = []; cell = ""; } else cell += char; }
  row.push(cell.trim()); if (row.some(Boolean)) result.push(row); return result;
}

function referenceDateFromFileName(fileName: string) {
  const match = fileName.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseImportedDate(value: string, referenceDate: Date | null = null) {
  const text = value.trim(); if (!text) return null;
  const brazilian = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (brazilian) { const year = brazilian[3].length === 2 ? `20${brazilian[3]}` : brazilian[3]; const date = new Date(`${year}-${brazilian[2].padStart(2, "0")}-${brazilian[1].padStart(2, "0")}T12:00:00`); return Number.isNaN(date.getTime()) ? null : date; }
  const dayMonth = text.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (dayMonth && referenceDate) { const month = Number(dayMonth[2]); let year = referenceDate.getFullYear(); if (month > referenceDate.getMonth() + 1) year -= 1; const date = new Date(`${year}-${String(month).padStart(2, "0")}-${dayMonth[1].padStart(2, "0")}T12:00:00`); return Number.isNaN(date.getTime()) ? null : date; }
  const iso = new Date(`${text.slice(0, 10)}T12:00:00`); return Number.isNaN(iso.getTime()) ? null : iso;
}

export function parseImportedAmount(value: string) {
  const text = value.replace(/R\$\s?/gi, "").replace(/\s/g, ""); if (!text) return null;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const cents = Math.round(Number(normalized) * 100); return Number.isSafeInteger(cents) && cents !== 0 ? cents : null;
}

function fieldIndex(headers: string[], names: string[]) { return headers.findIndex(header => names.some(name => header === name || header.includes(name))); }

function findHeader(matrix: string[][]) {
  const dateNames = ["data", "date", "dt", "dia"];
  const descriptionNames = ["estabelecimento", "descri", "lançamento", "lancamento", "merchant", "histórico", "historico", "detalhe", "transação", "transacao", "nome", "local", "titulo", "título"];
  const amountNames = ["valor", "amount", "value", "total", "r$", "preço", "preco", "débito", "debito"];
  for (let index = 0; index < Math.min(matrix.length, 30); index += 1) {
    const headers = matrix[index].map(value => normalize(value));
    const dateIndex = fieldIndex(headers, dateNames); const descriptionIndex = fieldIndex(headers, descriptionNames); const amountIndex = fieldIndex(headers, amountNames);
    if (dateIndex >= 0 && descriptionIndex >= 0 && amountIndex >= 0) return { headerRow: index, headers, dateIndex, descriptionIndex, amountIndex };
  }
  return null;
}

export function mapRawImportRow(rawData: string, dateField: string, descriptionField: string, amountField: string, referenceDate: Date | null = null) {
  const source = JSON.parse(rawData) as Record<string, string>;
  const description = source[descriptionField]?.trim() || null;
  const installment = description?.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  return { occurredAt: parseImportedDate(source[dateField] ?? "", referenceDate), description, amountCents: parseImportedAmount(source[amountField] ?? ""), installmentNo: installment ? Number(installment[1]) : null, installmentTotal: installment ? Number(installment[2]) : null };
}

export function parseStatement(fileName: string, buffer: Buffer): ParsedStatement {
  const referenceDate = referenceDateFromFileName(fileName);
  const extension = fileName.toLowerCase().split(".").pop();
  let matrix: string[][];
  if (extension === "csv") matrix = csvRows(buffer.toString("utf8").replace(/^\uFEFF/, ""));
  else if (extension === "xlsx") { const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true }); const sheet = workbook.Sheets[workbook.SheetNames[0]]; matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" }).map(row => row.map(String)); }
  else throw new Error("Envie um arquivo CSV ou XLSX.");
  if (matrix.length < 2) throw new Error("O arquivo não possui lançamentos suficientes.");
  const header = findHeader(matrix);
  if (header) return { mappingRequired: false, rows: matrix.slice(header.headerRow + 1).filter(row => row.some(value => value.trim())).map((row, index) => { const description = row[header.descriptionIndex]?.trim() || null; const installment = description?.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/); return { sourceLine: header.headerRow + index + 2, rawData: JSON.stringify(Object.fromEntries(header.headers.map((column, position) => [column, row[position] ?? ""]))), occurredAt: parseImportedDate(row[header.dateIndex] ?? "", referenceDate), description, amountCents: parseImportedAmount(row[header.amountIndex] ?? ""), installmentNo: installment ? Number(installment[1]) : null, installmentTotal: installment ? Number(installment[2]) : null }; }) };
  const firstRow = matrix.findIndex(row => row.filter(value => value.trim()).length >= 2);
  const candidate = firstRow >= 0 ? matrix[firstRow] : [];
  const headers = candidate.map((value, index) => value.trim() || `Coluna ${index + 1}`);
  const uniqueHeaders = headers.map((value, index) => headers.indexOf(value) === index ? value : `${value} (${index + 1})`);
  return { mappingRequired: true, rows: matrix.slice(firstRow + 1).filter(row => row.some(value => value.trim())).map((row, index) => ({ sourceLine: firstRow + index + 2, rawData: JSON.stringify(Object.fromEntries(uniqueHeaders.map((column, position) => [column, row[position] ?? ""]))), occurredAt: null, description: null, amountCents: null, installmentNo: null, installmentTotal: null })) };
}
