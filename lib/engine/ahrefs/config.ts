import type { AhrefsPlan } from '../types';

/*
 * Which Ahrefs key is configured decides what the audit fetches and what the report shows:
 *
 *   AHREFS_PAID_API_KEY  plan with API access (Lite or higher) → Domain Rating + Site Explorer data
 *   AHREFS_FREE_API_KEY  free Ahrefs account                    → Domain Rating only
 *   neither                                                      → no Ahrefs requests, no Ahrefs tab
 *
 * When both are set, the paid key is used. Keys are read on the server only and never stored.
 */

export type AhrefsConfig = { plan: 'off' } | { plan: AhrefsPlan; key: string };

export function ahrefsConfig(): AhrefsConfig {
  const paid = process.env.AHREFS_PAID_API_KEY?.trim();
  if (paid) return { plan: 'paid', key: paid };
  const free = process.env.AHREFS_FREE_API_KEY?.trim();
  if (free) return { plan: 'free', key: free };
  return { plan: 'off' };
}

/** What each plan adds to the report (shown on the home page and in the report). */
export const AHREFS_FEATURES: Record<AhrefsPlan, string[]> = {
  free: ['Domain Rating'],
  paid: ['Domain Rating', 'Backlinks and referring domains', 'Organic traffic and keywords', 'Top pages by traffic', 'Top ranking keywords'],
};
