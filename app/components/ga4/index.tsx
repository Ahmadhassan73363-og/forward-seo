'use client';

import React from 'react';
import type { Run } from '@/lib/engine/types';
import { Card } from '../ui';
import { SourceIcon } from '../shared/source';
import { Stat } from '../shared/stat';
import { Bars, change, int, money, pct, SimpleTable, SourceNotice } from '../shared/format';

/** GA4 tab: organic sessions and conversions, AI-referred visits, organic landing pages. */
export function Ga4Tab({ run }: { run: Run }) {
  const g = run.ga4!;
  if (g.status === 'no_access' || g.status === 'unavailable') {
    return (
      <div className="space-y-3">
        <SourceNotice title={g.status === 'no_access' ? 'No GA4 access for this store.' : 'GA4 returned no data.'} message={g.message} />
        <Footer run={run} />
      </div>
    );
  }
  const o = g.organic;
  const p = g.organicPrevious;
  const ai = g.aiReferrals;
  const share = o?.sessions !== undefined && g.allTraffic?.sessions ? o.sessions / g.allTraffic.sessions : undefined;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat source="ga4" label="Organic sessions" value={int(o?.sessions)} sub={[change(o?.sessions, p?.sessions)?.text, share !== undefined ? `${pct(share)} of all sessions` : ''].filter(Boolean).join(' · ') || undefined} />
        <Stat source="ga4" label="Organic conversion rate" value={pct(g.organicConversionRate, 2)} sub={`${int(o?.purchases)} purchases ÷ sessions${g.organicConversionRatePrevious !== undefined ? ` · previously ${pct(g.organicConversionRatePrevious, 2)}` : ''}`} />
        <Stat source="ga4" label="Organic revenue" value={money(o?.revenue)} sub={change(o?.revenue, p?.revenue)?.text} />
        <Stat source="ga4" label="AI-referred sessions" value={int(ai?.total.sessions)} sub={`${change(ai?.total.sessions, ai?.previousTotal?.sessions)?.text || ''}${ai ? ` · ${int(ai.total.purchases)} purchases` : ''} · lower bound`} />
      </div>
      <p className="text-[11px] text-neutral-500">GA4&apos;s own key event rate for organic sessions: {pct(o?.keyEventRate, 2)}. Revenue is in the property&apos;s currency.</p>

      {(g.errors.length > 0 || g.notes.length > 0) && (
        <Card className="text-xs text-amber-800 border-amber-500/30 bg-amber-500/5 space-y-1">
          {g.errors.map((e) => <p key={e}>{e}</p>)}
          {g.notes.map((n) => <p key={n}>{n}</p>)}
        </Card>
      )}

      {ai && (
        <Card className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="ga4" size={14} />Visits from AI assistants</h3>
            <p className="text-[11px] text-neutral-500">Sessions whose source is an AI assistant ({ai.sources.join(', ')}). Many AI visits arrive with no referrer and are counted as direct, so this is a lower bound.</p>
          </div>
          <Bars points={ai.daily.map((d) => ({ date: d.date, value: d.sessions }))} label="AI-referred sessions per day" />
          {ai.bySource.length ? (
            <SimpleTable head={['Source', 'Sessions', 'Engaged', 'Purchases', 'Revenue']} rows={ai.bySource.map((s) => [s.source, int(s.sessions), int(s.engagedSessions), int(s.purchases), money(s.revenue)])} />
          ) : (
            <p className="text-xs text-neutral-600">No sessions from these sources in this period.</p>
          )}
        </Card>
      )}

      {g.landingPages && (
        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="ga4" size={14} />Organic landing pages</h3>
          <SimpleTable head={['Page type', 'Sessions', 'Purchases', 'Conversion', 'Revenue']} rows={g.landingPages.byTemplate.map((t) => [t.template, int(t.sessions), int(t.purchases), t.sessions ? pct((t.purchases ?? 0) / t.sessions, 2) : '—', money(t.revenue)])} />
          <SimpleTable head={['Top landing pages', 'Sessions', 'Purchases', 'Revenue']} rows={g.landingPages.top.map((t) => [<span key="p" className="font-mono break-all">{t.page}</span>, int(t.sessions), int(t.purchases), money(t.revenue)])} />
        </Card>
      )}
      <Footer run={run} />
    </div>
  );
}

function Footer({ run }: { run: Run }) {
  const g = run.ga4!;
  return (
    <p className="text-[11px] text-neutral-500">
      {g.property ? `Data from GA4 property ${g.propertyName ? `"${g.propertyName}" ` : ''}(${g.property}, matched by ${g.matchedBy})` : 'Checked GA4'}
      {g.range && `, ${g.range.start} to ${g.range.end}, compared with ${g.previousRange?.start} to ${g.previousRange?.end}`}
      {g.serviceAccount && <>, read with <span className="font-mono">{g.serviceAccount}</span></>}. Not part of the score.
    </p>
  );
}
