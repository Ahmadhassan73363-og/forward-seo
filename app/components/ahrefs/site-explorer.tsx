import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { SiteExplorerData } from '@/lib/engine/types';
import { Card, shortUrl } from '../ui';
import { SourceIcon } from '../shared/source';
import { Stat, fmt } from '../shared/stat';

/** Paid tier: Site Explorer stats (rendered next to the Domain Rating card). */
export function SiteExplorerStats({ se }: { se: SiteExplorerData }) {
  if (se.status === 'no_api_access' || se.status === 'failed') return null;
  return (
    <>
      <Stat source="ahrefs" label="Referring domains (live)" value={fmt(se.backlinks?.liveRefdomains)} sub={`${fmt(se.backlinks?.live)} live backlinks`} />
      <Stat source="ahrefs" label="Organic traffic / month" value={fmt(se.organic?.traffic)} sub="Ahrefs estimate from rankings" />
      <Stat source="ahrefs" label="Organic keywords" value={fmt(se.organic?.keywords)} sub={se.organic ? `${fmt(se.organic.keywordsTop3)} in the top 3` : undefined} />
    </>
  );
}

/** Paid tier: top pages and keywords tables, or why they are missing. */
export function SiteExplorerDetails({ se }: { se: SiteExplorerData }) {
  return (
    <>
      {se.message && <Card className="text-xs text-amber-800 border-amber-500/30 bg-amber-500/5">{se.message}</Card>}

      {se.topPages && se.topPages.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="ahrefs" size={14} />Top pages by organic traffic</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-neutral-600 text-[10px] uppercase">
                <tr>
                  <th className="text-left py-1 pr-3">Page</th>
                  <th className="text-right py-1 pr-3">Traffic</th>
                  <th className="text-right py-1 pr-3">Keywords</th>
                  <th className="text-left py-1">Top keyword</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70">
                {se.topPages.map((p) => (
                  <tr key={p.url}>
                    <td className="py-1.5 pr-3 font-mono break-all">
                      <a href={p.url} target="_blank" rel="noreferrer" className="hover:text-brand inline-flex items-center gap-1">
                        {shortUrl(p.url)} <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                    <td className="py-1.5 pr-3 text-right">{fmt(p.traffic)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(p.keywords)}</td>
                    <td className="py-1.5 text-neutral-700">
                      {p.topKeyword || '—'}
                      {p.topKeywordPosition !== undefined && <span className="text-neutral-500"> · #{p.topKeywordPosition}</span>}
                      {p.topKeywordVolume !== undefined && <span className="text-neutral-500"> · {fmt(p.topKeywordVolume)}/mo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {se.keywords && se.keywords.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="ahrefs" size={14} />Ranking keywords (highest search volume first)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-neutral-600 text-[10px] uppercase">
                <tr>
                  <th className="text-left py-1 pr-3">Keyword</th>
                  <th className="text-right py-1 pr-3">Volume</th>
                  <th className="text-right py-1 pr-3">Position</th>
                  <th className="text-left py-1">Ranking page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70">
                {se.keywords.map((k) => (
                  <tr key={k.keyword}>
                    <td className="py-1.5 pr-3">{k.keyword}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(k.volume)}</td>
                    <td className="py-1.5 pr-3 text-right">{k.position ?? '—'}</td>
                    <td className="py-1.5 font-mono break-all text-neutral-600">{k.url ? shortUrl(k.url) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
