'use client';

import React from 'react';
import type { Run } from '@/lib/engine/types';
import { DomainRatingCard } from './domain-rating';
import { SiteExplorerDetails, SiteExplorerStats } from './site-explorer';

/** Tab label for the plan the audit ran with. */
export const ahrefsTabLabel = (run: Run) => (run.ahrefs?.plan === 'paid' ? 'Search & Authority' : 'Authority');

/**
 * The Ahrefs tab. What it shows depends on the key the audit ran with:
 *   free key → Domain Rating only
 *   paid key → Domain Rating, backlinks, organic traffic, top pages and keywords
 */
export function AhrefsTab({ run }: { run: Run }) {
  const a = run.ahrefs!;
  const se = a.plan === 'paid' ? a.siteExplorer : undefined;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DomainRatingCard dr={a.domainRating} />
        {se && <SiteExplorerStats se={se} />}
      </div>

      {se && <SiteExplorerDetails se={se} />}

      {a.plan === 'free' && (
        <p className="text-[11px] text-slate-500">
          Free Ahrefs key: Domain Rating only. Backlinks, organic traffic, top pages and keywords need an Ahrefs plan with API access (set AHREFS_PAID_API_KEY).
        </p>
      )}
      <p className="text-[11px] text-slate-500">
        Domain Rating by{' '}
        <a href="https://ahrefs.com/" target="_blank" rel="noreferrer" className="underline hover:text-emerald-300">
          Ahrefs
        </a>
        . Data for {a.target}, requested {new Date(a.fetchedAt).toLocaleString()}. These figures come from Ahrefs&apos; index, not from this audit, and are not part of the score.
      </p>
    </div>
  );
}
