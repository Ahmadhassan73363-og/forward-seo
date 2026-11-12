'use client';

import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import type { Run } from '@/lib/engine/types';
import { buildKpis, kpisCsv, type Kpi } from '@/lib/engine/kpis';
import { ScoreRing } from '../ui';
import { change, int, money, pct } from '../shared/format';
import { SourceIcon, type SourceId } from '../shared/source';

const KIND: Record<Kpi['kind'], { label: string; dot: string; tip: string }> = {
  measured: { label: 'Measured', dot: 'bg-emerald-600', tip: 'Counted by the source' },
  estimated: { label: 'Estimated', dot: 'bg-amber-500', tip: "The vendor's model, not a count" },
  sampled: { label: 'Sampled', dot: 'bg-brand', tip: 'From a fixed set of prompts, keywords or URLs' },
};

const STATUS_TEXT: Record<Exclude<Kpi['status'], 'ok'>, string> = {
  not_connected: 'Not connected',
  no_access: 'No access',
  failed: 'Request failed',
  no_data: 'No data',
};

function display(k: Kpi): string {
  if (k.format === 'text') return k.text ?? '—';
  const v = k.value;
  if (v === undefined) return '—';
  switch (k.format) {
    case 'pct':
      return pct(v);
    case 'position':
      return v.toFixed(1);
    case 'money':
      return money(v);
    case 'ms':
      return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`;
    case 'cls':
      return v.toFixed(2);
    default:
      return int(v);
  }
}

/** Inline SVG sparkline: area + line, brand red. No chart library. */
function Sparkline({ values, invert = false, className = 'h-9' }: { values: number[]; invert?: boolean; className?: string }) {
  const w = 120;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const n = (v - min) / span;
    return [x, 2 + (invert ? n : 1 - n) * (h - 4)] as const; // lower-is-better metrics draw "better" upward
  });
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const id = React.useId().replace(/:/g, '');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`w-full ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b71234" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#b71234" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#g${id})`} />
      <path d={line} fill="none" stroke="#b71234" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SourceMarks({ ids, size = 14 }: { ids: string[]; size?: number }) {
  return (
    <span className="flex -space-x-1">
      {ids.map((s) => (
        <span key={s} className="bg-white rounded-md p-[2px] shadow-[0_0_0_1px_rgba(24,24,27,0.06)]">
          <SourceIcon id={s as SourceId} size={size} />
        </span>
      ))}
    </span>
  );
}

function Tile({ k }: { k: Kpi }) {
  const ok = k.status === 'ok';
  const ch = ok ? change(k.value, k.previous, k.lowerIsBetter) : undefined;
  return (
    <div className={`glass lift rounded-xl flex flex-col overflow-hidden ${ok ? '' : 'opacity-75'}`}>
      {/* Source strip: who the number comes from */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <span className="inline-flex items-center gap-2 min-w-0" title={`Source: ${k.source}`}>
          <SourceMarks ids={k.sourceIds || ['audit']} />
          <span className="text-[10px] font-medium text-neutral-500 truncate">{k.source}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-neutral-500 shrink-0" title={KIND[k.kind].tip}>
          <span className={`w-1.5 h-1.5 rounded-full ${KIND[k.kind].dot}`} />
          {KIND[k.kind].label}
        </span>
      </div>
      <div className="px-4 pt-2.5 pb-3 space-y-1 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 leading-snug">{k.label}</p>
        {ok ? (
          <p className="text-[26px] leading-tight font-semibold text-neutral-900 tabular-nums tracking-tight">
            {display(k)}
            {k.numerator !== undefined && k.denominator ? <span className="text-xs font-normal text-neutral-500 tracking-normal"> · {k.numerator} of {k.denominator}</span> : null}
          </p>
        ) : (
          <p className="text-sm font-medium text-neutral-500 py-1">{STATUS_TEXT[k.status as Exclude<Kpi['status'], 'ok'>]}</p>
        )}
        {ch && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md ${ch.good ? 'text-emerald-700 bg-emerald-500/10' : 'text-brand bg-brand/10'}`}>
            {ch.text.startsWith('-') ? '▼' : '▲'} {ch.text}
          </span>
        )}
        {k.note && <p className="text-[11px] text-neutral-500 break-words leading-snug">{k.note}</p>}
      </div>
      {k.series && <Sparkline values={k.series} invert={k.lowerIsBetter} className="h-9 -mb-px" />}
      {(k.range || (k.status === 'not_connected' && k.setup)) && (
        <p className="px-4 py-1.5 border-t border-white/70 bg-white/35 text-[10px] text-neutral-400">
          {k.range}
          {k.status === 'not_connected' && k.setup && <>Setup: docs/{k.setup}</>}
        </p>
      )}
    </div>
  );
}

/** Top of the dashboard: score, coverage, connected sources and the four headline numbers. */
function Summary({ run, kpis }: { run: Run; kpis: Kpi[] }) {
  const pick = (...ids: string[]) => ids.map((id) => kpis.find((k) => k.id === id && k.status === 'ok')).find(Boolean);
  const aiMentions = kpis.filter((k) => k.id.startsWith('ai_mentions_') && k.status === 'ok');
  const mentionX = aiMentions.reduce((s, k) => s + (k.numerator ?? 0), 0);
  const mentionN = aiMentions.reduce((s, k) => s + (k.denominator ?? 0), 0);
  const headline: Array<{ label: string; value: string; sub?: string; ids: string[]; series?: number[]; invert?: boolean }> = [];
  const add = (k: Kpi | undefined, label?: string) => k && headline.push({ label: label || k.label, value: display(k), sub: change(k.value, k.previous, k.lowerIsBetter)?.text, ids: k.sourceIds || [], series: k.series, invert: k.lowerIsBetter });
  add(pick('organic_clicks'));
  add(pick('organic_revenue', 'organic_sessions'));
  if (mentionN) headline.push({ label: 'AI brand mentions', value: pct(mentionX / mentionN, 0), sub: `${mentionX} of ${mentionN} AI answers`, ids: aiMentions.flatMap((k) => k.sourceIds || []) });
  add(pick('ai_sessions', 'aio_citations'));
  const withData = kpis.filter((k) => k.status === 'ok').length;
  const sources = Array.from(new Set(kpis.filter((k) => k.status === 'ok').flatMap((k) => k.sourceIds || [])));

  return (
    <div className="glass rounded-2xl p-5 sm:p-6 grid gap-6 lg:grid-cols-[auto_1fr]">
      <div className="flex items-center gap-5">
        <ScoreRing score={run.scores?.overall ?? null} size={104} label="audit score" />
        <div className="space-y-2 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">SEO &amp; AI overview</p>
          <p className="text-sm text-neutral-700">
            <span className="text-2xl font-semibold text-neutral-900 tabular-nums">{withData}</span>
            <span className="text-neutral-500"> of {kpis.length} KPIs have data</span>
          </p>
          <div className="h-1.5 w-44 rounded-full bg-neutral-900/[0.07] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${(withData / Math.max(1, kpis.length)) * 100}%` }} />
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            <SourceMarks ids={sources.slice(0, 8)} size={14} />
            <span className="text-[10px] text-neutral-500">
              {sources.length > 8 ? `+${sources.length - 8} · ` : ''}
              {sources.length} sources
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        {headline.map((h) => (
          <div key={h.label} className="rounded-xl bg-white/55 border border-white/80 shadow-[0_0_0_1px_rgba(24,24,27,0.05)] px-3.5 pt-3 flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 truncate">{h.label}</p>
              <SourceMarks ids={Array.from(new Set(h.ids)).slice(0, 3)} size={12} />
            </div>
            <p className="text-xl font-semibold text-neutral-900 tabular-nums mt-1">{h.value}</p>
            <p className="text-[10px] text-neutral-500 truncate">{h.sub || ' '}</p>
            {h.series ? <Sparkline values={h.series} invert={h.invert} className="h-7 mt-1" /> : <div className="h-3" />}
          </div>
        ))}
        {headline.length === 0 && <p className="text-xs text-neutral-500 col-span-full self-center">Connect Search Console, GA4 or an AI engine to see headline numbers here.</p>}
      </div>
    </div>
  );
}

/** SEO + AI SEO dashboard: every KPI from every connected source, with its source and kind. */
export function DashboardTab({ run }: { run: Run }) {
  const kpis = useMemo(() => buildKpis(run), [run]);
  const download = () => {
    const blob = new Blob([kpisCsv(run, kpis)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kpis-${run.store?.host || 'store'}-${(run.createdAt || '').slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const section = (id: 'seo' | 'ai', title: string, sub: string) => {
    const list = kpis.filter((k) => k.section === id);
    return (
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-1 h-8 rounded-full bg-gradient-to-b from-brand-400 to-brand-800" />
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">{title}</h3>
              <p className="text-[11px] text-neutral-500">{sub}</p>
            </div>
          </div>
          <span className="text-[11px] text-neutral-500 shrink-0">
            {list.filter((k) => k.status === 'ok').length}/{list.length} with data
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((k) => (
            <Tile key={k.id} k={k} />
          ))}
        </div>
      </section>
    );
  };
  return (
    <div className="space-y-6">
      <Summary run={run} kpis={kpis} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-600 max-w-3xl">
          Every number comes from the source on its tile, for the dates shown. <strong>Sampled</strong> numbers come from a fixed set of prompts, keywords or URLs, so they read as &quot;x of n&quot;. None of this changes the audit score.
        </p>
        <button onClick={download} className="glass lift text-xs font-medium inline-flex items-center gap-1.5 px-3 py-2 rounded-lg hover:text-brand">
          <Download className="w-3.5 h-3.5" /> KPIs CSV
          <span className="inline-flex items-center gap-1 text-neutral-400 font-normal">
            for <SourceIcon id="sheets" size={12} /> <SourceIcon id="looker" size={12} />
          </span>
        </button>
      </div>
      {section('seo', 'SEO', 'Search Console, GA4, Merchant Center, Ahrefs / Semrush, Chrome UX Report and this audit')}
      {section('ai', 'AI SEO', 'ChatGPT, Perplexity and Gemini answers, Google AI Overviews, AI-referred visits and Otterly.AI')}
    </div>
  );
}
