import type { GscInspection, GscMetrics, SearchConsoleData } from '../types';
import { accessToken, gscRequest, INSPECT_URL, num, WEBMASTERS } from './client';
import { gscConfig } from './config';

export { gscConfig } from './config';

type Site = { siteUrl: string; permissionLevel?: string };
type SaRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };

/**
 * The Search Console property that covers this host, if the service account can read one.
 * Prefers a Domain property (sc-domain:example.com, covers every subdomain and protocol),
 * then a URL-prefix property for the exact host (https first).
 */
export function pickProperty(host: string, sites: Site[]): string | undefined {
  const h = host.toLowerCase();
  const usable = sites.filter((s) => s.siteUrl && s.permissionLevel !== 'siteUnverifiedUser');
  const domain = usable
    .map((s) => s.siteUrl)
    .filter((u) => u.startsWith('sc-domain:'))
    .map((u) => ({ u, d: u.slice('sc-domain:'.length).toLowerCase() }))
    .filter(({ d }) => h === d || h.endsWith(`.${d}`))
    .sort((a, b) => b.d.length - a.d.length)[0];
  if (domain) return domain.u;
  const prefix = (wanted: string) =>
    usable
      .map((s) => {
        try {
          const u = new URL(s.siteUrl);
          return u.hostname.toLowerCase() === wanted && u.pathname === '/' ? s.siteUrl : undefined;
        } catch {
          return undefined;
        }
      })
      .filter((u): u is string => !!u)
      .sort((a, b) => Number(b.startsWith('https:')) - Number(a.startsWith('https:')))[0];
  const alt = h.startsWith('www.') ? h.slice(4) : `www.${h}`;
  return prefix(h) || prefix(alt);
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

const metrics = (r?: SaRow): GscMetrics | undefined =>
  r ? { clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr), position: num(r.position) } : undefined;

/** Does this URL belong to the property? (URL Inspection refuses URLs outside it.) */
function inProperty(url: string, property: string): boolean {
  try {
    if (property.startsWith('sc-domain:')) {
      const d = property.slice('sc-domain:'.length).toLowerCase();
      const h = new URL(url).hostname.toLowerCase();
      return h === d || h.endsWith(`.${d}`);
    }
    return url.startsWith(property);
  } catch {
    return false;
  }
}

function inspection(url: string, r: any): GscInspection {
  const ix = r?.inspectionResult?.indexStatusResult || {};
  const rich = r?.inspectionResult?.richResultsResult;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    url,
    verdict: str(ix.verdict),
    coverageState: str(ix.coverageState),
    indexingState: str(ix.indexingState),
    robotsTxtState: str(ix.robotsTxtState),
    pageFetchState: str(ix.pageFetchState),
    lastCrawlTime: str(ix.lastCrawlTime),
    crawledAs: str(ix.crawledAs),
    googleCanonical: str(ix.googleCanonical),
    userCanonical: str(ix.userCanonical),
    richResults: rich
      ? {
          verdict: str(rich.verdict),
          types: (rich.detectedItems || []).map((d: any) => d?.richResultType).filter(Boolean),
          issues: (rich.detectedItems || []).flatMap((d: any) => (d?.items || []).flatMap((i: any) => (i?.issues || []).map((x: any) => `${d.richResultType}: ${x?.issueMessage}${x?.severity ? ` (${x.severity.toLowerCase()})` : ''}`))),
        }
      : undefined,
    link: str(r?.inspectionResult?.inspectionResultLink),
  };
}

/*
 * Search Console data for one site. Requests per audit (all free, within Google's quotas):
 *   sites.list                    1   which properties the service account can read
 *   searchAnalytics.query         7   totals (this + previous period), by day, query, page, device, country
 *   sitemaps.list                 1
 *   urlInspection.index.inspect   GSC_INSPECT_URLS (homepage + top pages; quota 2,000/day per property)
 */
/** Brand terms → an RE2 pattern for Search Console's includingRegex / excludingRegex. */
const brandRegex = (terms: string[]) => '(?i)(' + terms.map((t) => t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)).join('|') + ')';

// Page groups for template traffic (RE2, matched against the full page URL).
const TEMPLATES: Array<{ template: 'home' | 'product' | 'collection'; regex: string }> = [
  { template: 'home', regex: '^https?://[^/]+/?(\\?.*)?$' },
  { template: 'product', regex: '/products/' },
  { template: 'collection', regex: '/collections/[^/?#]+/?(\\?.*)?$' },
];

export async function fetchSearchConsole(host: string, homeUrl: string, opts: { brandTerms?: string[] } = {}): Promise<SearchConsoleData | undefined> {
  const cfg = gscConfig();
  if (cfg.enabled === false) return undefined;
  const out: SearchConsoleData = { serviceAccount: cfg.email, fetchedAt: new Date().toISOString(), status: 'ok', errors: [] };
  const fail = (status: SearchConsoleData['status'], message: string) => ({ ...out, status, message });

  if (!cfg.credentials) return fail('unavailable', `Search Console key problem: ${cfg.error}.`);
  const token = await accessToken(cfg.credentials);
  if (token.ok === false) return fail('unavailable', token.message);

  const sites = await gscRequest<{ siteEntry?: Site[] }>(`${WEBMASTERS()}/sites`, token.data);
  if (sites.ok === false) return fail('unavailable', `Could not list Search Console properties: ${sites.message}`);
  const entries = sites.data.siteEntry || [];
  const property = pickProperty(host, entries);
  if (!property) {
    return fail(
      'no_access',
      `The service account has no access to a Search Console property for ${host} (it can read ${entries.length} other propert${entries.length === 1 ? 'y' : 'ies'}). ` +
        `The site owner can add ${cfg.email} in Search Console → Settings → Users and permissions (Restricted is enough).`,
    );
  }
  out.property = property;

  // Final data lags 2–3 days, so the period ends 3 days ago.
  const end = daysAgo(3);
  const start = daysAgo(3 + cfg.days - 1);
  const prevEnd = daysAgo(3 + cfg.days);
  const prevStart = daysAgo(3 + 2 * cfg.days - 1);
  out.range = { start: day(start), end: day(end), days: cfg.days };
  type Filter = { dimension: 'page' | 'query'; operator: 'includingRegex' | 'excludingRegex'; expression: string };
  const sa = (dimensions: string[], rowLimit: number, from = start, to = end, filter?: Filter) =>
    gscRequest<{ rows?: SaRow[] }>(`${WEBMASTERS()}/sites/${encodeURIComponent(property)}/searchAnalytics/query`, token.data, {
      startDate: day(from),
      endDate: day(to),
      dimensions,
      rowLimit,
      type: 'web',
      dataState: 'final',
      ...(filter ? { dimensionFilterGroups: [{ filters: [filter] }] } : {}),
    });
  const terms = (opts.brandTerms || []).map((t) => t.trim()).filter((t) => t.length >= 2);

  const [totals, previous, daily, queries, pages, devices, countries, sitemaps] = await Promise.all([
    sa([], 1),
    sa([], 1, prevStart, prevEnd),
    sa(['date'], cfg.days + 5),
    sa(['query'], cfg.rows),
    sa(['page'], cfg.rows),
    sa(['device'], 5),
    sa(['country'], 10),
    gscRequest<{ sitemap?: any[] }>(`${WEBMASTERS()}/sites/${encodeURIComponent(property)}/sitemaps`, token.data),
  ]);
  // Traffic per page template, and brand vs non-brand searches.
  const [templates, brand, nonBrand, nonBrandQueries] = await Promise.all([
    Promise.all(TEMPLATES.map((t) => sa([], 1, start, end, { dimension: 'page', operator: 'includingRegex', expression: t.regex }))),
    terms.length ? sa([], 1, start, end, { dimension: 'query', operator: 'includingRegex', expression: brandRegex(terms) }) : Promise.resolve(undefined),
    terms.length ? sa([], 1, start, end, { dimension: 'query', operator: 'excludingRegex', expression: brandRegex(terms) }) : Promise.resolve(undefined),
    terms.length ? sa(['query'], cfg.rows, start, end, { dimension: 'query', operator: 'excludingRegex', expression: brandRegex(terms) }) : Promise.resolve(undefined),
  ]);

  // Search analytics: no rows means no search traffic in the period (a real answer, not an error).
  // Identical failures (e.g. API not enabled) are reported once, with every request they hit.
  const failures = new Map<string, string[]>();
  const take = <T>(label: string, r: typeof totals, map: (rows: SaRow[]) => T): T | undefined => {
    if (r.ok === false) {
      failures.set(r.message, [...(failures.get(r.message) || []), label]);
      return undefined;
    }
    return map(r.data.rows || []);
  };
  out.totals = take('Totals', totals, (rows) => metrics(rows[0]) || { clicks: 0, impressions: 0 });
  out.previous = take('Previous period', previous, (rows) => ({ start: day(prevStart), end: day(prevEnd), ...(metrics(rows[0]) || { clicks: 0, impressions: 0 }) }));
  out.daily = take('By day', daily, (rows) => rows.map((r) => ({ date: r.keys?.[0] || '', ...metrics(r)! })).filter((r) => r.date));
  out.queries = take('Top queries', queries, (rows) => rows.map((r) => ({ query: r.keys?.[0] || '', ...metrics(r)! })).filter((r) => r.query));
  out.pages = take('Top pages', pages, (rows) => rows.map((r) => ({ url: r.keys?.[0] || '', ...metrics(r)! })).filter((r) => r.url));
  out.devices = take('Devices', devices, (rows) => rows.map((r) => ({ device: (r.keys?.[0] || '').toLowerCase(), ...metrics(r)! })));
  out.countries = take('Countries', countries, (rows) => rows.map((r) => ({ country: (r.keys?.[0] || '').toUpperCase(), ...metrics(r)! })));

  const tpl = templates.map((r, i) => ({ template: TEMPLATES[i].template, r }));
  if (tpl.every((t) => t.r.ok)) out.templates = tpl.map((t) => ({ template: t.template, ...(metrics((t.r as any).data.rows?.[0]) || { clicks: 0, impressions: 0 }) }));
  else take('Template traffic', tpl.find((t) => !t.r.ok)!.r, () => undefined);
  if (brand && nonBrand) {
    const b = take('Brand searches', brand, (rows) => metrics(rows[0]) || { clicks: 0, impressions: 0 });
    const nb = take('Non-brand searches', nonBrand, (rows) => metrics(rows[0]) || { clicks: 0, impressions: 0 });
    if (b && nb) out.brandSplit = { terms, brand: b, nonBrand: nb };
  }
  if (nonBrandQueries) out.nonBrandQueries = take('Non-brand queries', nonBrandQueries, (rows) => rows.map((r) => ({ query: r.keys?.[0] || '', ...metrics(r)! })).filter((r) => r.query));

  failures.forEach((labels, message) => out.errors.push(`${labels.join(', ')}: ${message}`));

  if (sitemaps.ok === true) {
    out.sitemaps = (sitemaps.data.sitemap || []).map((s: any) => ({
      path: String(s.path || ''),
      type: s.type || undefined,
      lastSubmitted: s.lastSubmitted || undefined,
      lastDownloaded: s.lastDownloaded || undefined,
      isPending: !!s.isPending,
      errors: num(s.errors),
      warnings: num(s.warnings),
      submitted: (s.contents || []).reduce((sum: number | undefined, c: any) => (num(c?.submitted) === undefined ? sum : (sum || 0) + num(c.submitted)!), undefined),
    }));
  } else out.errors.push(`Sitemaps: ${sitemaps.message}`);

  // URL Inspection: the homepage, then the pages with the most clicks.
  if (cfg.inspect > 0) {
    const urls = Array.from(new Set([homeUrl, ...(out.pages || []).map((p) => p.url)])).filter((u) => inProperty(u, property)).slice(0, cfg.inspect);
    out.inspections = await Promise.all(
      urls.map(async (url) => {
        const r = await gscRequest(INSPECT_URL(), token.data, { inspectionUrl: url, siteUrl: property, languageCode: 'en-US' });
        return r.ok === true ? inspection(url, r.data) : { url, error: r.message };
      }),
    );
    const failed = out.inspections.filter((i) => i.error);
    if (failed.length) out.errors.push(`URL Inspection failed for ${failed.length} of ${out.inspections.length} URLs: ${failed[0].error}`);
  }

  const anyData = !!(out.totals || out.queries || out.pages || out.sitemaps || out.inspections?.some((i) => !i.error));
  out.status = !out.errors.length ? 'ok' : anyData ? 'partial' : 'unavailable';
  if (out.status === 'unavailable') out.message = out.errors.join(' ');
  return out;
}
