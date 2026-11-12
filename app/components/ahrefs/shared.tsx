import React from 'react';
import { Card } from '../ui';

/** Ahrefs value as a number, or a dash when Ahrefs returned nothing (never 0). */
export const fmt = (v?: number) => (v === undefined ? '—' : Math.round(v).toLocaleString());

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="space-y-1">
      <p className="text-[11px] uppercase text-slate-400">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 break-words">{sub}</p>}
    </Card>
  );
}
