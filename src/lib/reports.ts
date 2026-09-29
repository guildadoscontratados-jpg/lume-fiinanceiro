import type { CategoryNature } from "@/generated/prisma-v9";

export type CategoryMeta = { nature: CategoryNature; rootId: string; rootName: string; name: string };

export function buildCategoryMeta(categories: Array<{ id: string; name: string; parentId: string | null; nature: CategoryNature }>) {
  const byId = new Map(categories.map(category => [category.id, category]));
  const meta = new Map<string, CategoryMeta>();
  for (const category of categories) {
    const root = category.parentId ? byId.get(category.parentId) ?? category : category;
    meta.set(category.id, { nature: category.nature, rootId: root.id, rootName: root.name, name: category.name });
  }
  return meta;
}

export function lastMonths(year: number, month: number, count: number) {
  const months: Array<{ year: number; month: number; key: string; label: string }> = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1, 12));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    months.push({ year: y, month: m, key: `${y}-${String(m).padStart(2, "0")}`, label: date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "") });
  }
  return months;
}

export function niceCeil(value: number) {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}
