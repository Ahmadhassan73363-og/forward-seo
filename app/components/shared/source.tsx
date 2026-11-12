import React from 'react';
import { SIMPLE_ICONS } from './simple-icons';

/*
 * Where a number comes from. Every third-party card, tab and table gets the source's mark so data from
 * Google, Ahrefs, Semrush, AI engines and this audit is never confused.
 * Marks come from Simple Icons where they exist; other sources get a plain lettermark rather than a
 * redrawn logo.
 */

export type SourceId =
  | 'searchConsole'
  | 'ga4'
  | 'merchant'
  | 'pagespeed'
  | 'crux'
  | 'lighthouse'
  | 'ahrefs'
  | 'semrush'
  | 'chatgpt'
  | 'perplexity'
  | 'gemini'
  | 'dataforseo'
  | 'otterly'
  | 'screamingFrog'
  | 'looker'
  | 'sheets'
  | 'shopify'
  | 'audit';

type Def = { label: string; icon?: keyof typeof SIMPLE_ICONS; mono?: string; monoBg?: string };

export const SOURCES: Record<SourceId, Def> = {
  searchConsole: { label: 'Search Console', icon: 'searchConsole' },
  ga4: { label: 'Google Analytics 4', icon: 'ga4' },
  merchant: { label: 'Merchant Center', icon: 'google' },
  pagespeed: { label: 'PageSpeed Insights', icon: 'pagespeed' },
  crux: { label: 'Chrome UX Report', icon: 'chrome' },
  lighthouse: { label: 'Lighthouse', icon: 'lighthouse' },
  ahrefs: { label: 'Ahrefs', mono: 'ah', monoBg: '#1f2937' },
  semrush: { label: 'Semrush', icon: 'semrush' },
  chatgpt: { label: 'ChatGPT', mono: 'AI', monoBg: '#111111' },
  perplexity: { label: 'Perplexity', icon: 'perplexity' },
  gemini: { label: 'Gemini', icon: 'gemini' },
  dataforseo: { label: 'DataForSEO', mono: 'D4', monoBg: '#1f2937' },
  otterly: { label: 'Otterly.AI', mono: 'Ot', monoBg: '#1f2937' },
  screamingFrog: { label: 'Screaming Frog', mono: 'SF', monoBg: '#1f2937' },
  looker: { label: 'Looker Studio', icon: 'looker' },
  sheets: { label: 'Google Sheets', icon: 'sheets' },
  shopify: { label: 'Shopify', icon: 'shopify' },
  audit: { label: 'This audit', mono: 'F', monoBg: '#b71234' },
};

/** The source's mark, square, at `size` px. */
export function SourceIcon({ id, size = 14, className = '', decorative = false }: { id: SourceId; size?: number; className?: string; decorative?: boolean }) {
  const d = SOURCES[id];
  // Decorative marks (next to a visible name, e.g. in tabs) are hidden from screen readers.
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': d.label };
  if (d.icon) {
    const ic = SIMPLE_ICONS[d.icon];
    return (
      <svg {...a11y} viewBox="0 0 24 24" width={size} height={size} className={`shrink-0 ${className}`} fill={ic.hex}>
        {!decorative && <title>{d.label}</title>}
        <path d={ic.path} />
      </svg>
    );
  }
  return (
    <span
      {...a11y}
      title={decorative ? undefined : d.label}
      className={`shrink-0 inline-grid place-items-center rounded-[3px] text-white font-semibold leading-none ${className}`}
      style={{ width: size, height: size, background: d.monoBg, fontSize: Math.max(7, Math.round(size * 0.5)) }}
    >
      {d.mono}
    </span>
  );
}

/** Mark + name, for card corners and section headings. */
export function SourceBadge({ id, label, className = '' }: { id: SourceId; label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium text-neutral-600 bg-white/70 border border-neutral-200 rounded-sm px-1.5 py-0.5 whitespace-nowrap ${className}`}>
      <SourceIcon id={id} size={12} decorative />
      {label ?? SOURCES[id].label}
    </span>
  );
}

/** Section heading for a third-party block: mark, title, optional subtitle. */
export function SourceHeading({ id, title, sub, as = 'h3' }: { id: SourceId; title: string; sub?: React.ReactNode; as?: 'h3' | 'h4' }) {
  const H = as;
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 p-1 bg-white border border-neutral-200 rounded-sm">
        <SourceIcon id={id} size={16} />
      </span>
      <div className="min-w-0">
        <H className={`${as === 'h3' ? 'text-base' : 'text-sm'} font-semibold text-neutral-900`}>{title}</H>
        {sub && <p className="text-[11px] text-neutral-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/** Engine id used by the AI checks → source id. */
export const engineSource = (engine: string): SourceId => (engine === 'chatgpt' ? 'chatgpt' : engine === 'perplexity' ? 'perplexity' : engine === 'gemini' ? 'gemini' : 'audit');
