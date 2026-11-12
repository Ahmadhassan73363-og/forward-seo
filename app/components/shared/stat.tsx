import React from 'react';
import { Card } from '../ui';
import { SourceIcon, SOURCES, type SourceId } from './source';

/** A third-party value as a number, or a dash when the source returned nothing (never 0). */
export const fmt = (v?: number) => (v === undefined ? '—' : Math.round(v).toLocaleString());

/** Stat card. With `source`, the source's mark sits in the top-right corner. */
export function Stat({ label, value, sub, source }: { label: string; value: string; sub?: string; source?: SourceId }) {
  return (
    <Card className="lift space-y-1.5 !p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 leading-snug">{label}</p>
        {source && (
          <span title={`Source: ${SOURCES[source].label}`}>
            <SourceIcon id={source} size={14} />
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold text-neutral-900 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-neutral-500 break-words leading-snug">{sub}</p>}
    </Card>
  );
}
