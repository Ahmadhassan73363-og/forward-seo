'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { Severity } from '@/lib/engine/types';

export function scoreColor(s: number | null | undefined) {
  if (s === null || s === undefined) return 'text-neutral-500';
  if (s >= 90) return 'text-emerald-600';
  if (s >= 50) return 'text-amber-600';
  return 'text-brand';
}

export function scoreBg(s: number | null | undefined) {
  if (s === null || s === undefined) return 'bg-neutral-300';
  if (s >= 90) return 'bg-emerald-600';
  if (s >= 50) return 'bg-amber-500';
  return 'bg-brand';
}

export const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'bg-brand text-white border-brand',
  high: 'bg-brand-50 text-brand-700 border-brand-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-white/60 text-neutral-700 border-neutral-300',
  info: 'bg-white text-neutral-500 border-neutral-200',
};

export function SeverityBadge({ s }: { s: Severity }) {
  return <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-sm border ${SEVERITY_STYLE[s]}`}>{s}</span>;
}

export function ScoreRing({ score, size = 120, label }: { score: number | null; size?: number; label?: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const off = score === null ? c : c - (c * score) / 100;
  const stroke = score === null ? '#d4d4d4' : score >= 90 ? '#059669' : score >= 50 ? '#d97706' : '#b71234';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#ececec" strokeWidth="7" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeWidth="7" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="butt" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-semibold ${size >= 100 ? 'text-3xl' : 'text-lg'} ${scoreColor(score)}`}>{score ?? '—'}</span>
        {label && <span className="text-[10px] text-neutral-600 uppercase tracking-wider">{label}</span>}
      </div>
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-neutral-900/[0.07] border border-neutral-300 text-neutral-700 hover:text-neutral-900"
    >
      {done ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      {done ? 'Copied' : label}
    </button>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass rounded-xl p-5 ${className}`}>{children}</div>;
}

export function fmtMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function fmtBytes(b: number | null | undefined) {
  if (!b) return '—';
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

export function shortUrl(u: string) {
  try {
    const x = new URL(u);
    return x.pathname + x.search || '/';
  } catch {
    return u;
  }
}

/** Core Web Vitals threshold colouring. */
export function cwvClass(metric: 'lcp' | 'inp' | 'cls' | 'tbt' | 'fcp', v: number | null | undefined) {
  if (v === null || v === undefined) return 'text-neutral-500';
  const t: Record<string, [number, number]> = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], tbt: [200, 600], fcp: [1800, 3000] };
  const [good, poor] = t[metric];
  return v <= good ? 'text-emerald-600' : v <= poor ? 'text-amber-600' : 'text-rose-600';
}
