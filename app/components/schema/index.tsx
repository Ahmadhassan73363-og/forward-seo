'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, CircleDashed, FlaskConical, Loader2, Plus, RotateCcw, TriangleAlert, X, XCircle } from 'lucide-react';
import type { Run } from '@/lib/engine/types';
import type { ChecklistRule, PageSchema } from '@/lib/engine/schema/types';
import { buildSchemaReport, DEFAULT_CHECKLIST, parseChecklistLine, TEMPLATES, type ChecklistRow, type ScanPage } from '@/lib/engine/schema/report';
import { snippetFor } from '@/lib/engine/schema/snippets';
import { Card, CopyButton, shortUrl } from '../ui';
import { SourceBadge } from '../shared/source';
import { Counts, FORMAT_LABEL, FormatBadge, PageItems } from './tree';

/*
 * Schema tab: every schema.org item the crawl found (JSON-LD, Microdata, RDFa), validated against
 * Google's requirements, plus an editable checklist of what each page template should carry.
 * Everything here is computed in the browser from the crawl; the checklist edits live in this
 * browser only.
 */

const TEMPLATE_LABEL = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.label]));
const STORE_KEY = 'schema-checklist-v1';

type Saved = { removed: string[]; custom: ChecklistRule[] };

function loadSaved(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { removed: Array.isArray(s.removed) ? s.removed : [], custom: Array.isArray(s.custom) ? s.custom : [] };
  } catch {
    return { removed: [], custom: [] };
  }
}

function saveSaved(s: Saved) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {}
}

export function SchemaTab({ run }: { run: Run }) {
  const pages: ScanPage[] = useMemo(
    () => run.crawl.filter((p) => !p.error && !p.rateLimited && !p.blocked).map((p) => ({ url: p.url, type: p.type, hasFaq: p.hasFaq, schema: p.schema })),
    [run.crawl]
  );
  const [saved, setSaved] = useState<Saved>({ removed: [], custom: [] });
  useEffect(() => setSaved(loadSaved()), []);
  const update = (s: Saved) => {
    setSaved(s);
    saveSaved(s);
  };
  const rules = useMemo(() => [...DEFAULT_CHECKLIST.filter((r) => !saved.removed.includes(r.id)), ...saved.custom], [saved]);
  const report = useMemo(() => buildSchemaReport(pages, rules), [pages, rules]);
  const scannedPages = pages.filter((p) => p.schema);
  const notScanned = pages.length - scannedPages.length;
  const shopify = run.store?.platform?.id === 'shopify';
  const homeUrl = pages.find((p) => p.type === 'home')?.url || `https://${run.store?.host || ''}/`;
  const siteName = useMemo(() => {
    for (const p of scannedPages) for (const i of p.schema!.items) if (['Organization', 'OnlineStore', 'WebSite'].includes(i.type) && typeof i.data?.name === 'string') return i.data.name as string;
    return undefined;
  }, [scannedPages]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-neutral-900">Structured data</h2>
        <SourceBadge id="audit" label="This audit’s crawl" />
        <span className="text-[11px] text-neutral-500">JSON-LD, Microdata and RDFa in each page’s HTML, checked against Google’s rules</span>
      </div>

      {!scannedPages.length ? (
        <Card className="text-sm text-neutral-700 space-y-1">
          <p className="font-medium">No page of this audit has a full schema scan.</p>
          <p className="text-xs text-neutral-500">{pages.length ? 'This audit ran before the schema scan was added. Run a new audit, or test any URL below.' : 'No page was crawled successfully. Test a URL below.'}</p>
        </Card>
      ) : (
        <Summary report={report} pages={scannedPages.length} notScanned={notScanned} />
      )}

      <UrlTest defaultUrl={homeUrl} />

      {scannedPages.length > 0 && (
        <>
          <Checklist rows={report.checklist} saved={saved} update={update} shopify={shopify} homeUrl={homeUrl} siteName={siteName} />
          <Issues report={report} />
          <TypesTable report={report} />
          <PageBrowser pages={scannedPages} run={run} />
          {report.notes.length > 0 && (
            <Card className="space-y-1.5">
              <h3 className="text-sm font-semibold">Notes</h3>
              {report.notes.map((n) => (
                <p key={n} className="text-xs text-neutral-600 leading-snug">{n}</p>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── summary ────────────────────────────────────────────────────────────────

function Summary({ report, pages, notScanned }: { report: ReturnType<typeof buildSchemaReport>; pages: number; notScanned: number }) {
  const formats = (Object.keys(report.formats) as Array<keyof typeof report.formats>).filter((f) => report.formats[f]);
  return (
    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
      <Card className="space-y-3">
        <div className="flex items-start gap-2">
          {report.items ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-brand mt-0.5 shrink-0" />}
          <div>
            <p className="text-sm text-neutral-900">
              Found <strong>{report.items}</strong> schema item{report.items === 1 ? '' : 's'} ({report.types.length} type{report.types.length === 1 ? '' : 's'}) on <strong>{report.withSchema}</strong> of {pages} pages
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {formats.length ? `Format: ${formats.map((f) => `${FORMAT_LABEL[f]} (${report.formats[f]})`).join(', ')}` : 'No structured data found'}
              {notScanned > 0 && ` · ${notScanned} crawled page${notScanned === 1 ? '' : 's'} from an older crawl not scanned`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {report.types.map((t) => (
            <span key={t.type} title={`${t.items} item(s) on ${t.pages} page(s)`} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border ${t.errors ? 'border-brand/30 bg-brand/[0.06] text-brand' : t.warnings ? 'border-amber-500/30 bg-amber-500/[0.07] text-amber-800' : 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-800'}`}>
              {t.type}
              {t.errors ? <XCircle className="w-3.5 h-3.5" aria-label="has errors" /> : t.warnings ? <TriangleAlert className="w-3.5 h-3.5" aria-label="has warnings" /> : <CheckCircle2 className="w-3.5 h-3.5" aria-label="valid" />}
              <span className="text-[10px] opacity-70 tabular-nums">×{t.items}</span>
            </span>
          ))}
        </div>
        {report.features.length > 0 && (
          <div className="pt-2 border-t border-neutral-900/[0.06]">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">Eligible Google features</p>
            <div className="flex flex-wrap gap-1.5">
              {report.features.map((f) => (
                <span key={f.feature} className="text-[11px] px-2 py-0.5 rounded-full bg-white/80 border border-neutral-200 text-neutral-700">
                  {f.feature} <span className="text-neutral-400 tabular-nums">· {f.pages} page{f.pages === 1 ? '' : 's'}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>
      <Card className="space-y-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Validation results</h3>
        <div className="grid grid-cols-3 gap-2">
          <Tile n={report.valid} label="Fields valid" tone="ok" />
          <Tile n={report.warnings} label="Warnings" tone="warn" />
          <Tile n={report.errors} label="Errors" tone="err" />
        </div>
        <p className="text-[11px] text-neutral-500 leading-snug">Errors stop an item from showing as a rich result. Warnings are recommended properties or values worth fixing.</p>
      </Card>
    </div>
  );
}

function Tile({ n, label, tone }: { n: number; label: string; tone: 'ok' | 'warn' | 'err' }) {
  const s = tone === 'ok' ? 'bg-emerald-500/[0.08] text-emerald-700 border-emerald-500/20' : tone === 'warn' ? (n ? 'bg-amber-500/10 text-amber-700 border-amber-500/25' : 'bg-white/60 text-neutral-400 border-neutral-200') : n ? 'bg-brand/[0.08] text-brand border-brand/25' : 'bg-white/60 text-neutral-400 border-neutral-200';
  return (
    <div className={`rounded-lg border px-2 py-3 text-center ${s}`}>
      <p className="text-2xl font-semibold tabular-nums leading-none">{n.toLocaleString()}</p>
      <p className="text-[11px] mt-1.5 text-neutral-600">{label}</p>
    </div>
  );
}

// ─── test a URL ─────────────────────────────────────────────────────────────

function UrlTest({ defaultUrl }: { defaultUrl: string }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ error?: string; finalUrl?: string; type?: string; schema?: PageSchema; truncated?: boolean } | null>(null);
  const test = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = url.trim() || defaultUrl;
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch('/api/schema', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: target }) });
      setRes(await r.json());
    } catch {
      setRes({ error: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  };
  const s = res?.schema;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-brand" />
        <h3 className="text-sm font-semibold">Test a URL</h3>
        <span className="text-[11px] text-neutral-500">Any page: fetched now, nothing saved</span>
      </div>
      <form onSubmit={test} className="flex gap-2">
        <label className="sr-only" htmlFor="schema-url">Page URL</label>
        <input id="schema-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={defaultUrl} className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg border border-neutral-300 bg-white/80 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-white bg-gradient-to-b from-brand-500 to-brand-700 shadow-[0_6px_16px_-6px_rgba(183,18,52,0.6)] disabled:opacity-60">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Test
        </button>
      </form>
      {res?.error && <p className="text-xs text-brand">{res.error}</p>}
      {s && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <a href={res!.finalUrl} target="_blank" rel="noreferrer" className="font-medium text-neutral-900 hover:text-brand break-all">{res!.finalUrl}</a>
            <span className="text-neutral-500">{TEMPLATE_LABEL[res!.type || 'other'] || res!.type}</span>
            <span className="ml-auto">
              <Counts valid={s.items.reduce((a, i) => a + i.valid, 0)} warnings={s.items.reduce((a, i) => a + i.issues.filter((x) => x.level === 'warning').length, 0)} errors={s.items.reduce((a, i) => a + i.issues.filter((x) => x.level === 'error').length, 0) + s.invalid.length} />
            </span>
          </div>
          {res!.truncated && <p className="text-[11px] text-amber-700">The page is over 6 MB; only the first 6 MB were read.</p>}
          <PageItems schema={s} url={res!.finalUrl} />
        </div>
      )}
    </Card>
  );
}

// ─── checklist ──────────────────────────────────────────────────────────────

const STATUS: Record<ChecklistRow['status'], { icon: React.ReactNode; label: string }> = {
  pass: { icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />, label: 'Present' },
  partial: { icon: <TriangleAlert className="w-4 h-4 text-amber-600" />, label: 'On some pages' },
  fail: { icon: <XCircle className="w-4 h-4 text-brand" />, label: 'Missing' },
  na: { icon: <CircleDashed className="w-4 h-4 text-neutral-400" />, label: 'No pages of this type crawled' },
};

function Checklist({ rows, saved, update, shopify, homeUrl, siteName }: { rows: ChecklistRow[]; saved: Saved; update: (s: Saved) => void; shopify: boolean; homeUrl: string; siteName?: string }) {
  const [line, setLine] = useState('');
  const [tpl, setTpl] = useState('product');
  const [level, setLevel] = useState<'required' | 'recommended'>('recommended');
  const [error, setError] = useState('');
  const counted = rows.filter((r) => r.status !== 'na');
  const passed = counted.filter((r) => r.status === 'pass').length;
  const edited = saved.removed.length > 0 || saved.custom.length > 0;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const rule = parseChecklistLine(`${tpl}${level === 'required' ? '!' : ':'} ${line}`);
    if (!rule) return setError('Type schema.org type names separated by commas, e.g. "Product, ProductGroup".');
    if ([...DEFAULT_CHECKLIST, ...saved.custom].some((r) => r.template === rule.template && r.anyOf.join() === rule.anyOf.join() && !saved.removed.includes(r.id))) return setError('That requirement is already on the list.');
    setError('');
    setLine('');
    update({ ...saved, custom: [...saved.custom.filter((r) => r.id !== rule.id), rule], removed: saved.removed.filter((id) => id !== rule.id) });
  };
  const remove = (r: ChecklistRule) => update(r.custom ? { ...saved, custom: saved.custom.filter((c) => c.id !== r.id) } : { ...saved, removed: [...saved.removed, r.id] });

  const groups = TEMPLATES.map((t) => ({ t, rows: rows.filter((r) => r.rule.template === t.id) })).filter((g) => g.rows.length);
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Schema checklist</h3>
        <span className="text-[11px] text-neutral-500 tabular-nums">{passed} of {counted.length} present on every page</span>
        {edited && (
          <button type="button" onClick={() => update({ removed: [], custom: [] })} className="ml-auto inline-flex items-center gap-1 text-[11px] text-neutral-600 hover:text-brand">
            <RotateCcw className="w-3 h-3" /> Reset to defaults
          </button>
        )}
      </div>
      <div className="space-y-3">
        {groups.map(({ t, rows }) => (
          <div key={t.id}>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{t.label}</p>
            <ul className="divide-y divide-neutral-900/[0.06] rounded-lg glass-inset">
              {rows.map((r) => (
                <ChecklistItem key={r.rule.id} row={r} onRemove={() => remove(r.rule)} shopify={shopify} homeUrl={homeUrl} siteName={siteName} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="flex flex-wrap gap-2 items-center pt-1">
        <label className="sr-only" htmlFor="ck-tpl">Page type</label>
        <select id="ck-tpl" value={tpl} onChange={(e) => setTpl(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border border-neutral-300 bg-white/80">
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="ck-types">Schema types</label>
        <input id="ck-types" value={line} onChange={(e) => setLine(e.target.value)} placeholder="Types, e.g. VideoObject or Product, ProductGroup" className="flex-1 min-w-[180px] text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white/80 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
        <label className="sr-only" htmlFor="ck-level">Level</label>
        <select id="ck-level" value={level} onChange={(e) => setLevel(e.target.value as any)} className="text-xs px-2 py-1.5 rounded-lg border border-neutral-300 bg-white/80">
          <option value="required">Required</option>
          <option value="recommended">Recommended</option>
        </select>
        <button type="submit" className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/40 text-brand bg-white/80 hover:bg-brand hover:text-white">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
        {error && <p className="w-full text-[11px] text-brand">{error}</p>}
        <p className="w-full text-[11px] text-neutral-500">Several types separated by commas mean “any one of these”. Your changes are kept in this browser.</p>
      </form>
    </Card>
  );
}

function ChecklistItem({ row, onRemove, shopify, homeUrl, siteName }: { row: ChecklistRow; onRemove: () => void; shopify: boolean; homeUrl: string; siteName?: string }) {
  const [open, setOpen] = useState(false);
  const r = row.rule;
  const snippet = row.status === 'fail' || row.status === 'partial' ? snippetFor(r.anyOf, r.template === '*' ? 'page' : r.template, { shopify, homeUrl, siteName }) : null;
  const canOpen = !!snippet || row.missing.length > 0;
  return (
    <li className="px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5" title={STATUS[row.status].label}>{STATUS[row.status].icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-neutral-900">{r.anyOf.join(' or ')}</span>
            <span className={`text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${r.level === 'required' ? 'bg-brand/10 text-brand' : 'bg-neutral-900/[0.06] text-neutral-600'}`}>{r.level}</span>
            {r.custom && <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700">yours</span>}
            {r.when === 'hasFaq' && <span className="text-[10px] text-neutral-500">pages with FAQ content</span>}
          </div>
          {r.why && <p className="text-[11px] text-neutral-500 leading-snug mt-0.5">{r.why}</p>}
        </div>
        <span className={`text-[11px] tabular-nums shrink-0 ${row.status === 'pass' ? 'text-emerald-700' : row.status === 'partial' ? 'text-amber-700' : row.status === 'fail' ? 'text-brand' : 'text-neutral-400'}`}>
          {row.status === 'na' ? '—' : `${row.passing} of ${row.pages}`}
        </span>
        {canOpen && (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-[11px] text-neutral-600 hover:text-brand inline-flex items-center shrink-0">
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {snippet ? 'Fix' : 'Pages'}
          </button>
        )}
        <button type="button" onClick={onRemove} title="Remove from checklist" aria-label={`Remove ${r.anyOf.join(' or ')} from the checklist`} className="text-neutral-400 hover:text-brand shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <div className="mt-2 ml-6 space-y-2">
          {row.missing.length > 0 && (
            <div>
              <p className="text-[11px] text-neutral-500 mb-0.5">Missing on:</p>
              <ul className="text-[11px] space-y-0.5">
                {row.missing.slice(0, 10).map((u) => (
                  <li key={u}><a href={u} target="_blank" rel="noreferrer" className="text-neutral-700 hover:text-brand break-all">{shortUrl(u)}</a></li>
                ))}
                {row.missing.length > 10 && <li className="text-neutral-500">and {row.missing.length - 10} more</li>}
              </ul>
            </div>
          )}
          {snippet && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] text-neutral-700"><span className="font-semibold">Starter {snippet.language === 'liquid' ? 'Liquid' : 'JSON-LD'}: {snippet.title}</span> · add to {snippet.where}</p>
                <span className="ml-auto"><CopyButton text={snippet.code} /></span>
              </div>
              <pre className="font-mono text-[11px] leading-[1.5] whitespace-pre-wrap break-all bg-white/80 border border-neutral-200 rounded-md p-2.5 max-h-72 overflow-auto text-neutral-800">{snippet.code}</pre>
              {snippet.note && <p className="text-[11px] text-neutral-500 leading-snug">{snippet.note}</p>}
            </div>
          )}
          {!snippet && (r.anyOf.includes('AggregateRating') || r.anyOf.includes('Review')) && <p className="text-[11px] text-neutral-500">Ratings must come from real reviews shown on the page; turn on rich snippets in your reviews app (Judge.me, Yotpo, Okendo …).</p>}
        </div>
      )}
    </li>
  );
}

// ─── issues ─────────────────────────────────────────────────────────────────

function Issues({ report }: { report: ReturnType<typeof buildSchemaReport> }) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (!report.issues.length) return null;
  const list = report.issues.filter((i) => filter === 'all' || i.level === filter);
  const shown = showAll ? list : list.slice(0, 15);
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Issues across the site</h3>
        <div className="ml-auto inline-flex rounded-lg bg-neutral-900/[0.06] p-0.5" role="tablist" aria-label="Filter issues">
          {(['all', 'error', 'warning'] as const).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`text-[11px] px-2.5 py-1 rounded-md ${filter === f ? 'bg-white text-neutral-900 font-semibold shadow-sm' : 'text-neutral-600'}`}>
              {f === 'all' ? `All (${report.issues.length})` : f === 'error' ? `Errors (${report.issues.filter((i) => i.level === 'error').length})` : `Warnings (${report.issues.filter((i) => i.level === 'warning').length})`}
            </button>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-neutral-900/[0.06]">
        {shown.map((g, k) => (
          <li key={k} className="py-2">
            <button type="button" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k} className="w-full flex items-start gap-2 text-left">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${g.level === 'error' ? 'bg-brand' : 'bg-amber-500'}`} aria-label={g.level} />
              <span className="flex-1 min-w-0 text-xs leading-snug">
                <span className="font-semibold text-neutral-900">{g.type}</span>
                {g.path && <code className="font-mono text-[11px] text-neutral-500 ml-1.5">{g.path}</code>}
                <span className="block text-neutral-700">{g.message}</span>
              </span>
              <span className="text-[11px] text-neutral-500 tabular-nums shrink-0">{g.pages.length} page{g.pages.length === 1 ? '' : 's'}</span>
            </button>
            {open === k && (
              <ul className="mt-1.5 ml-4 text-[11px] space-y-0.5">
                {g.pages.slice(0, 20).map((u) => (
                  <li key={u}><a href={u} target="_blank" rel="noreferrer" className="text-neutral-700 hover:text-brand break-all">{shortUrl(u)}</a></li>
                ))}
                {g.pages.length > 20 && <li className="text-neutral-500">and {g.pages.length - 20} more</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {list.length > 15 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="text-[11px] text-brand">
          {showAll ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </Card>
  );
}

// ─── types ──────────────────────────────────────────────────────────────────

function TypesTable({ report }: { report: ReturnType<typeof buildSchemaReport> }) {
  if (!report.types.length) return null;
  return (
    <Card className="space-y-2">
      <h3 className="text-sm font-semibold">Types found</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-neutral-500 text-[10px] uppercase">
            <tr>
              <th className="text-left py-1 pr-3">Type</th>
              <th className="text-left py-1 pr-3">Format</th>
              <th className="text-right py-1 pr-3">Items</th>
              <th className="text-right py-1 pr-3">Pages</th>
              <th className="text-right py-1">Valid · warnings · errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-900/[0.06]">
            {report.types.map((t) => (
              <tr key={t.type}>
                <td className="py-1.5 pr-3 font-medium text-neutral-900">{t.type}</td>
                <td className="py-1.5 pr-3"><span className="inline-flex gap-1">{t.formats.map((f) => <FormatBadge key={f} f={f} />)}</span></td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{t.items}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{t.pages}</td>
                <td className="py-1.5 text-right"><Counts valid={t.valid} warnings={t.warnings} errors={t.errors} size="xs" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── per-page browser ───────────────────────────────────────────────────────

function PageBrowser({ pages, run }: { pages: ScanPage[]; run: Run }) {
  const order = ['home', 'product', 'collection', 'article', 'blog', 'page', 'other'];
  const sorted = useMemo(() => [...pages].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)), [pages]);
  const [url, setUrl] = useState(sorted[0]?.url);
  const page = sorted.find((p) => p.url === url) || sorted[0];
  if (!page) return null;
  const js = run.browser?.pages.find((b) => b.url === page.url)?.jsInjectedSchema || [];
  const label = (p: ScanPage) => {
    const n = p.schema!.items.length;
    const e = p.schema!.items.reduce((a, i) => a + i.issues.filter((x) => x.level === 'error').length, 0) + p.schema!.invalid.length;
    return `${TEMPLATE_LABEL[p.type] || p.type} · ${shortUrl(p.url)} · ${n} item${n === 1 ? '' : 's'}${e ? ` · ${e} error${e === 1 ? '' : 's'}` : ''}`;
  };
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Schema tree by page</h3>
        <label className="sr-only" htmlFor="schema-page">Page</label>
        <select id="schema-page" value={page.url} onChange={(e) => setUrl(e.target.value)} className="ml-auto max-w-full text-xs px-2 py-1.5 rounded-lg border border-neutral-300 bg-white/80">
          {sorted.map((p) => (
            <option key={p.url} value={p.url}>{label(p)}</option>
          ))}
        </select>
      </div>
      <PageItems
        key={page.url}
        schema={page.schema!}
        url={page.url}
        extraNote={
          js.length > 0 ? (
            <p className="text-[11px] text-amber-800 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1.5">
              The browser test also found {js.join(', ')} added by JavaScript after load. Google can read it, but other search and AI crawlers that do not run JavaScript will not.
            </p>
          ) : undefined
        }
      />
    </Card>
  );
}
