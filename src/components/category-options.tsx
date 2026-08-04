export type SelectableCategory = { id: string; name: string; parent: { name: string } | null };

export function CategoryOptions({ categories }: { categories: SelectableCategory[] }) {
  const groups = new Map<string, SelectableCategory[]>();
  for (const category of categories) {
    const label = category.parent?.name ?? "Outros";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(category);
  }
  return <>{[...groups.entries()].map(([label, items]) => <optgroup label={label} key={label}>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</>;
}
