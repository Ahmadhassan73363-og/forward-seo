'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Users } from 'lucide-react';
import { MODULES, type Run, type RunSummary } from '@/lib/engine/types';
import { Card, cwvClass, fmtMs, scoreColor } from '../../components/ui';

/** Side-by-side comparison of a store and its competitors (runs sharing a groupId). */
export default function BenchmarkPage({ params }: { params: { group: string } }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/runs?group=${encodeURIComponent(params.group)}`, { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return setError('Could not load benchmark.');
    const summaries: RunSummary[] = (await res.json()).runs || [];
    if (!summaries.length) return setError('Benchmark not found.');
    const full = await Promise.all(summaries.map((s) => fetch(`/api/runs/${s.id}`, { cache: 'no-store' }).then((r) => r.json())));
    full.sort((a: Run, b: Run) => (a.input.role === 'primary' ? -1 : b.input.role === 'primary' ? 1 : a.createdAt.localeCompare(b.createdAt)));
    setRuns(full);
  }, [params.group]);

  useEffect(() => {
    load();
  }, [load]);

  const active = runs.some((r) => r.status === 'queued' || r.status === 'running');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [active, load]);

  const cell = (v: number | null | undefined, cls = scoreColor(v)) => <td className={`px-3 py-2 text-center font-bold ${cls}`}>{v ?? '—'}</td>;
  const best = (vals: Array<number | null | undefined>, higherIsBetter = true) => {
    const nums = vals.filter((v): v is number => typeof v === 'number');
    if (!nums.length) return null;
    return higherIsBetter ? Math.max(...nums) : Math.min(...nums);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-900/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/" className="text-xs text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> All audits
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <h1 className="text-xl font-extrabold inline-flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-400" /> Competitor benchmark
        </h1>
        {error && <Card className="text-rose-300 text-sm">{error}</Card>}
        {active && (
          <Card className="text-xs text-slate-300 inline-flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> {runs.filter((r) => r.status === 'completed').length} of {runs.length} audits finished — this page updates
            automatically.
          </Card>
        )}
        {runs.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  <th className="text-left px-3 py-2 w-56">Metric</th>
                  {runs.map((r) => (
                    <th key={r.id} className="px-3 py-2 text-center">
                      <Link href={`/runs/${r.id}`} className="hover:text-emerald-400">
                        {r.store?.host || r.input.url}
                      </Link>
                      <div className="text-[10px] font-normal text-slate-500">
                        {r.input.role === 'primary' ? 'your store' : 'competitor'} · {r.status}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr className="bg-slate-900/40">
                  <td className="px-3 py-2 font-semibold">Overall score</td>
                  {runs.map((r) => cell(r.scores?.grade === 'Incomplete' ? null : r.scores?.overall))}
                </tr>
                <tr>
                  <td className="px-3 py-2">Grade</td>
                  {runs.map((r) => (
                    <td key={r.id} className="px-3 py-2 text-center text-slate-300">
                      {r.scores?.grade ?? '—'}
                    </td>
                  ))}
                </tr>
                {(['performance', 'accessibility', 'bestPractices', 'seo'] as const).map((k) => (
                  <tr key={k}>
                    <td className="px-3 py-2">Lighthouse {k === 'bestPractices' ? 'best practices' : k} (mobile)</td>
                    {runs.map((r) => cell(r.scores?.google.mobile?.[k]))}
                  </tr>
                ))}
                {(
                  [
                    ['Real-user LCP (p75)', 'lcp', (r: Run) => r.crux?.phone?.lcpMs ?? null, true],
                    ['Real-user INP (p75)', 'inp', (r: Run) => r.crux?.phone?.inpMs ?? null, true],
                    ['Real-user CLS (p75)', 'cls', (r: Run) => r.crux?.phone?.cls ?? null, false],
                  ] as Array<[string, 'lcp' | 'inp' | 'cls', (r: Run) => number | null, boolean]>
                ).map(([label, k, get, isMs]) => {
                  const vals = runs.map(get);
                  const b = best(vals, false);
                  return (
                    <tr key={label}>
                      <td className="px-3 py-2">{label}</td>
                      {runs.map((r, i) => (
                        <td key={r.id} className={`px-3 py-2 text-center ${cwvClass(k, vals[i])} ${vals[i] !== null && vals[i] === b ? 'underline' : ''}`}>
                          {vals[i] === null ? '—' : isMs ? fmtMs(vals[i]) : vals[i]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {MODULES.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 text-slate-300">{m.label}</td>
                    {runs.map((r) => cell(r.scores?.modules.find((x) => x.id === m.id)?.score ?? null))}
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2">Critical + high issues</td>
                  {runs.map((r) => (
                    <td key={r.id} className="px-3 py-2 text-center text-rose-300">
                      {r.status === 'completed' ? r.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2">Third-party apps detected</td>
                  {runs.map((r) => (
                    <td key={r.id} className="px-3 py-2 text-center text-slate-300">
                      {r.status === 'completed' ? r.apps.length : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-500">Competitors are audited with public checks only (up to 10 pages each). Underlined real-user values are the best in the group.</p>
      </main>
    </div>
  );
}
