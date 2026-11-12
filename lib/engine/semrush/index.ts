import type { SemrushData } from '../types';
import { semrushReport, semrushUnitsLeft, semrushV4, num } from './client';
import { databaseFor, semrushConfig } from './config';

export { semrushConfig, unitsPerAudit } from './config';

/*
 * Semrush data for one site (SEMRUSH_API_KEY). Requests per audit:
 *   domain_rank            1 line              10 units
 *   domain_organic         SEMRUSH_KEYWORDS    10 units per line
 *   domain_organic_unique  SEMRUSH_PAGES       10 units per line
 *   backlinks v4 overview  1 request           45 units
 *   units balance          free
 * If the key is rejected or out of units, the remaining requests are skipped.
 */
export async function fetchSemrush(host: string): Promise<SemrushData | undefined> {
  const cfg = semrushConfig();
  if (cfg.enabled === false) return undefined;
  const domain = host.replace(/^www\./, '');
  const { database, reason } = databaseFor(domain, cfg.database);
  const out: SemrushData = { domain, database, databaseReason: reason, fetchedAt: new Date().toISOString(), status: 'ok', errors: [] };
  const base = { domain, database };

  // Overview first: it also tells us whether the key works at all.
  const overview = await semrushReport({ ...base, type: 'domain_rank' }, ['Dn', 'Rk', 'Or', 'Ot', 'Oc'], cfg.key);
  if (overview.ok === false) {
    out.errors.push(`Domain overview: ${overview.message}`);
    if (overview.fatal) {
      out.status = 'unavailable';
      out.message = `${overview.message}. ${overview.code === 132 ? 'Buy units in Semrush → Subscription info → API units.' : overview.code === 120 ? 'Check SEMRUSH_API_KEY.' : 'Semrush data was skipped.'}`;
      return out;
    }
  } else {
    const row = overview.rows[0];
    out.overview = row ? { rank: num(row.Rk), organicKeywords: num(row.Or), organicTraffic: num(row.Ot), organicCost: num(row.Oc) } : undefined;
    if (!row) out.notFound = true; // Semrush has no data for this domain in this database
  }

  const [keywords, pages, backlinks] = await Promise.all([
    cfg.keywords > 0 && !out.notFound
      ? semrushReport({ ...base, type: 'domain_organic', display_limit: String(cfg.keywords), display_sort: 'tr_desc' }, ['Ph', 'Po', 'Nq', 'Ur', 'Tr'], cfg.key)
      : Promise.resolve(undefined),
    cfg.pages > 0 && !out.notFound
      ? semrushReport({ ...base, type: 'domain_organic_unique', display_limit: String(cfg.pages), display_sort: 'tr_desc' }, ['Ur', 'Pc', 'Tg', 'Tr'], cfg.key)
      : Promise.resolve(undefined),
    semrushV4('/backlinks/v1/overview', { url: domain, scope: 'ROOT_DOMAIN' }, cfg.key),
  ]);

  if (keywords?.ok === true) {
    out.keywords = keywords.rows
      .filter((r) => r.Ph)
      .map((r) => ({ keyword: r.Ph, position: num(r.Po), volume: num(r.Nq), url: r.Ur || undefined, trafficShare: num(r.Tr) }));
  } else if (keywords) out.errors.push(`Organic keywords: ${keywords.message}`);

  if (pages?.ok === true) {
    out.topPages = pages.rows.filter((r) => r.Ur).map((r) => ({ url: r.Ur, keywords: num(r.Pc), traffic: num(r.Tg), trafficShare: num(r.Tr) }));
  } else if (pages) out.errors.push(`Top pages: ${pages.message}`);

  if (backlinks.ok === true) {
    const d = backlinks.data;
    out.backlinks = { authorityScore: typeof d.score === 'number' ? d.score : undefined, backlinks: typeof d.backlinks_count === 'number' ? d.backlinks_count : undefined, referringDomains: typeof d.domains_count === 'number' ? d.domains_count : undefined };
  } else out.errors.push(`Backlinks: ${backlinks.message}`);

  out.unitsLeft = await semrushUnitsLeft(cfg.key);
  const anyData = !!(out.overview || out.keywords?.length || out.topPages?.length || out.backlinks);
  out.status = !out.errors.length ? 'ok' : anyData ? 'partial' : 'unavailable';
  if (out.status === 'unavailable') out.message = out.errors.join(' ');
  return out;
}
