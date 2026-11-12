'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { GscInspection, GscMetrics, Run } from '@/lib/engine/types';
import { Card, shortUrl } from '../ui';
import { SourceIcon } from '../shared/source';
import { Stat, fmt } from '../shared/stat';

const pctOf = (ctr?: number) => (ctr === undefined ? '—' : `${(ctr * 100).toFixed(1)}%`);
const pos = (p?: number) => (p === undefined ? '—' : p.toFixed(1));
const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '—');

/** "+12% vs previous 28 days", or nothing when either period has no value to compare. */
function change(cur?: number, prev?: number, days?: number) {
  if (cur === undefined || prev === undefined || prev === 0) return undefined;
  const d = Math.round(((cur - prev) / prev) * 100);
  return `${d > 0 ? '+' : ''}${d}% vs previous ${days} days`;
}

const VERDICT: Record<string, { label: string; cls: string }> = {
  PASS: { label: 'Indexed', cls: 'bg-emerald-500/15 text-emerald-700' },
  PARTIAL: { label: 'Partial', cls: 'bg-amber-500/15 text-amber-700' },
  FAIL: { label: 'Not indexed', cls: 'bg-rose-500/15 text-rose-700' },
  NEUTRAL: { label: 'Not indexed', cls: 'bg-neutral-500/20 text-neutral-700' },
};

/** Search Console tab: Google's own data for the site; nothing here is estimated or scored. */
export function SearchConsoleTab({ run }: { run: Run }) {
  const g = run.searchConsole!;

  if (g.status === 'no_access' || g.status === 'unavailable') {
    return (
      <div className="space-y-3">
        <Card className="text-sm text-amber-800 border-amber-500/30 bg-amber-500/5 space-y-2">
          <p>{g.status === 'no_access' ? 'No Search Console access for this site.' : 'Search Console returned no data.'}</p>
          <p className="text-xs">{g.message}</p>
        </Card>
        <Footer run={run} />
      </div>
    );
  }

  const t = g.totals;
  const p = g.previous;
  const days = g.range?.days;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat source="searchConsole" label={`Clicks · ${days} days`} value={fmt(t?.clicks)} sub={change(t?.clicks, p?.clicks, days)} />
        <Stat source="searchConsole" label="Impressions" value={fmt(t?.impressions)} sub={change(t?.impressions, p?.impressions, days)} />
        <Stat source="searchConsole" label="Average CTR" value={pctOf(t?.ctr)} sub={p?.ctr !== undefined ? `previously ${pctOf(p.ctr)}` : undefined} />
        <Stat source="searchConsole" label="Average position" value={pos(t?.position)} sub={p?.position !== undefined ? `previously ${pos(p.position)}` : undefined} />
      </div>

      {g.errors.length > 0 && <Card className="text-xs text-amber-800 border-amber-500/30 bg-amber-500/5">Some Search Console requests failed: {g.errors.join('; ')}</Card>}

      {g.daily && g.daily.length > 1 && <DailyClicks daily={g.daily} />}

      {(g.templates || g.brandSplit) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {g.templates && (
            <Card className="space-y-2">
              <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="searchConsole" size={14} />Search traffic by page type</h3>
              <Table head={['Page type', 'Clicks', 'Impressions', 'CTR', 'Position']} rows={g.templates.map((t) => [t.template, ...cells(t)])} />
              <p className="text-[10px] text-neutral-500">Product = URLs containing /products/; collection = /collections/&lt;name&gt;; home = the root URL.</p>
            </Card>
          )}
          {g.brandSplit && (
            <Card className="space-y-2">
              <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="searchConsole" size={14} />Brand vs non-brand searches</h3>
              <Table head={['Searches', 'Clicks', 'Impressions', 'CTR', 'Position']} rows={[['Brand', ...cells(g.brandSplit.brand)], ['Non-brand', ...cells(g.brandSplit.nonBrand)]]} />
              <p className="text-[10px] text-neutral-500">Brand = queries containing {g.brandSplit.terms.join(', ')}. Set the brand name in the audit form if this is wrong.</p>
            </Card>
          )}
        </div>
      )}

      {g.nonBrandQueries && g.nonBrandQueries.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="searchConsole" size={14} />Top non-brand queries</h3>
          <Table head={['Query', 'Clicks', 'Impressions', 'CTR', 'Position']} rows={g.nonBrandQueries.map((q) => [q.query, ...cells(q)])} />
        </Card>
      )}

      {g.inspections && g.inspections.length > 0 && <Inspections items={g.inspections} />}

      {g.sitemaps && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="searchConsole" size={14} />Sitemaps submitted to Google</h3>
          {g.sitemaps.length === 0 ? (
            <p className="text-xs text-neutral-600">No sitemap is submitted in Search Console. Shopify stores have one at /sitemap.xml; submit it under Indexing → Sitemaps.</p>
          ) : (
            <Table
              head={['Sitemap', 'Last read by Google', 'URLs submitted', 'Errors', 'Warnings']}
              rows={g.sitemaps.map((s) => [
                <span key="p" className="font-mono break-all">{shortUrl(s.path)}{s.isPending && <span className="text-neutral-500"> · pending</span>}</span>,
                date(s.lastDownloaded),
                fmt(s.submitted),
                <span key="e" className={s.errors ? 'text-rose-700 font-semibold' : ''}>{fmt(s.errors)}</span>,
                <span key="w" className={s.warnings ? 'text-amber-700' : ''}>{fmt(s.warnings)}</span>,
              ])}
            />
          )}
        </Card>
      )}

      {g.queries && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="searchConsole" size={14} />Top search queries</h3>
          {g.queries.length === 0 ? (
            <p className="text-xs text-neutral-600">No queries with clicks or impressions in this period (Google hides rare queries for privacy).</p>
          ) : (
            <Table head={['Query', 'Clicks', 'Impressions', 'CTR', 'Position']} rows={g.queries.map((q) => [q.query, ...cells(q)])} />
          )}
        </Card>
      )}

      {g.pages && g.pages.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="searchConsole" size={14} />Top pages in Google Search</h3>
          <Table
            head={['Page', 'Clicks', 'Impressions', 'CTR', 'Position']}
            rows={g.pages.map((r) => [
              <a key="u" href={r.url} target="_blank" rel="noreferrer" className="font-mono break-all hover:text-brand inline-flex items-center gap-1">
                {shortUrl(r.url)} <ExternalLink className="w-3 h-3 shrink-0" />
              </a>,
              ...cells(r),
            ])}
          />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {g.devices && g.devices.length > 0 && (
          <Card className="space-y-2">
            <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="searchConsole" size={14} />Devices</h3>
            <Table head={['Device', 'Clicks', 'Impressions', 'CTR', 'Position']} rows={g.devices.map((d) => [d.device, ...cells(d)])} />
          </Card>
        )}
        {g.countries && g.countries.length > 0 && (
          <Card className="space-y-2">
            <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="searchConsole" size={14} />Countries</h3>
            <Table head={['Country', 'Clicks', 'Impressions', 'CTR', 'Position']} rows={g.countries.map((c) => [c.country, ...cells(c)])} />
          </Card>
        )}
      </div>

      <Footer run={run} />
    </div>
  );
}

const cells = (m: GscMetrics) => [fmt(m.clicks), fmt(m.impressions), pctOf(m.ctr), pos(m.position)];

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-neutral-600 text-[10px] uppercase">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`py-1 pr-3 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200/70">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`py-1.5 pr-3 ${j === 0 ? 'text-left' : 'text-right'}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyClicks({ daily }: { daily: Array<GscMetrics & { date: string }> }) {
  const max = Math.max(1, ...daily.map((d) => d.clicks ?? 0));
  return (
    <Card className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="searchConsole" size={14} />Clicks per day</h3>
      <div className="flex items-end gap-[2px] h-24" role="img" aria-label="Clicks per day">
        {daily.map((d) => (
          <div key={d.date} className="flex-1 bg-brand/75 hover:bg-brand rounded-t-sm min-h-[1px]" style={{ height: `${((d.clicks ?? 0) / max) * 100}%` }} title={`${d.date}: ${fmt(d.clicks)} clicks, ${fmt(d.impressions)} impressions`} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span>{daily[0].date}</span>
        <span>{daily[daily.length - 1].date}</span>
      </div>
    </Card>
  );
}

function Inspections({ items }: { items: GscInspection[] }) {
  return (
    <Card className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="searchConsole" size={14} />Index status (URL Inspection)</h3>
      <div className="space-y-2">
        {items.map((i) => {
          const v = i.verdict ? VERDICT[i.verdict] : undefined;
          const canonicalDiffers = i.googleCanonical && i.userCanonical && i.googleCanonical !== i.userCanonical;
          return (
            <div key={i.url} className="border border-neutral-200 rounded-lg p-2.5 text-xs space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono break-all">{shortUrl(i.url)}</span>
                {i.error ? (
                  <span className="px-1.5 py-0.5 rounded bg-neutral-500/20 text-neutral-700">Not inspected</span>
                ) : (
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${v?.cls || 'bg-neutral-500/20 text-neutral-700'}`}>{v?.label || i.verdict || 'Unknown'}</span>
                )}
                {i.link && (
                  <a href={i.link} target="_blank" rel="noreferrer" className="text-neutral-600 hover:text-brand inline-flex items-center gap-1">
                    Open in Search Console <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {i.error ? (
                <p className="text-neutral-600">{i.error}</p>
              ) : (
                <p className="text-neutral-600">
                  {i.coverageState || '—'}
                  {i.lastCrawlTime && ` · last crawled ${date(i.lastCrawlTime)}`}
                  {i.crawledAs && ` as ${i.crawledAs.toLowerCase()}`}
                  {i.robotsTxtState === 'DISALLOWED' && <span className="text-rose-700"> · blocked by robots.txt</span>}
                  {i.pageFetchState && i.pageFetchState !== 'SUCCESSFUL' && <span className="text-rose-700"> · fetch: {i.pageFetchState.toLowerCase().replace(/_/g, ' ')}</span>}
                </p>
              )}
              {canonicalDiffers && (
                <p className="text-amber-700">
                  Google chose a different canonical: <span className="font-mono break-all">{shortUrl(i.googleCanonical!)}</span> (page declares <span className="font-mono break-all">{shortUrl(i.userCanonical!)}</span>)
                </p>
              )}
              {i.richResults && (i.richResults.types.length > 0 || i.richResults.issues.length > 0) && (
                <p className="text-neutral-600">
                  Rich results: {Array.from(new Set(i.richResults.types)).join(', ') || '—'}
                  {i.richResults.issues.length > 0 && <span className="text-amber-700"> · {i.richResults.issues.join('; ')}</span>}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Footer({ run }: { run: Run }) {
  const g = run.searchConsole!;
  return (
    <p className="text-[11px] text-neutral-500">
      {g.property ? 'Data from' : 'Checked'} Google Search Console{g.property && <> for property <span className="font-mono">{g.property}</span></>}
      {g.range && `, ${g.range.start} to ${g.range.end} (final data, so the last 3 days are not included)`}, requested {new Date(g.fetchedAt).toLocaleString()}
      {g.serviceAccount && <>, read with the service account <span className="font-mono">{g.serviceAccount}</span></>}. Not part of the score.
    </p>
  );
}
