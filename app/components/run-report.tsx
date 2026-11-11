'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Bot, ChevronDown, ChevronRight, Cpu, Download, ExternalLink, FileText, Gauge, Layers, ListChecks, MousePointerClick, Printer, RefreshCw, ShieldCheck, Smartphone, Monitor, Store, TrendingDown, TrendingUp, Users, X } from 'lucide-react';
import { BrowserTab, CatalogTab, shotUrl } from './report-extra';
import { MODULES, type Finding, type ModuleId, type PageSpeedTest, type Run, type Severity, type Strategy } from '@/lib/engine/types';
import { Card, CopyButton, ScoreRing, SeverityBadge, cwvClass, fmtBytes, fmtMs, scoreBg, scoreColor, shortUrl } from './ui';

type Tab = 'overview' | 'issues' | 'pages' | 'apps' | 'browser' | 'catalog' | 'site';
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const moduleLabel = (id: ModuleId) => MODULES.find((m) => m.id === id)?.label || id;

/** The full report for one run. Used by saved runs (/runs/[id]) and live audits (/live). */
export function RunReport({ run, onCancel, live }: { run: Run; onCancel?: () => void; live?: boolean }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [now, setNow] = useState(Date.now());
  const active = run.status === 'queued' || run.status === 'running';
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [active]);
  const cancel = () => onCancel?.();
  const exportJson = () => {
    if (!run) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }));
    a.download = `audit-${run.store?.host || 'store'}-${run.id}.json`;
    a.click();
  };

  const exportCsv = () => {
    if (!run) return;
    // Quote every cell; prefix cells that start like a formula so spreadsheets don't execute them.
    const esc = (s: any) => {
      let v = String(s ?? '');
      if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
      return `"${v.replace(/"/g, '""')}"`;
    };
    const rows = [['severity', 'module', 'title', 'pages_affected', 'pages_checked', 'savings_ms', 'fix', 'affected_urls'].join(',')];
    run.findings.forEach((f) =>
      rows.push([f.severity, moduleLabel(f.module), f.title, f.affectedTotal ?? f.pagesAffected.length, f.pagesChecked, f.impact?.savingsMs ?? '', f.fix?.summary || f.description, f.pagesAffected.join(' ')].map(esc).join(','))
    );
    const a = document.createElement('a');
    // UTF-8 byte-order mark so Excel shows “—” and other non-ASCII characters correctly.
    a.href = URL.createObjectURL(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `issues-${run.store?.host || 'store'}-${run.id}.csv`;
    a.click();
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-extrabold truncate">
            {run.store?.host || run.input.url}
            {run.store?.platform && (
              <span
                title={run.store.platform.evidence.length ? `Detected from: ${run.store.platform.evidence.join('; ')}` : 'No platform markers found on the homepage'}
                className={`ml-2 align-middle text-[10px] font-semibold px-2 py-0.5 rounded-full border ${run.store.platform.id === 'shopify' ? 'border-emerald-500/40 text-emerald-300' : 'border-amber-500/40 text-amber-300'}`}
              >
                {run.store.platform.name}
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-400">
            Started {new Date(run.createdAt).toLocaleString()} · {run.input.pages} pages · {run.input.strategies.join(' + ')}
            {run.finishedAt && ` · finished ${new Date(run.finishedAt).toLocaleTimeString()}`}
          </p>
        </div>
        {active && onCancel && (
          <button onClick={cancel} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-rose-500 text-slate-300">
            Cancel
          </button>
        )}
        {run.status === 'completed' && (
          <>
            <button onClick={exportCsv} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-emerald-500 inline-flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> Issues CSV
            </button>
            <button onClick={exportJson} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-emerald-500 inline-flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> JSON
            </button>
            <button onClick={() => window.print()} className="no-print text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-emerald-500 inline-flex items-center gap-1">
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </button>
            {run.input.groupId && (
              <Link href={`/benchmark/${run.input.groupId}`} className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Benchmark
              </Link>
            )}
          </>
        )}
      </div>

      {active && <Progress run={run} now={now} live={live} />}
      {run.status === 'failed' && (
        <Card className="border-rose-500/40 bg-rose-500/5 text-sm text-rose-200">
          <strong>Audit failed:</strong> {run.error}
        </Card>
      )}
      {run.status === 'cancelled' && <Card className="text-sm text-slate-300">This run was cancelled.</Card>}

      {run.status === 'completed' && run.scores && (
        <>
          <nav className="flex flex-wrap gap-1 border-b border-slate-800">
            {(
              [
                ['overview', 'Overview', Gauge],
                ['issues', `Issues (${run.findings.length})`, ListChecks],
                ['pages', `Pages (${run.targets.length})`, Layers],
                ['apps', `Apps (${run.apps.length})`, Cpu],
                ...(run.browser ? [['browser', 'Browser tests', MousePointerClick]] : []),
                ...(run.owner || run.catalog ? [['catalog', 'Catalog', Store]] : []),
                ['site', 'Site checks', ShieldCheck],
              ] as Array<[Tab, string, any]>
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5 border-b-2 -mb-px ${tab === id ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </nav>
          {tab === 'overview' && <Overview run={run} goIssues={() => setTab('issues')} />}
          {tab === 'issues' && <Issues run={run} />}
          {tab === 'pages' && <Pages run={run} />}
          {tab === 'apps' && <Apps run={run} />}
          {tab === 'browser' && run.browser && <BrowserTab run={run} />}
          {tab === 'catalog' && (run.owner || run.catalog) && <CatalogTab run={run} />}
          {tab === 'site' && <Site run={run} />}
        </>
      )}
    </>
  );
}

export function Shell({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-900/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/" className="text-xs text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> {live ? 'New audit' : 'All audits'}
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">{children}</main>
    </div>
  );
}

function Progress({ run, now, live }: { run: Run; now: number; live?: boolean }) {
  const p = run.progress;
  const bar = (done: number, total: number) => (
    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div className="h-full bg-emerald-400 transition-all" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
    </div>
  );
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
        <span className="text-sm font-semibold capitalize">{p.stage}</span>
        {p.message && <span className="text-xs text-slate-400">— {p.message}</span>}
      </div>
      {p.psiTotal > 0 && (
        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <div className="flex justify-between text-slate-300">
              <span>PageSpeed Insights tests</span>
              <span className="font-mono">
                {p.psiDone}/{p.psiTotal}
              </span>
            </div>
            {bar(p.psiDone, p.psiTotal)}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-slate-300">
              <span>HTML crawl</span>
              <span className="font-mono">
                {p.crawlDone}/{p.crawlTotal}
              </span>
            </div>
            {bar(p.crawlDone, p.crawlTotal)}
          </div>
        </div>
      )}
      {p.waitUntil && p.waitUntil > now && (
        <p className="text-xs text-amber-300">
          Crawler paused: {run.store?.platform?.id === 'shopify' ? 'Shopify' : 'the site'} asked it to slow down (HTTP 429) — resuming in {Math.ceil((p.waitUntil - now) / 1000)}s.
        </p>
      )}
      <p className="text-[11px] text-slate-500">
        {live
          ? 'Keep this tab open: the audit runs while this page is connected, and the report is not saved anywhere. Each PageSpeed test takes 15–60 s at Google.'
          : 'Runs on the server — you can close this tab and come back. Each PageSpeed test takes 15–60 s at Google.'}
      </p>
    </Card>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────

function Overview({ run, goIssues }: { run: Run; goIssues: () => void }) {
  const s = run.scores!;
  const sevCounts = SEVERITIES.map((sv) => [sv, run.findings.filter((f) => f.severity === sv).length] as const);
  const top = run.findings.filter((f) => f.severity !== 'info').slice(0, 6);
  return (
    <div className="space-y-6">
      {run.warnings.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 space-y-1">
          <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Data notes
          </div>
          {run.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-100/80">
              • {w}
            </p>
          ))}
        </Card>
      )}

      {run.comparison && <ComparisonCard run={run} />}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="flex items-center gap-6">
          {/* An incomplete run's score covers only some modules — don't present it as the store's score. */}
          <ScoreRing score={s.grade === 'Incomplete' ? null : s.overall} size={130} label="overall" />
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Grade</div>
            <div className={`text-3xl font-black ${s.grade === 'Incomplete' ? 'text-slate-300' : scoreColor(s.overall)}`}>{s.grade}</div>
            {s.grade === 'Incomplete' && s.overall !== null && (
              <div className="text-[11px] text-slate-400">Partial score {s.overall} from measured modules only — not representative.</div>
            )}
            {run.store?.platform && run.store.platform.id !== 'shopify' && (
              <div className="text-[11px] text-amber-200/80">Not a Shopify store: graded on general web checks only. Shopify modules are marked “Not applicable”.</div>
            )}
            <div className="flex flex-wrap gap-1">
              {sevCounts
                .filter(([, n]) => n > 0)
                .map(([sv, n]) => (
                  <span key={sv} className="text-[10px] text-slate-300">
                    <SeverityBadge s={sv} /> {n}
                  </span>
                ))}
            </div>
          </div>
        </Card>
        <Card className="lg:col-span-2 space-y-3">
          <div className="text-xs font-bold text-slate-300">Google Lighthouse scores (median across tested pages)</div>
          {(['mobile', 'desktop'] as Strategy[]).map((st) => {
            const g = s.google[st];
            if (!g) return null;
            return (
              <div key={st} className="flex items-center gap-4 flex-wrap">
                <span className="w-20 text-xs text-slate-400 inline-flex items-center gap-1">
                  {st === 'mobile' ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />} {st}
                </span>
                {(
                  [
                    ['Performance', g.performance],
                    ['Accessibility', g.accessibility],
                    ['Best practices', g.bestPractices],
                    ['SEO', g.seo],
                  ] as Array<[string, number | null]>
                ).map(([l, v]) => (
                  <div key={l} className="flex items-center gap-2">
                    <ScoreRing score={v} size={46} />
                    <span className="text-[11px] text-slate-400">{l}</span>
                  </div>
                ))}
                <span className="text-[10px] text-slate-500">{g.pages} pages</span>
              </div>
            );
          })}
          {!s.google.mobile && !s.google.desktop && <p className="text-xs text-slate-500">No PageSpeed results this run — see data notes.</p>}
        </Card>
      </div>

      <FieldData run={run} />

      <div>
        <h3 className="text-sm font-bold mb-3">Modules</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {s.modules.map((m) => {
            const info = MODULES.find((x) => x.id === m.id)!;
            return (
              <Card key={m.id} className={`space-y-2 ${m.score === null ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{info.label}</span>
                  <span className={`font-black ${m.score === null ? 'text-xs text-slate-400' : `text-lg ${scoreColor(m.score)}`}`}>
                    {m.score ?? (m.applicable === false ? 'Not applicable' : 'Not scored')}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${scoreBg(m.score)}`} style={{ width: `${m.score ?? 0}%` }} />
                </div>
                <p className="text-[11px] text-slate-400">{info.description}</p>
                <p className="text-[10px] text-slate-500">
                  {m.basis}
                  {m.findings > 0 && ` · ${m.findings} issue(s)`}
                  {m.applicable !== false && ` · weight ${Math.round(info.weight * 100)}%`}
                </p>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Top priorities</h3>
          <button onClick={goIssues} className="text-xs text-emerald-400 hover:underline">
            All {run.findings.length} issues →
          </button>
        </div>
        {top.length === 0 && <p className="text-xs text-slate-400">No significant issues found.</p>}
        {top.map((f) => (
          <div key={f.id} className="flex items-start gap-3 border-t border-slate-800 pt-3">
            <SeverityBadge s={f.severity} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{f.title}</div>
              <div className="text-[11px] text-slate-400">
                {moduleLabel(f.module)}
                {f.pagesAffected.length > 0 && ` · ${affectedCount(f)}/${f.pagesChecked} ${unit(f)}`}
                {f.impact?.savingsMs ? ` · ~${fmtMs(f.impact.savingsMs)} savings` : ''}
              </div>
              {(f.fix?.summary || f.description) && <div className="text-xs text-slate-300 mt-1">{f.fix?.summary || f.description}</div>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function FieldData({ run }: { run: Run }) {
  const c = run.crux;
  const originField = run.psiTests.find((t) => t.result?.originField)?.result?.originField;
  if (!c && !originField) return null;
  const snap = c?.phone;
  const metrics = snap
    ? [
        ['LCP', snap.lcpMs, 'lcp', fmtMs(snap.lcpMs)],
        ['INP', snap.inpMs, 'inp', fmtMs(snap.inpMs)],
        ['CLS', snap.cls, 'cls', snap.cls ?? '—'],
        ['FCP', snap.fcpMs, 'fcp', fmtMs(snap.fcpMs)],
        ['TTFB', snap.ttfbMs, null, fmtMs(snap.ttfbMs)],
      ]
    : originField
    ? [
        ['LCP', originField.lcpMs, 'lcp', fmtMs(originField.lcpMs)],
        ['INP', originField.inpMs, 'inp', fmtMs(originField.inpMs)],
        ['CLS', originField.cls, 'cls', originField.cls ?? '—'],
        ['FCP', originField.fcpMs, 'fcp', fmtMs(originField.fcpMs)],
        ['TTFB', originField.ttfbMs, null, fmtMs(originField.ttfbMs)],
      ]
    : [];
  const hist = c?.history?.filter((h) => h.lcpMs !== null) || [];
  const maxL = Math.max(...hist.map((h) => h.lcpMs as number), 4000);
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold">Real-user Core Web Vitals (Chrome UX Report, mobile, p75)</h3>
        <span className="text-[10px] text-slate-500">
          {snap ? `Whole ${run.store?.platform?.id === 'shopify' ? 'store' : 'site'} · period ending ${snap.period || '—'}` : originField ? `Whole ${run.store?.platform?.id === 'shopify' ? 'store' : 'site'} (from PageSpeed)` : ''}
          {c?.status !== 'ok' && c?.message ? ` · CrUX API: ${c.message}` : ''}
        </span>
      </div>
      {metrics.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {metrics.map(([l, v, k, d]) => (
            <div key={l as string} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <div className="text-[10px] text-slate-400">{l}</div>
              <div className={`text-lg font-black ${k ? cwvClass(k as any, v as number) : 'text-slate-200'}`}>{d as any}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">{c?.message || 'No field data.'}</p>
      )}
      {hist.length > 2 && (
        <div>
          <div className="text-[10px] text-slate-500 mb-1">LCP trend, last {hist.length} weeks (green line = 2.5 s)</div>
          <svg viewBox={`0 0 ${hist.length * 10} 60`} className="w-full h-16" preserveAspectRatio="none" aria-label="LCP trend">
            <line x1="0" x2={hist.length * 10} y1={60 - (2500 / maxL) * 56} y2={60 - (2500 / maxL) * 56} stroke="#34d399" strokeDasharray="3 3" strokeWidth="0.6" />
            <polyline fill="none" stroke="#38bdf8" strokeWidth="1.5" points={hist.map((h, i) => `${i * 10 + 5},${60 - ((h.lcpMs as number) / maxL) * 56}`).join(' ')} />
          </svg>
        </div>
      )}
    </Card>
  );
}

// ─── Issues ─────────────────────────────────────────────────────────────────

function Issues({ run }: { run: Run }) {
  const [mod, setMod] = useState<ModuleId | 'all'>('all');
  const [sev, setSev] = useState<Severity | 'all'>('all');
  const list = run.findings.filter((f) => (mod === 'all' || f.module === mod) && (sev === 'all' || f.severity === sev));
  const modulesPresent = Array.from(new Set(run.findings.map((f) => f.module)));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <select value={mod} onChange={(e) => setMod(e.target.value as any)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1">
          <option value="all">All modules</option>
          {modulesPresent.map((m) => (
            <option key={m} value={m}>
              {moduleLabel(m)}
            </option>
          ))}
        </select>
        <select value={sev} onChange={(e) => setSev(e.target.value as any)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1">
          <option value="all">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-slate-500 self-center">{list.length} issues</span>
      </div>
      {list.map((f) => (
        <FindingCard key={f.id} f={f} handle={run.store?.handle} shopify={run.store?.platform ? run.store.platform.id === 'shopify' : true} />
      ))}
    </div>
  );
}

/** Real affected count (catalog checks store a capped URL list plus the true total). */
function affectedCount(f: Finding) {
  return f.affectedTotal ?? f.pagesAffected.length;
}
function unit(f: Finding) {
  return f.source === 'catalog' || f.source === 'owner' ? (f.description.includes('collections') ? 'collections' : 'products') : 'pages';
}

function FindingCard({ f, handle, shopify }: { f: Finding; handle?: string; shopify: boolean }) {
  const [open, setOpen] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const admin = shopify && f.fix?.adminPath && handle ? `https://admin.shopify.com/store/${handle}/${f.fix.adminPath}` : null;
  return (
    <Card className="space-y-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-start gap-3 text-left">
        {open ? <ChevronDown className="w-4 h-4 mt-0.5 text-slate-400" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400" />}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge s={f.severity} />
            <span className="text-sm font-semibold">{f.title}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {moduleLabel(f.module)} · source: {(f.sources?.length ? f.sources : [f.source]).join(' + ')}
            {f.pagesAffected.length > 0 && ` · ${affectedCount(f)} of ${f.pagesChecked} ${unit(f)}`}
            {f.impact?.savingsMs ? ` · ~${fmtMs(f.impact.savingsMs)} est. savings` : ''}
            {f.impact?.savingsBytes ? ` · ${fmtBytes(f.impact.savingsBytes)}` : ''}
          </div>
        </div>
      </button>
      {open && (
        <div className="space-y-4 pl-7">
          <p className="text-xs text-slate-300 leading-relaxed">{f.description}</p>
          {f.fix && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-2">
              <div className="text-xs font-bold text-emerald-300">How to fix{shopify ? ' in Shopify' : ''}</div>
              {f.fix.summary && <p className="text-xs text-slate-300">{f.fix.summary}</p>}
              {f.fix.where && (
                <div className="text-[11px] text-amber-200 font-mono">
                  <span className="text-slate-400">Where:</span> {f.fix.where}
                </div>
              )}
              <ol className="list-decimal pl-5 space-y-1 text-xs text-slate-200">
                {f.fix.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {f.fix.snippet && (
                <div className="space-y-1">
                  <div className="flex justify-end">
                    <CopyButton text={f.fix.snippet} label="Copy code" />
                  </div>
                  <pre className="text-[11px] font-mono bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto max-h-64">{f.fix.snippet}</pre>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {admin && (
                  <a href={admin} target="_blank" rel="noopener noreferrer" className="text-[11px] px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 inline-flex items-center gap-1">
                    Open in Shopify admin <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {f.learnMore && (
                  <a href={f.learnMore} target="_blank" rel="noopener noreferrer" className="text-[11px] px-2 py-1 rounded bg-slate-800 border border-slate-700 inline-flex items-center gap-1">
                    Google guidance <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {f.fix.docs && (
                  <a href={f.fix.docs} target="_blank" rel="noopener noreferrer" className="text-[11px] px-2 py-1 rounded bg-slate-800 border border-slate-700 inline-flex items-center gap-1">
                    Docs <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}
          {!f.fix && f.learnMore && (
            <a href={f.learnMore} target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-400 inline-flex items-center gap-1">
              Learn more (Google) <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {f.evidence.length > 0 && (
            <div>
              <button onClick={() => setShowEvidence(!showEvidence)} className="text-xs text-rose-300 font-semibold">
                {showEvidence ? '▲ Hide' : '▼ Show'} exact elements & URLs ({f.evidence.length}
                {affectedCount(f) > f.evidence.length ? `, ${affectedCount(f)} ${unit(f)}` : ''})
              </button>
              {showEvidence && (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="text-left px-3 py-1.5">Page</th>
                        <th className="text-left px-3 py-1.5">Element / resource</th>
                        <th className="text-left px-3 py-1.5">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {f.evidence.map((e, i) => (
                        <tr key={i} className="align-top">
                          <td className="px-3 py-1.5 font-mono text-slate-400 max-w-[200px] truncate" title={e.page}>
                            {e.page ? (
                              <a href={e.page} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400">
                                {shortUrl(e.page)}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-1.5 max-w-[420px]">
                            {e.label && <div className="text-slate-200">{e.label}</div>}
                            {e.url && e.url !== e.page && <div className="font-mono text-slate-400 break-all">{e.url}</div>}
                            {e.selector && <div className="font-mono text-sky-300 break-all">{e.selector}</div>}
                            {e.snippet && <code className="block font-mono text-slate-500 break-all">{e.snippet}</code>}
                          </td>
                          <td className="px-3 py-1.5 text-amber-200 whitespace-nowrap">{e.value || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {f.pagesAffected.length > 0 && (
                <div className="mt-2">
                  <CopyButton text={f.pagesAffected.join('\n')} label={`Copy ${f.pagesAffected.length} affected URLs`} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Pages ──────────────────────────────────────────────────────────────────

function Pages({ run }: { run: Run }) {
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      run.targets.map((t) => {
        const m = run.psiTests.find((x) => x.url === t.url && x.strategy === 'mobile');
        const d = run.psiTests.find((x) => x.url === t.url && x.strategy === 'desktop');
        const c = run.crawl.find((x) => sameUrl(x.url, t.url));
        const issues = run.findings.filter((f) => f.pagesAffected.includes(t.url)).length;
        return { ...t, m, d, c, issues };
      }),
    [run]
  );
  const sel = rows.find((r) => r.url === selected);
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-xs min-w-[900px]">
          <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
            <tr>
              <th className="text-left px-3 py-2">URL</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="px-3 py-2">Perf (m)</th>
              <th className="px-3 py-2">Perf (d)</th>
              <th className="px-3 py-2">LCP</th>
              <th className="px-3 py-2">TBT</th>
              <th className="px-3 py-2">CLS</th>
              <th className="px-3 py-2">A11y</th>
              <th className="px-3 py-2">SEO</th>
              <th className="px-3 py-2">HTML</th>
              <th className="px-3 py-2">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rows.map((r) => {
              const res = r.m?.result || r.d?.result;
              return (
                <tr key={r.url} onClick={() => setSelected(r.url)} className="hover:bg-slate-900/60 cursor-pointer">
                  <td className="px-3 py-2 font-mono text-slate-200 max-w-[320px] truncate" title={r.url}>
                    {shortUrl(r.url)}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{r.type}</td>
                  <PsiCell t={r.m} k="performance" />
                  <PsiCell t={r.d} k="performance" />
                  <td className={`px-3 py-2 text-center ${cwvClass('lcp', res?.lab.lcpMs)}`}>{fmtMs(res?.lab.lcpMs)}</td>
                  <td className={`px-3 py-2 text-center ${cwvClass('tbt', res?.lab.tbtMs)}`}>{fmtMs(res?.lab.tbtMs)}</td>
                  <td className={`px-3 py-2 text-center ${cwvClass('cls', res?.lab.cls)}`}>{res?.lab.cls ?? '—'}</td>
                  <PsiCell t={r.m || r.d} k="accessibility" />
                  <PsiCell t={r.m || r.d} k="seo" />
                  <td className="px-3 py-2 text-center">
                    {r.c ? <span className={r.c.error ? 'text-rose-400' : 'text-emerald-400'}>{r.c.error ? (r.c.rateLimited ? '429' : r.c.status || 'ERR') : r.c.status}</span> : <span className="text-slate-600">—</span>}
                    {r.c?.cachedFrom && (
                      <span className="block text-[10px] text-amber-300" title={`Blocked by Shopify in this run; data from the crawl of ${new Date(r.c.cachedFrom.crawledAt).toLocaleString()}`}>
                        cached
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-300">{r.issues}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sel && <PageDrawer row={sel} run={run} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PsiCell({ t, k }: { t?: PageSpeedTest; k: 'performance' | 'accessibility' | 'seo' }) {
  if (!t) return <td className="px-3 py-2 text-center text-slate-600">—</td>;
  if (t.status !== 'done') return <td className="px-3 py-2 text-center text-rose-400" title={t.error}>{t.status === 'failed' ? 'fail' : '…'}</td>;
  const v = t.result!.scores[k];
  return <td className={`px-3 py-2 text-center font-bold ${scoreColor(v)}`}>{v ?? '—'}</td>;
}

function PageDrawer({ row, run, onClose }: { row: any; run: Run; onClose: () => void }) {
  const [st, setSt] = useState<Strategy>(row.m ? 'mobile' : 'desktop');
  const t: PageSpeedTest | undefined = st === 'mobile' ? row.m : row.d;
  const res = t?.result;
  const shot = (row.m?.result?.screenshot as string | undefined) || undefined;
  return (
    <Card className="space-y-4 border-emerald-500/30">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-emerald-300 break-all hover:underline">
            {row.url}
          </a>
          <div className="text-[11px] text-slate-400">{row.type}</div>
        </div>
        <div className="flex gap-1">
          {(['mobile', 'desktop'] as Strategy[]).map((s) => (
            <button key={s} onClick={() => setSt(s)} className={`text-[11px] px-2 py-1 rounded ${st === s ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
              {s}
            </button>
          ))}
        </div>
        <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      {!res && <p className="text-xs text-rose-300">{t ? `PageSpeed test ${t.status}: ${t.error || ''}` : 'Not tested for this strategy.'}</p>}
      {res && (
        <div className="grid lg:grid-cols-4 gap-4">
          {shot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shotUrl(run.id, shot)} alt="Mobile screenshot" className="rounded-lg border border-slate-800 w-full max-w-[220px]" />
          )}
          <div className={`${shot ? 'lg:col-span-3' : 'lg:col-span-4'} space-y-3`}>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ['Performance', res.scores.performance],
                  ['Accessibility', res.scores.accessibility],
                  ['Best practices', res.scores.bestPractices],
                  ['SEO', res.scores.seo],
                ] as Array<[string, number | null]>
              ).map(([l, v]) => (
                <div key={l} className="flex items-center gap-2">
                  <ScoreRing score={v} size={48} />
                  <span className="text-[11px] text-slate-400">{l}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px]">
              {(
                [
                  ['LCP', fmtMs(res.lab.lcpMs), cwvClass('lcp', res.lab.lcpMs)],
                  ['TBT', fmtMs(res.lab.tbtMs), cwvClass('tbt', res.lab.tbtMs)],
                  ['CLS', res.lab.cls ?? '—', cwvClass('cls', res.lab.cls)],
                  ['FCP', fmtMs(res.lab.fcpMs), cwvClass('fcp', res.lab.fcpMs)],
                  ['Speed Index', fmtMs(res.lab.siMs), 'text-slate-200'],
                  ['URL field LCP', fmtMs(res.field?.lcpMs), cwvClass('lcp', res.field?.lcpMs)],
                ] as Array<[string, any, string]>
              ).map(([l, v, c]) => (
                <div key={l} className="bg-slate-950/60 border border-slate-800 rounded-lg p-2">
                  <div className="text-slate-500">{l}</div>
                  <div className={`font-bold ${c}`}>{v}</div>
                </div>
              ))}
            </div>
            {res.lcpElement?.selector && (
              <p className="text-[11px] text-slate-400">
                LCP element: <code className="text-sky-300">{res.lcpElement.selector}</code>
              </p>
            )}
            <div className="text-[11px] text-slate-500">Lighthouse {res.lighthouseVersion} · {new Date(res.fetchedAt).toLocaleString()}</div>
          </div>
        </div>
      )}
      {res && res.failedAudits.length > 0 && (
        <div>
          <div className="text-xs font-bold mb-2">Failed Lighthouse audits on this page ({res.failedAudits.length})</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {res.failedAudits
              .slice()
              .sort((a, b) => b.savingsMs - a.savingsMs || b.weight - a.weight)
              .map((a) => (
                <div key={a.id} className="text-[11px] bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                  <div className="text-slate-200">{a.title}</div>
                  <div className="text-slate-500">
                    {a.category}
                    {a.displayValue ? ` · ${a.displayValue}` : ''}
                    {a.savingsMs ? ` · ~${fmtMs(a.savingsMs)}` : ''}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
      {row.c && !row.c.error && (
        <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
          <Info l="Title" v={row.c.title || '—'} />
          <Info l="Meta description" v={row.c.metaDescription || '— missing —'} />
          <Info l="H1" v={`${row.c.h1 || '—'} (${row.c.h1Count} H1s)`} />
          <Info l="Canonical" v={`${row.c.canonicalStatus}${row.c.canonical ? ` → ${row.c.canonical}` : ''}`} />
          <Info l="Schema types" v={row.c.schemaTypes.join(', ') || 'none'} />
          <Info l="Schema findings" v={row.c.schemaFindings.join(', ') || 'none'} />
          <Info l="Words / images" v={`${row.c.wordCount} words · ${row.c.totalImages} images (${row.c.imagesMissingAlt} without alt)`} />
          <Info l="Robots" v={row.c.metaRobots || 'index'} />
        </div>
      )}
    </Card>
  );
}

function Info({ l, v }: { l: string; v: string }) {
  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
      <div className="text-slate-500">{l}</div>
      <div className="text-slate-200 break-words">{v}</div>
    </div>
  );
}

// ─── Apps ───────────────────────────────────────────────────────────────────

function Apps({ run }: { run: Run }) {
  if (!run.apps.length) return <Card className="text-xs text-slate-400">No third-party apps detected.</Card>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Cost measured by Lighthouse on the mobile tests (main-thread time and blocking time per page). Apps marked “HTML only” were detected in page source but Lighthouse did not attribute
        cost to them.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-xs">
          <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
            <tr>
              <th className="text-left px-3 py-2">App / third party</th>
              <th className="text-left px-3 py-2">Category</th>
              <th className="px-3 py-2">Pages</th>
              <th className="px-3 py-2">Main thread</th>
              <th className="px-3 py-2">Blocking</th>
              <th className="px-3 py-2">Transfer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {run.apps.map((a) => {
              const measured = a.detectedBy.includes('lighthouse');
              return (
                <tr key={a.name}>
                  <td className="px-3 py-2 text-slate-200">{a.name}</td>
                  <td className="px-3 py-2 text-slate-400">{a.category}</td>
                  <td className="px-3 py-2 text-center text-slate-300">
                    {a.pages}/{a.pagesTested}
                  </td>
                  <td className={`px-3 py-2 text-center ${a.avgMainThreadMs >= 500 ? 'text-rose-400' : a.avgMainThreadMs >= 200 ? 'text-amber-400' : 'text-slate-300'}`}>{measured ? `${a.avgMainThreadMs} ms` : 'HTML only'}</td>
                  <td className={`px-3 py-2 text-center ${a.avgBlockingMs >= 250 ? 'text-rose-400' : a.avgBlockingMs >= 100 ? 'text-amber-400' : 'text-slate-300'}`}>{measured ? `${a.avgBlockingMs} ms` : '—'}</td>
                  <td className="px-3 py-2 text-center text-slate-300">{measured ? `${a.avgTransferKb} KB` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Site checks ────────────────────────────────────────────────────────────

function Site({ run }: { run: Run }) {
  const s = run.site;
  const d = run.discovery;
  if (!s) return <Card className="text-xs text-slate-400">Site checks did not run.</Card>;
  const yes = (b: boolean) => <span className={b ? 'text-emerald-400' : 'text-rose-400'}>{b ? 'Yes' : 'No'}</span>;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="space-y-2 text-xs">
        <h3 className="font-bold text-sm">Discovery</h3>
        {d && (
          <>
            <p>Sitemap found: {yes(d.sitemapFound)}</p>
            <p className="text-slate-300">
              {d.products} products · {d.collections} collections · {d.pages} pages · {d.articles} articles · {d.blogs} blogs
            </p>
            {d.brokenSitemaps > 0 && <p className="text-rose-300">{d.brokenSitemaps} child sitemaps failed</p>}
          </>
        )}
        <p>robots.txt: {yes(s.robots.found)} · references sitemap: {yes(s.robots.hasSitemap)}</p>
        <p>
          Search pages: {s.searchPage ? `HTTP ${s.searchPage.status}, noindex ${s.searchPage.noindex ? 'yes' : 'no'}, disallowed ${s.searchPage.disallowed ? 'yes' : 'no'}` : run.store?.platform?.id === 'shopify' ? 'could not be checked' : 'not applicable (Shopify /search route)'}
        </p>
      </Card>
      <Card className="space-y-2 text-xs">
        <h3 className="font-bold text-sm inline-flex items-center gap-1.5">
          <Bot className="w-4 h-4" /> AI crawler access
        </h3>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(s.robots.aiBots).map(([b, v]) => (
            <div key={b} className="flex justify-between bg-slate-950/60 rounded px-2 py-1">
              <span className="font-mono">{b}</span>
              <span className={v === 'blocked' ? 'text-rose-400' : 'text-emerald-400'}>{v}</span>
            </div>
          ))}
        </div>
        <p>llms.txt: {yes(s.llmsTxt.found)}</p>
      </Card>
      <Card className="space-y-2 text-xs">
        <h3 className="font-bold text-sm">Security headers (homepage)</h3>
        <p>HTTPS: {yes(s.https)}</p>
        {Object.entries(s.headers).map(([h, v]) => (
          <div key={h} className="flex justify-between gap-2 bg-slate-950/60 rounded px-2 py-1">
            <span className="font-mono">{h}</span>
            <span className={`truncate max-w-[55%] ${v ? 'text-emerald-300' : 'text-slate-500'}`} title={v || ''}>
              {v || 'missing'}
            </span>
          </div>
        ))}
        <p>Consent banner: {s.consentBanner || <span className="text-slate-500">not detected in HTML</span>}</p>
      </Card>
      <Card className="space-y-2 text-xs">
        <h3 className="font-bold text-sm">Policies & international</h3>
        {Object.keys(s.policies).length === 0 && <p className="text-slate-400">Shopify policy pages: not applicable (not a Shopify store).</p>}
        {Object.entries(s.policies).map(([p, st]) => (
          <div key={p} className="flex justify-between bg-slate-950/60 rounded px-2 py-1">
            <span className="font-mono">{p}</span>
            <span className={st === 200 ? 'text-emerald-400' : 'text-rose-400'}>{st || 'error'}</span>
          </div>
        ))}
        <p className="pt-2">
          hreflang alternates: {s.hreflang.count} · x-default: {yes(s.hreflang.hasXDefault)} · self-reference: {yes(s.hreflang.selfReference)}
        </p>
        {s.hreflang.codes.length > 0 && <p className="text-slate-400 break-words">{s.hreflang.codes.join(', ')}</p>}
      </Card>
    </div>
  );
}

function ComparisonCard({ run }: { run: Run }) {
  const c = run.comparison!;
  const delta = (d: number | null) =>
    d === null ? <span className="text-slate-500">—</span> : <span className={d > 0 ? 'text-emerald-400' : d < 0 ? 'text-rose-400' : 'text-slate-400'}>{d > 0 ? `+${d}` : d}</span>;
  return (
    <Card className={`space-y-3 ${c.regression ? 'border-rose-500/40 bg-rose-500/5' : ''}`}>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {c.regression ? <TrendingDown className="w-4 h-4 text-rose-400" /> : <TrendingUp className="w-4 h-4 text-emerald-400" />}
        <span className="font-bold text-sm">{c.regression ? 'Regression since the previous run' : 'Compared with the previous run'}</span>
        <Link href={`/runs/${c.previousId}`} className="text-slate-400 hover:text-emerald-400">
          {new Date(c.previousAt).toLocaleString()}
        </Link>
        <span className="ml-auto">Overall {delta(c.overallDelta)} · Mobile performance {delta(c.mobilePerfDelta)}</span>
      </div>
      {c.reasons.length > 0 && (
        <ul className="text-xs text-rose-200 space-y-0.5">
          {c.reasons.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>
      )}
      {c.notes?.map((n, i) => (
        <p key={i} className="text-[11px] text-slate-400">
          {n}
        </p>
      ))}
      {run.alert && (
        <p className="text-[11px] text-slate-400">
          Alert {run.alert.sent ? `sent to ${run.alert.target}` : `not sent: ${run.alert.error}`}
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-3 text-[11px]">
        <div>
          <div className="text-slate-400 mb-1">New issues ({c.newFindings.length})</div>
          {c.newFindings.slice(0, 8).map((f) => (
            <div key={f.id} className="flex gap-2 items-center py-0.5">
              <SeverityBadge s={f.severity} /> <span className="text-slate-200">{f.title}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="text-slate-400 mb-1">Resolved ({c.resolvedFindings.length})</div>
          {c.resolvedFindings.slice(0, 8).map((f) => (
            <div key={f.id} className="flex gap-2 items-center py-0.5 text-slate-400 line-through">
              {f.title}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        {c.moduleDeltas
          .filter((m) => m.from !== null && m.to !== null && m.from !== m.to)
          .map((m) => (
            <span key={m.id} className="px-2 py-0.5 rounded bg-slate-950/60 border border-slate-800">
              {moduleLabel(m.id)} {m.from} → {m.to} {delta((m.to as number) - (m.from as number))}
            </span>
          ))}
      </div>
    </Card>
  );
}

/** "https://s.com" and "https://s.com/" are the same page. */
function sameUrl(a: string, b: string) {
  const n = (u: string) => {
    try {
      const x = new URL(u);
      return `${x.origin}${x.pathname.replace(/\/+$/, '')}${x.search}`;
    } catch {
      return u.replace(/\/+$/, '');
    }
  };
  return n(a) === n(b);
}
