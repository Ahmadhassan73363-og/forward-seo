'use client';

import React from 'react';
import type { Run } from '@/lib/engine/types';
import { Card } from '../ui';
import { SourceIcon } from '../shared/source';
import { Stat } from '../shared/stat';
import { Bars, change, int, pct, SimpleTable, SourceNotice } from '../shared/format';

const SEVERITY: Record<string, string> = { DISAPPROVED: 'text-rose-700', DEMOTED: 'text-amber-700', PENDING: 'text-neutral-700' };

/** Merchant Center tab: free listings performance, product statuses and item issues. */
export function MerchantTab({ run }: { run: Run }) {
  const m = run.merchant!;
  if (m.status === 'no_access' || m.status === 'unavailable') {
    return (
      <div className="space-y-3">
        <SourceNotice title={m.status === 'no_access' ? 'No Merchant Center access for this store.' : 'Merchant Center returned no data.'} message={m.message} />
        <Footer run={run} />
      </div>
    );
  }
  const f = m.freeListings;
  const p = m.freeListingsPrevious;
  const pr = m.products;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat source="merchant" label="Free listing clicks" value={int(f?.clicks)} sub={change(f?.clicks, p?.clicks)?.text} />
        <Stat source="merchant" label="Free listing impressions" value={int(f?.impressions)} sub={`CTR ${pct(f?.ctr, 2)}${f?.conversions !== undefined ? ` · ${int(f.conversions)} conversions` : ''}`} />
        <Stat source="merchant" label="Disapproved products" value={int(pr?.disapproved)} sub={pr ? `of ${pr.total.toLocaleString()} products${pr.truncated ? ' read (catalog capped)' : ''}` : undefined} />
        <Stat source="merchant" label="Eligible products" value={int(pr?.eligible)} sub={pr ? `${int(pr.limited)} limited · ${int(pr.pending)} pending` : undefined} />
      </div>

      {m.errors.length > 0 && <Card className="text-xs text-amber-800 border-amber-500/30 bg-amber-500/5">Some Merchant Center requests failed: {m.errors.join('; ')}</Card>}

      {m.daily && m.daily.length > 1 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="merchant" size={14} />Free listing clicks per day</h3>
          <Bars points={m.daily.map((d) => ({ date: d.date, value: d.clicks }))} label="Free listing clicks per day" />
        </Card>
      )}

      {m.topIssues && m.topIssues.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="merchant" size={14} />Most common product issues</h3>
          <SimpleTable head={['Issue', 'Attribute', 'Severity', 'Products']} rows={m.topIssues.map((i) => [<span key="c" className="font-mono">{i.code}</span>, i.attribute || '—', <span key="s" className={SEVERITY[i.severity || ''] || ''}>{(i.severity || '—').toLowerCase()}</span>, int(i.count)])} />
        </Card>
      )}

      {m.disapprovedSample && m.disapprovedSample.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="merchant" size={14} />Disapproved products (first {m.disapprovedSample.length})</h3>
          <SimpleTable head={['Product', 'Offer ID', 'Issues']} rows={m.disapprovedSample.map((d) => [d.title || '—', <span key="o" className="font-mono">{d.offerId || '—'}</span>, <span key="i" className="text-rose-700">{d.issues.join(', ') || '—'}</span>])} />
        </Card>
      )}

      {m.topProducts && m.topProducts.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5"><SourceIcon id="merchant" size={14} />Top products in free listings</h3>
          <SimpleTable head={['Product', 'Clicks', 'Impressions', 'CTR']} rows={m.topProducts.map((t) => [t.title || t.offerId || '—', int(t.clicks), int(t.impressions), pct(t.ctr, 2)])} />
        </Card>
      )}
      <Footer run={run} />
    </div>
  );
}

function Footer({ run }: { run: Run }) {
  const m = run.merchant!;
  return (
    <p className="text-[11px] text-neutral-500">
      {m.account ? `Data from Merchant Center ${m.accountName ? `"${m.accountName}" ` : ''}(${m.account}, matched by ${m.matchedBy}) via the Merchant API` : 'Checked Merchant Center'}
      {m.range && `, free listings ${m.range.start} to ${m.range.end}`}
      {m.serviceAccount && <>, read with <span className="font-mono">{m.serviceAccount}</span></>}. Not part of the score.
    </p>
  );
}
