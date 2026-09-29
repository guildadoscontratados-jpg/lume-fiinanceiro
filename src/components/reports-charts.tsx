import { formatCents } from "@/lib/money";
import { niceCeil } from "@/lib/reports";

export const categoryColorCount = 7;

type TrendPoint = { key: string; label: string; confirmedCents: number; projectedCents: number };

export function MonthlyTrendChart({ points }: { points: TrendPoint[] }) {
  const maxTotal = niceCeil(Math.max(...points.map(point => point.confirmedCents + point.projectedCents), 1));
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];
  return <div className="trend-chart">
    <div className="trend-axis">{gridSteps.map(step => <span key={step} style={{ bottom: `${step * 100}%` }}>{formatCents(Math.round(maxTotal * step))}</span>)}</div>
    <div className="trend-plot">
      <div className="trend-bar-area">
        <div className="trend-gridlines">{gridSteps.map(step => <i key={step} style={{ bottom: `${step * 100}%` }} />)}</div>
        <div className="trend-columns">{points.map(point => {
          const confirmedPct = Math.min(100, point.confirmedCents / maxTotal * 100);
          const projectedPct = Math.min(100 - confirmedPct, point.projectedCents / maxTotal * 100);
          const total = point.confirmedCents + point.projectedCents;
          return <div className="trend-col" key={point.key} tabIndex={0}>
            <div className="trend-tooltip"><strong>{point.label}</strong><span>Confirmado {formatCents(point.confirmedCents)}</span>{point.projectedCents > 0 && <span>Previsto {formatCents(point.projectedCents)}</span>}<b>{formatCents(total)}</b></div>
            <div className="trend-bar-stack">
              {point.projectedCents > 0 && <div className="trend-bar-projected" style={{ height: `${projectedPct}%` }} />}
              <div className={`trend-bar-confirmed${point.projectedCents > 0 ? "" : " rounded-top"}`} style={{ height: `${confirmedPct}%` }} />
            </div>
            <small>{point.label}</small>
          </div>;
        })}</div>
      </div>
    </div>
  </div>;
}

type CategoryItem = { name: string; valueCents: number; colorIndex: number | null };

export function CategoryBreakdownChart({ items }: { items: CategoryItem[] }) {
  const max = Math.max(...items.map(item => item.valueCents), 1);
  return <div className="report-category-bars">{items.map(item => {
    const color = item.colorIndex === null ? "var(--muted)" : `var(--cat-${item.colorIndex + 1})`;
    const width = Math.max(3, Math.round(item.valueCents / max * 100));
    return <article key={item.name}>
      <span><i className="color-dot" style={{ background: color }} /><strong>{item.name}</strong></span>
      <div className="report-bar-track"><div className="report-bar-fill" style={{ width: `${width}%`, background: color }} /></div>
      <b>{formatCents(item.valueCents)}</b>
    </article>;
  })}</div>;
}

type PersonItem = { id: string; name: string; valueCents: number };

export function PersonBreakdownChart({ items }: { items: PersonItem[] }) {
  const max = Math.max(...items.map(item => item.valueCents), 1);
  return <div className="report-category-bars">{items.map(item => {
    const width = Math.max(3, Math.round(item.valueCents / max * 100));
    return <article key={item.id}>
      <span><span className="avatar">{item.name[0]}</span><strong>{item.name}</strong></span>
      <div className="report-bar-track"><div className="report-bar-fill" style={{ width: `${width}%`, background: "var(--accent)" }} /></div>
      <b>{formatCents(item.valueCents)}</b>
    </article>;
  })}</div>;
}
