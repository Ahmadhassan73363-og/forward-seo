'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { Run } from '@/lib/engine/types';
import { Card, shortUrl } from '../ui';
import { SourceIcon } from '../shared/source';
import { Stat, fmt } from '../shared/stat';

const DATABASE_NAMES: Record<string, string> = { us: 'United States', uk: 'United Kingdom', de: 'Germany', fr: 'France', ca: 'Canada', au: 'Australia', pk: 'Pakistan', in: 'India' };
const dbName = (d: string) => DATABASE_NAMES[d] || d.toUpperCase();
const money = (v?: number) => (v === undefined ? '—' : `$${Math.round(v).toLocaleString()}`);
const pct = (v?: number) => (v === undefined ? '' : `${v}%`);

/** Semrush tab: values exactly as Semrush returned them; failed requests say why. */
export function SemrushTab({ run }: { run: Run }) {
  const s = run.semrush!;
  const db = `${dbName(s.database)} (${s.database})`;

  if (s.status === 'unavailable') {
    return (
      <div className="space-y-3">
        <Card className="text-sm text-amber-800 border-amber-500/30 bg-amber-500/5">Semrush returned no data: {s.message}</Card>
        <Footer run={run} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat source="semrush" label="Authority Score" value={fmt(s.backlinks?.authorityScore)} sub={s.backlinks ? 'Semrush domain score, 0–100' : 'Backlink data unavailable'} />
        <Stat source="semrush" label="Referring domains" value={fmt(s.backlinks?.referringDomains)} sub={s.backlinks ? `${fmt(s.backlinks.backlinks)} backlinks` : undefined} />
        <Stat source="semrush" label="Organic traffic / month" value={fmt(s.overview?.organicTraffic)} sub={s.overview ? `Estimate for ${db} · traffic value ${money(s.overview.organicCost)}` : undefined} />
        <Stat source="semrush" label="Organic keywords" value={fmt(s.overview?.organicKeywords)} sub={s.overview?.rank !== undefined ? `Semrush rank #${fmt(s.overview.rank)} in ${s.database}` : `Top 100 in ${db}`} />
      </div>

      {s.notFound && <Card className="text-xs text-neutral-700">Semrush has no organic search data for {s.domain} in the {db} database. If the store sells mainly in another country, set SEMRUSH_DATABASE.</Card>}
      {s.errors.length > 0 && <Card className="text-xs text-amber-800 border-amber-500/30 bg-amber-500/5">Some Semrush requests failed: {s.errors.join('; ')}</Card>}

      {s.topPages && s.topPages.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="semrush" size={14} />Top pages by organic traffic</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-neutral-600 text-[10px] uppercase">
                <tr>
                  <th className="text-left py-1 pr-3">Page</th>
                  <th className="text-right py-1 pr-3">Traffic</th>
                  <th className="text-right py-1 pr-3">Share</th>
                  <th className="text-right py-1">Keywords</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70">
                {s.topPages.map((p) => (
                  <tr key={p.url}>
                    <td className="py-1.5 pr-3 font-mono break-all">
                      <a href={p.url} target="_blank" rel="noreferrer" className="hover:text-brand inline-flex items-center gap-1">
                        {shortUrl(p.url)} <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                    <td className="py-1.5 pr-3 text-right">{fmt(p.traffic)}</td>
                    <td className="py-1.5 pr-3 text-right">{pct(p.trafficShare) || '—'}</td>
                    <td className="py-1.5 text-right">{fmt(p.keywords)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {s.keywords && s.keywords.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="semrush" size={14} />Keywords bringing the most traffic</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-neutral-600 text-[10px] uppercase">
                <tr>
                  <th className="text-left py-1 pr-3">Keyword</th>
                  <th className="text-right py-1 pr-3">Position</th>
                  <th className="text-right py-1 pr-3">Volume</th>
                  <th className="text-right py-1 pr-3">Traffic share</th>
                  <th className="text-left py-1">Ranking page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70">
                {s.keywords.map((k, i) => (
                  <tr key={`${k.keyword}-${i}`}>
                    <td className="py-1.5 pr-3">{k.keyword}</td>
                    <td className="py-1.5 pr-3 text-right">{k.position ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(k.volume)}</td>
                    <td className="py-1.5 pr-3 text-right">{pct(k.trafficShare) || '—'}</td>
                    <td className="py-1.5 font-mono break-all text-neutral-600">{k.url ? shortUrl(k.url) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Footer run={run} />
    </div>
  );
}

function Footer({ run }: { run: Run }) {
  const s = run.semrush!;
  return (
    <p className="text-[11px] text-neutral-500">
      Data from{' '}
      <a href="https://www.semrush.com/" target="_blank" rel="noreferrer" className="underline hover:text-brand">
        Semrush
      </a>{' '}
      for {s.domain}, {dbName(s.database)} database ({s.databaseReason}), requested {new Date(s.fetchedAt).toLocaleString()}.
      {s.unitsLeft !== undefined && ` API units left: ${s.unitsLeft.toLocaleString()}.`} These figures come from Semrush&apos;s index, not from this audit, and are not part of the score.
    </p>
  );
}
