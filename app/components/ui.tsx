'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { Severity } from '@/lib/engine/types';

export function scoreColor(s: number | null | undefined) {
  if (s === null || s === undefined) return 'text-slate-500';
  if (s >= 90) return 'text-emerald-400';
  if (s >= 50) return 'text-amber-400';
  return 'text-rose-400';
}

export function scoreBg(s: number | null | undefined) {
  if (s === null || s === undefined) return 'bg-slate-700';
  if (s >= 90) return 'bg-emerald-400';
  if (s >= 50) return 'bg-amber-400';
  return 'bg-rose-400';
}

export const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  low: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  info: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
};

export function SeverityBadge({ s }: { s: Severity }) {
  return <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[s]}`}>{s}</span>;
}

export function ScoreRing({ score, size = 120, label }: { score: number | null; size?: number; label?: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const off = score === null ? c : c - (c * score) / 100;
  const stroke = score === null ? '#334155' : score >= 90 ? '#34d399' : score >= 50 ? '#fbbf24' : '#fb7185';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeWidth="8" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-black ${size >= 100 ? 'text-3xl' : 'text-lg'} ${scoreColor(score)}`}>{score ?? '—'}</span>
        {label && <span className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</span>}
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
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
    >
      {done ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {done ? 'Copied' : label}
    </button>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-5 ${className}`}>{children}</div>;
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
  if (v === null || v === undefined) return 'text-slate-500';
  const t: Record<string, [number, number]> = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], tbt: [200, 600], fcp: [1800, 3000] };
  const [good, poor] = t[metric];
  return v <= good ? 'text-emerald-400' : v <= poor ? 'text-amber-400' : 'text-rose-400';
}
