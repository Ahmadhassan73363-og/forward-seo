/*
 * Semrush has no free API: access needs the SEO Toolkit Business plan, plus API units bought
 * separately (Semrush → Subscription info → API units). So there is one key:
 *
 *   SEMRUSH_API_KEY    set → Semrush data in the report; not set → no Semrush requests, no tab
 *   SEMRUSH_DATABASE   Semrush country database for keyword data (default: from the domain's
 *                      country code, e.g. .de → de, .co.uk → uk; otherwise us)
 *   SEMRUSH_KEYWORDS   ranking keywords to fetch (default 20, 10 units each)
 *   SEMRUSH_PAGES      top pages to fetch (default 10, 10 units each)
 *
 * The key is read on the server only and never stored or sent to the browser.
 */

export type SemrushConfig = { enabled: false } | { enabled: true; key: string; database?: string; keywords: number; pages: number };

const limit = (v: string | undefined, def: number) => Math.max(0, Math.min(100, Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : def));

export function semrushConfig(): SemrushConfig {
  const key = process.env.SEMRUSH_API_KEY?.trim();
  if (!key) return { enabled: false };
  const database = process.env.SEMRUSH_DATABASE?.trim().toLowerCase() || undefined;
  return { enabled: true, key, database, keywords: limit(process.env.SEMRUSH_KEYWORDS, 20), pages: limit(process.env.SEMRUSH_PAGES, 10) };
}

// Country-code domains whose Semrush database has the same code (plus the two that differ).
const CC_DATABASES = new Set(['ca', 'au', 'de', 'fr', 'es', 'it', 'nl', 'br', 'in', 'jp', 'se', 'dk', 'no', 'fi', 'pl', 'ch', 'be', 'at', 'ie', 'nz', 'mx', 'pk']);

/** The Semrush database for a host: SEMRUSH_DATABASE if set, else from its country code, else us. */
export function databaseFor(host: string, configured?: string): { database: string; reason: string } {
  if (configured) return { database: configured, reason: 'set by SEMRUSH_DATABASE' };
  const h = host.toLowerCase();
  if (/\.(co\.)?uk$/.test(h)) return { database: 'uk', reason: 'from the .uk domain' };
  if (/\.com\.au$/.test(h)) return { database: 'au', reason: 'from the .com.au domain' };
  const tld = h.split('.').pop() || '';
  if (CC_DATABASES.has(tld)) return { database: tld, reason: `from the .${tld} domain` };
  return { database: 'us', reason: 'default (set SEMRUSH_DATABASE for another country)' };
}

/** Approximate units one audit uses, for the report and docs. */
export const unitsPerAudit = (keywords: number, pages: number) => 10 + 10 * keywords + 10 * pages + 45;
