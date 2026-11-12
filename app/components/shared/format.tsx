import React from 'react';
import { Card } from '../ui';

/** Third-party values: a dash when the source returned nothing (never 0). */
export const int = (v?: number) => (v === undefined ? '—' : Math.round(v).toLocaleString());
export const pct = (v?: number, digits = 1) => (v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`);
export const money = (v?: number) => (v === undefined ? '—' : Math.round(v).toLocaleString(undefined, { maximumFractionDigits: 0 }));
export const xOfN = (x?: number, n?: number) => (x === undefined || !n ? '—' : `${x} of ${n}`);

/** "+12% vs previous period" (or nothing when either side is missing). */
export function change(cur?: number, prev?: number, lowerIsBetter = false): { text: string; good: boolean } | undefined {
  if (cur === undefined || prev === undefined || prev === 0) return undefined;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  const r = Math.round(d);
  return { text: `${r > 0 ? '+' : ''}${r}% vs previous period`, good: lowerIsBetter ? d <= 0 : d >= 0 };
}

/** Amber card for a source that answered with "no access" or failed; the message says why. */
export function SourceNotice({ title, message }: { title: string; message?: string }) {
  return (
    <Card className="text-sm text-amber-800 border-amber-500/30 bg-amber-500/5 space-y-1">
      <p>{title}</p>
      {message && <p className="text-xs">{message}</p>}
    </Card>
  );
}

export function SimpleTable({ head, rows, firstLeft = true }: { head: string[]; rows: React.ReactNode[][]; firstLeft?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-neutral-600 text-[10px] uppercase">
          <tr>
            {head.map((h, i) => (
              <th key={h + i} className={`py-1 pr-3 ${i === 0 && firstLeft ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200/70">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`py-1.5 pr-3 align-top ${j === 0 && firstLeft ? 'text-left' : 'text-right'}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Small bar chart (one bar per point) with first/last date labels. */
export function Bars({ points, label }: { points: Array<{ date: string; value?: number }>; label: string }) {
  if (points.length < 2) return null;
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  return (
    <div className="space-y-1">
      <div className="flex items-end gap-[2px] h-20" role="img" aria-label={label}>
        {points.map((p) => (
          <div key={p.date} className="flex-1 bg-brand/75 hover:bg-brand rounded-t-sm min-h-[1px]" style={{ height: `${((p.value ?? 0) / max) * 100}%` }} title={`${p.date}: ${int(p.value)}`} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span>{points[0].date}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}
