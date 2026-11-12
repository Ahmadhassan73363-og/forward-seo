'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Minus, Plus } from 'lucide-react';
import type { PageSchema, SchemaFormat, SchemaIssue, SchemaItem } from '@/lib/engine/schema/types';
import { CopyButton } from '../ui';

/* Per-page schema viewer: one collapsible row per item, with a tree view and a code view. */

export const FORMAT_LABEL: Record<SchemaFormat, string> = { 'json-ld': 'JSON-LD', microdata: 'Microdata', rdfa: 'RDFa' };
const FORMAT_STYLE: Record<SchemaFormat, string> = {
  'json-ld': 'bg-brand text-white',
  microdata: 'bg-neutral-800 text-white',
  rdfa: 'bg-amber-600 text-white',
};

export function FormatBadge({ f }: { f: SchemaFormat }) {
  return <span className={`text-[9px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded ${FORMAT_STYLE[f]}`}>{FORMAT_LABEL[f]}</span>;
}

/** valid / warnings / errors pills */
export function Counts({ valid, warnings, errors, size = 'sm' }: { valid: number; warnings: number; errors: number; size?: 'sm' | 'xs' }) {
  const pill = `tabular-nums rounded-full font-semibold ${size === 'sm' ? 'text-[11px] px-2 py-0.5 min-w-[26px]' : 'text-[10px] px-1.5 min-w-[20px]'} text-center`;
  return (
    <span className="inline-flex gap-1" aria-label={`${valid} valid fields, ${warnings} warnings, ${errors} errors`}>
      <span title="Valid fields" className={`${pill} bg-emerald-500/10 text-emerald-700`}>{valid}</span>
      <span title="Warnings" className={`${pill} ${warnings ? 'bg-amber-500/15 text-amber-800' : 'bg-neutral-900/[0.05] text-neutral-400'}`}>{warnings}</span>
      <span title="Errors" className={`${pill} ${errors ? 'bg-brand/10 text-brand' : 'bg-neutral-900/[0.05] text-neutral-400'}`}>{errors}</span>
    </span>
  );
}

export const errorsOf = (i: SchemaItem) => i.issues.filter((x) => x.level === 'error').length;
export const warningsOf = (i: SchemaItem) => i.issues.filter((x) => x.level === 'warning').length;

export function IssueList({ issues }: { issues: SchemaIssue[] }) {
  if (!issues.length) return null;
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  return (
    <ul className="space-y-1">
      {sorted.map((i, k) => (
        <li key={k} className="flex gap-2 text-xs leading-snug">
          <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${i.level === 'error' ? 'bg-brand' : 'bg-amber-500'}`} aria-hidden />
          <span className="min-w-0">
            <span className="sr-only">{i.level}: </span>
            {i.path && <code className="font-mono text-[11px] text-neutral-500 mr-1.5 break-all">{i.path}</code>}
            <span className={i.level === 'error' ? 'text-neutral-900' : 'text-neutral-700'}>{i.message}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── tree ───────────────────────────────────────────────────────────────────

const join = (a: string, b: string) => (a ? `${a}.${b}` : b);

function Leaf({ v }: { v: any }) {
  if (v === null) return <span className="text-neutral-400">null</span>;
  if (typeof v === 'number' || typeof v === 'boolean') return <span className="text-sky-700">{String(v)}</span>;
  const s = String(v);
  if (/^https?:\/\//.test(s)) return <span className="text-emerald-700 break-all">&quot;{s}&quot;</span>;
  return <span className="text-emerald-700 break-words">&quot;{s}&quot;</span>;
}

function Node({ k, v, path, depth, issueAt, open0 }: { k: string; v: any; path: string; depth: number; issueAt: Map<string, SchemaIssue['level']>; open0: boolean }) {
  const [open, setOpen] = useState(open0);
  const level = issueAt.get(path);
  const mark = level && <span className={`ml-1 inline-block w-1.5 h-1.5 rounded-full align-middle ${level === 'error' ? 'bg-brand' : 'bg-amber-500'}`} title={level === 'error' ? 'Has an error' : 'Has a warning'} />;
  const keyEl = <span className={`${k.startsWith('@') ? 'text-violet-700' : 'text-neutral-800'} font-medium`}>{k}</span>;
  const pad = { paddingLeft: depth * 14 };

  const isObj = v && typeof v === 'object';
  if (!isObj) {
    return (
      <div style={pad} className="py-[1px]">
        {keyEl}
        <span className="text-neutral-400">: </span>
        <Leaf v={v} />
        {mark}
      </div>
    );
  }
  const entries: Array<[string, any, string]> = Array.isArray(v)
    ? v.map((x, i) => [`[${i}]`, x, v.length > 1 ? `${path}[${i}]` : path])
    : Object.entries(v).map(([kk, x]) => [kk, x, kk.startsWith('@') ? join(path, kk) : join(path, kk)]);
  const summary = Array.isArray(v) ? `[${v.length}]` : v['@type'] ? String(Array.isArray(v['@type']) ? v['@type'].join(', ') : v['@type']) : v['@id'] && Object.keys(v).length === 1 ? `→ ${v['@id']}` : '{…}';
  return (
    <div>
      <button type="button" style={pad} onClick={() => setOpen(!open)} className="py-[1px] text-left hover:bg-neutral-900/[0.04] rounded w-full" aria-expanded={open}>
        {open ? <ChevronDown className="inline w-3 h-3 -ml-3.5 text-neutral-400" /> : <ChevronRight className="inline w-3 h-3 -ml-3.5 text-neutral-400" />}
        {keyEl}
        <span className="text-neutral-400">: </span>
        <span className="text-neutral-500 break-all">{summary}</span>
        {mark}
      </button>
      {open &&
        entries.map(([kk, x, p], i) => {
          // Array children inherit the array's issue paths
          const childPath = Array.isArray(v) ? p : join(path, kk);
          return <Node key={kk + i} k={kk} v={x} path={childPath} depth={depth + 1} issueAt={issueAt} open0={open0 && depth < 3} />;
        })}
    </div>
  );
}

export function Tree({ data, issues, expandAll }: { data: any; issues: SchemaIssue[]; expandAll: boolean }) {
  // Mark a node when it, or anything under it, has an issue (worst level wins)
  const issueAt = useMemo(() => {
    const m = new Map<string, SchemaIssue['level']>();
    for (const i of issues) {
      const parts = i.path.split('.');
      for (let n = 1; n <= parts.length; n++) {
        const p = parts.slice(0, n).join('.');
        // Also mark the array that holds an indexed child ("offers" for "offers[1]")
        for (const q of [p, p.replace(/\[\d+\]$/, '')]) if (m.get(q) !== 'error') m.set(q, i.level);
      }
    }
    return m;
  }, [issues]);
  const entries = data && typeof data === 'object' && !Array.isArray(data) ? Object.entries(data) : [];
  return (
    <div className="font-mono text-[11.5px] leading-[1.55] pl-3.5">
      {entries.map(([k, v]) => (
        <Node key={k} k={k} v={v} path={k} depth={0} issueAt={issueAt} open0={expandAll || !(v && typeof v === 'object' && Object.keys(v).length > 6)} />
      ))}
    </div>
  );
}

// ─── item row ───────────────────────────────────────────────────────────────

export function ItemRow({ item, pageUrl, expandAll }: { item: SchemaItem; pageUrl?: string; expandAll: boolean }) {
  const [open, setOpen] = useState(expandAll);
  const [view, setView] = useState<'tree' | 'code'>('tree');
  const code = useMemo(() => JSON.stringify(item.format === 'json-ld' ? { '@context': 'https://schema.org', ...item.data } : item.data, null, 2), [item]);
  return (
    <div className="glass-inset rounded-lg">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-2 px-2.5 py-2 text-left">
        <span className="w-5 h-5 grid place-items-center rounded border border-neutral-300 bg-white/80 text-neutral-600 shrink-0">{open ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}</span>
        <span className="text-xs font-semibold text-neutral-900 bg-white/90 border border-neutral-200 rounded-full px-2 py-0.5 truncate">{item.types.join(', ')}</span>
        <FormatBadge f={item.format} />
        {item.features.length > 0 && <span className="hidden sm:inline text-[10px] text-emerald-700 truncate">{item.features.join(' · ')}</span>}
        <span className="ml-auto shrink-0">
          <Counts valid={item.valid} warnings={warningsOf(item)} errors={errorsOf(item)} />
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-neutral-900/[0.06] pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex rounded-lg bg-neutral-900/[0.06] p-0.5" role="tablist" aria-label="View">
              {(['tree', 'code'] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`text-[11px] px-2.5 py-1 rounded-md ${view === v ? 'bg-white text-neutral-900 font-semibold shadow-sm' : 'text-neutral-600'}`}>
                  {v === 'tree' ? 'Tree view' : 'Code view'}
                </button>
              ))}
            </div>
            <span className="ml-auto inline-flex gap-1.5">
              {view === 'code' && <CopyButton text={code} label="Copy JSON" />}
              {pageUrl && (
                <a href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-neutral-300 bg-white/70 text-neutral-700 hover:border-brand hover:text-brand">
                  Rich Results Test <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
          </div>
          {item.trimmed && <p className="text-[11px] text-neutral-500">Long lists and texts are shortened here; the checks ran on the full markup.</p>}
          <div className="max-h-[420px] overflow-auto rounded-md bg-white/70 border border-neutral-200/80 p-2.5">
            {view === 'tree' ? <Tree data={item.data} issues={item.issues} expandAll={expandAll} /> : <pre className="font-mono text-[11.5px] leading-[1.55] whitespace-pre-wrap break-all text-neutral-800">{code}</pre>}
          </div>
          <IssueList issues={item.issues} />
          {item.notes.map((n) => (
            <p key={n} className="text-[11px] text-neutral-500 leading-snug">{n}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/** All items on one page, plus unparseable blocks. */
export function PageItems({ schema, url, extraNote }: { schema: PageSchema; url?: string; extraNote?: React.ReactNode }) {
  const [expandAll, setExpandAll] = useState(false);
  const [v, setV] = useState(0);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-neutral-500">
          {schema.items.length} item{schema.items.length === 1 ? '' : 's'}
          {schema.invalid.length > 0 && ` · ${schema.invalid.length} invalid block${schema.invalid.length === 1 ? '' : 's'}`}
          {schema.otherVocab ? ` · ${schema.otherVocab} non-schema.org block${schema.otherVocab === 1 ? '' : 's'} skipped` : ''}
        </p>
        {schema.items.length > 0 && (
          <button type="button" onClick={() => { setExpandAll(!expandAll); setV(v + 1); }} className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-neutral-300 bg-white/70 text-neutral-700 hover:border-brand">
            {expandAll ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />} {expandAll ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>
      {extraNote}
      {schema.invalid.map((b, i) => (
        <div key={i} className="rounded-lg border border-brand/30 bg-brand/[0.04] p-2.5 space-y-1">
          <p className="text-xs font-semibold text-brand">Invalid {FORMAT_LABEL[b.format]} block: search engines ignore it</p>
          <p className="text-xs text-neutral-700">{b.error}</p>
          <pre className="font-mono text-[11px] text-neutral-600 whitespace-pre-wrap break-all">{b.snippet}…</pre>
        </div>
      ))}
      {schema.items.map((it, i) => (
        <ItemRow key={`${v}-${i}`} item={it} pageUrl={url} expandAll={expandAll} />
      ))}
      {!schema.items.length && !schema.invalid.length && <p className="text-xs text-neutral-500">No structured data in the page’s HTML.</p>}
    </div>
  );
}
