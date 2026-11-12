'use client';

import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { Card, shortUrl } from '../ui';
import { Stat } from '../shared/stat';
import { int, SimpleTable } from '../shared/format';

/*
 * Screaming Frog import: reads an "Internal: All" CSV export in the browser. Nothing is uploaded or
 * stored; the summary disappears when the page is closed. Useful for full-site crawls beyond this
 * tool's page limit (Screaming Frog's free version crawls up to 500 URLs).
 */

type Row = Record<string, string>;

/** RFC 4180 CSV (quoted fields, doubled quotes, newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

interface Summary {
  file: string;
  urls: number;
  html: number;
  status: Record<string, number>;
  issues: Array<{ id: string; label: string; urls: string[]; detail?: (u: string) => string }>;
  nonIndexableReasons: Array<[string, number]>;
}

function summarize(file: string, text: string): Summary | string {
  const table = parseCsv(text);
  const headerIdx = table.findIndex((r) => r.some((c) => c.trim() === 'Address'));
  if (headerIdx < 0) return 'This file has no "Address" column. Export "Internal" → "All" from Screaming Frog as CSV.';
  const head = table[headerIdx].map((h) => h.trim());
  const rows: Row[] = table.slice(headerIdx + 1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  const col = (r: Row, ...names: string[]) => names.map((n) => r[n]).find((v) => v !== undefined) ?? '';
  const html = rows.filter((r) => /text\/html/i.test(col(r, 'Content Type', 'Content')));
  const ok = html.filter((r) => col(r, 'Status Code') === '200');
  const status: Record<string, number> = {};
  for (const r of rows) {
    const code = col(r, 'Status Code');
    const bucket = !code || code === '0' ? 'no response' : `${code[0]}xx`;
    status[bucket] = (status[bucket] || 0) + 1;
  }
  const dupes = (key: string) => {
    const seen = new Map<string, string[]>();
    for (const r of ok) {
      const v = col(r, key).toLowerCase();
      if (v) seen.set(v, [...(seen.get(v) || []), col(r, 'Address')]);
    }
    return Array.from(seen.values()).filter((l) => l.length > 1).flat();
  };
  const reasons = new Map<string, number>();
  const nonIdx = ok.filter((r) => /non-indexable/i.test(col(r, 'Indexability')));
  for (const r of nonIdx) {
    const why = col(r, 'Indexability Status') || 'unknown';
    reasons.set(why, (reasons.get(why) || 0) + 1);
  }
  const addr = (list: Row[]) => list.map((r) => col(r, 'Address'));
  const issues: Summary['issues'] = [
    { id: 'errors', label: 'Broken pages (4xx / 5xx)', urls: addr(rows.filter((r) => /^[45]/.test(col(r, 'Status Code')))) },
    { id: 'redirects', label: 'Redirecting URLs (3xx)', urls: addr(rows.filter((r) => /^3/.test(col(r, 'Status Code')))) },
    { id: 'nonidx', label: 'Non-indexable pages (200)', urls: addr(nonIdx) },
    { id: 'notitle', label: 'Missing title', urls: addr(ok.filter((r) => !col(r, 'Title 1'))) },
    { id: 'duptitle', label: 'Duplicate titles', urls: dupes('Title 1') },
    { id: 'longtitle', label: 'Titles over 60 characters', urls: addr(ok.filter((r) => Number(col(r, 'Title 1 Length')) > 60)) },
    { id: 'nodesc', label: 'Missing meta description', urls: addr(ok.filter((r) => !col(r, 'Meta Description 1'))) },
    { id: 'dupdesc', label: 'Duplicate meta descriptions', urls: dupes('Meta Description 1') },
    { id: 'noh1', label: 'Missing H1', urls: addr(ok.filter((r) => !col(r, 'H1-1'))) },
    { id: 'multih1', label: 'More than one H1', urls: addr(ok.filter((r) => !!col(r, 'H1-2'))) },
    { id: 'canon', label: 'Canonical points elsewhere', urls: addr(ok.filter((r) => { const c = col(r, 'Canonical Link Element 1'); return !!c && c !== col(r, 'Address'); })) },
    { id: 'thin', label: 'Thin content (under 200 words)', urls: addr(ok.filter((r) => { const w = Number(col(r, 'Word Count')); return Number.isFinite(w) && col(r, 'Word Count') !== '' && w < 200; })) },
    { id: 'slow', label: 'Slow response (over 1 s)', urls: addr(rows.filter((r) => Number(col(r, 'Response Time')) > 1)) },
  ].filter((i) => i.urls.length > 0);
  return { file, urls: rows.length, html: html.length, status, issues, nonIndexableReasons: Array.from(reasons.entries()).sort((a, b) => b[1] - a[1]) };
}

export function ScreamingFrogTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const onFile = async (f?: File) => {
    if (!f) return;
    setError('');
    if (f.size > 200 * 1024 * 1024) return setError('File is larger than 200 MB.');
    const r = summarize(f.name, await f.text());
    if (typeof r === 'string') {
      setSummary(null);
      setError(r);
    } else setSummary(r);
  };
  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-900">Import a Screaming Frog crawl</h3>
        <p className="text-xs text-neutral-600">
          In Screaming Frog: <strong>Internal</strong> tab → filter <strong>All</strong> → <strong>Export</strong> (CSV). The file is read in your browser only; nothing is uploaded or saved.
        </p>
        <label className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-neutral-300 hover:border-brand cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> Choose CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {error && <p className="text-xs text-rose-700">{error}</p>}
      </Card>
      {summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat source="screamingFrog" label="URLs in the export" value={int(summary.urls)} sub={summary.file} />
            <Stat source="screamingFrog" label="HTML pages" value={int(summary.html)} />
            <Stat source="screamingFrog" label="Status codes" value={int(summary.status['2xx'])} sub={Object.entries(summary.status).map(([k, v]) => `${k}: ${v}`).join(' · ')} />
            <Stat source="screamingFrog" label="Issue types found" value={int(summary.issues.length)} />
          </div>
          {summary.nonIndexableReasons.length > 0 && (
            <Card className="space-y-2">
              <h4 className="text-sm font-semibold text-neutral-900">Why pages are non-indexable</h4>
              <SimpleTable head={['Reason', 'Pages']} rows={summary.nonIndexableReasons.map(([r, n]) => [r, int(n)])} />
            </Card>
          )}
          <Card className="space-y-2">
            <h4 className="text-sm font-semibold text-neutral-900">Issues in the crawl</h4>
            {summary.issues.length === 0 && <p className="text-xs text-neutral-600">No issues from these checks.</p>}
            {summary.issues.map((i) => (
              <details key={i.id} className="text-xs border border-neutral-200 rounded-lg p-2">
                <summary className="cursor-pointer">
                  <strong>{i.label}</strong> <span className="text-neutral-600">· {i.urls.length.toLocaleString()} URLs</span>
                </summary>
                <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-neutral-600 max-h-48 overflow-y-auto">
                  {i.urls.slice(0, 100).map((u, j) => (
                    <li key={j} className="break-all">{shortUrl(u)}</li>
                  ))}
                  {i.urls.length > 100 && <li>… and {i.urls.length - 100} more</li>}
                </ul>
              </details>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
