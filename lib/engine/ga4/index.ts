import type { Ga4Data, Ga4Metrics } from '../integration-types';
import { envFlag, envInt, googleAccount } from '../google/config';
import { googleBase, googleRequest, googleToken, SCOPES, type GoogleResult } from '../google/client';
import { mapLimit, parseDomainMap, sameSite, toNum } from '../http';

/*
 * Google Analytics 4 (Data API v1beta runReport + Admin API v1beta), with the shared Google service
 * account added to the GA4 property as Viewer.
 *
 *   GA4_ENABLED      true to fetch GA4 (off by default: not every store gives GA4 access)
 *   GA4_PROPERTIES   optional per-store property IDs: "store.com=123456789, other.com=987654321".
 *                    Without it, the property whose web stream URL matches the store is used.
 *   GA4_DAYS         days of data (default 28; the previous period of the same length is compared)
 *   GA4_AI_SOURCES   session sources counted as AI referrals (comma list; default below)
 */

export const DEFAULT_AI_SOURCES = ['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'gemini.google.com', 'bard.google.com', 'copilot.microsoft.com', 'claude.ai', 'you.com', 'meta.ai', 'deepseek.com', 'grok.com'];

export function ga4Config() {
  const acct = googleAccount();
  if (acct.configured === false || !envFlag('GA4_ENABLED', false)) return { enabled: false as const };
  const sources = (process.env.GA4_AI_SOURCES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return {
    enabled: true as const,
    credentials: acct.credentials,
    error: acct.error,
    email: acct.email,
    days: envInt('GA4_DAYS', 28, 7, 365),
    properties: parseDomainMap(process.env.GA4_PROPERTIES),
    aiSources: sources.length ? sources : DEFAULT_AI_SOURCES,
  };
}

const DATA = () => `${googleBase('analyticsdata.googleapis.com')}/v1beta`;
const ADMIN = () => `${googleBase('analyticsadmin.googleapis.com')}/v1beta`;

const METRICS = ['sessions', 'engagedSessions', 'keyEvents', 'sessionKeyEventRate', 'ecommercePurchases', 'purchaseRevenue'];
const toMetrics = (vals: Array<{ value?: string }> | undefined): Ga4Metrics => ({
  sessions: toNum(vals?.[0]?.value),
  engagedSessions: toNum(vals?.[1]?.value),
  keyEvents: toNum(vals?.[2]?.value),
  keyEventRate: toNum(vals?.[3]?.value),
  purchases: toNum(vals?.[4]?.value),
  revenue: toNum(vals?.[5]?.value),
});
const ZERO: Ga4Metrics = { sessions: 0, engagedSessions: 0, keyEvents: 0, purchases: 0, revenue: 0 };

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ORGANIC = { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: 'Organic Search' } } };

function templateOf(path: string): 'home' | 'product' | 'collection' | 'other' {
  const p = path.split('?')[0].replace(/^\/[a-z]{2}(-[a-z]{2})?(?=\/)/i, ''); // drop a locale prefix like /en-gb
  if (p === '/' || p === '') return 'home';
  if (/\/products\//.test(p)) return 'product';
  if (/\/collections\//.test(p)) return 'collection';
  return 'other';
}

/** The GA4 property for this store: GA4_PROPERTIES, else the property whose web stream URL matches. */
async function findProperty(host: string, token: string, mapped?: string): Promise<{ property?: string; name?: string; matchedBy?: Ga4Data['matchedBy']; error?: string; seen: number }> {
  if (mapped) return { property: mapped.startsWith('properties/') ? mapped : `properties/${mapped}`, matchedBy: 'GA4_PROPERTIES', seen: 1 };
  const props: Array<{ property: string; displayName?: string }> = [];
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const r = await googleRequest<any>(`${ADMIN()}/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, token, undefined, 'Google Analytics Admin API');
    if (r.ok === false) return { error: `Could not list GA4 properties: ${r.message}`, seen: 0 };
    for (const a of r.data?.accountSummaries || []) for (const p of a?.propertySummaries || []) if (p?.property) props.push({ property: p.property, displayName: p.displayName });
    pageToken = r.data?.nextPageToken || '';
    if (!pageToken) break;
  }
  const streams = await mapLimit(props.slice(0, 100), 8, async (p) => {
    const r = await googleRequest<any>(`${ADMIN()}/${p.property}/dataStreams?pageSize=200`, token, undefined, 'Google Analytics Admin API');
    const uris: string[] = r.ok ? (r.data?.dataStreams || []).map((s: any) => s?.webStreamData?.defaultUri).filter(Boolean) : [];
    return { ...p, match: uris.some((u) => sameSite(u.includes('://') ? u : `https://${u}`, host)) };
  });
  const hit = streams.find((s) => s.match);
  return hit ? { property: hit.property, name: hit.displayName, matchedBy: 'web stream URL', seen: props.length } : { seen: props.length };
}

export async function fetchGa4(host: string): Promise<Ga4Data | undefined> {
  const cfg = ga4Config();
  if (cfg.enabled === false) return undefined;
  const out: Ga4Data = { serviceAccount: cfg.email, fetchedAt: new Date().toISOString(), status: 'ok', errors: [], notes: [] };
  const fail = (status: Ga4Data['status'], message: string): Ga4Data => ({ ...out, status, message });
  if (!cfg.credentials) return fail('unavailable', `Google key problem: ${cfg.error}.`);
  const token = await googleToken(cfg.credentials, SCOPES.analytics);
  if (token.ok === false) return fail('unavailable', token.message);

  const bare = host.toLowerCase().replace(/^www\./, '');
  const found = await findProperty(host, token.data, cfg.properties.get(bare));
  if (found.error) return fail('unavailable', found.error);
  if (!found.property) {
    return fail(
      'no_access',
      `The service account can read ${found.seen} GA4 propert${found.seen === 1 ? 'y' : 'ies'}, none with a web stream for ${host}. ` +
        `The store owner can add ${cfg.email} as Viewer in GA4 → Admin → Property access management, or set GA4_PROPERTIES=${bare}=<property id>.`,
    );
  }
  out.property = found.property;
  out.propertyName = found.name;
  out.matchedBy = found.matchedBy;

  // GA4 data for "today" is incomplete, so periods end yesterday.
  out.range = { start: day(cfg.days), end: day(1), days: cfg.days };
  out.previousRange = { start: day(2 * cfg.days), end: day(cfg.days + 1) };
  const cur = [{ startDate: out.range.start, endDate: out.range.end }];
  const prev = [{ startDate: out.previousRange.start, endDate: out.previousRange.end }];
  const aiRe = `^(.*\\.)?(${cfg.aiSources.map(escapeRe).join('|')})$`;
  const AI = { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'FULL_REGEXP', value: aiRe, caseSensitive: false } } };

  const report = (body: object) => googleRequest<any>(`${DATA()}/${found.property}:runReport`, token.data, body, 'Google Analytics Data API');
  const [organic, organicPrev, all, aiBySource, aiPrev, aiDaily, landing] = await Promise.all([
    report({ dateRanges: cur, metrics: METRICS.map((name) => ({ name })), dimensionFilter: ORGANIC }),
    report({ dateRanges: prev, metrics: METRICS.map((name) => ({ name })), dimensionFilter: ORGANIC }),
    report({ dateRanges: cur, metrics: METRICS.map((name) => ({ name })) }),
    report({ dateRanges: cur, dimensions: [{ name: 'sessionSource' }], metrics: METRICS.map((name) => ({ name })), dimensionFilter: AI, limit: 50 }),
    report({ dateRanges: prev, metrics: METRICS.map((name) => ({ name })), dimensionFilter: AI }),
    report({ dateRanges: cur, dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }], dimensionFilter: AI, limit: 400 }),
    report({ dateRanges: cur, dimensions: [{ name: 'landingPage' }], metrics: METRICS.map((name) => ({ name })), dimensionFilter: ORGANIC, limit: 1000, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] }),
  ]);

  // Identical failures (e.g. no access) are reported once, with every report they hit.
  const failures = new Map<string, string[]>();
  const take = <T>(label: string, r: GoogleResult<any>, map: (d: any) => T): T | undefined => {
    if (r.ok === false) {
      failures.set(r.message, [...(failures.get(r.message) || []), label]);
      return undefined;
    }
    const m = r.data?.metadata || {};
    if (m.subjectToThresholding) out.notes.push(`${label}: GA4 applied data thresholds, so small numbers may be hidden.`);
    if (m.dataLossFromOtherRow) out.notes.push(`${label}: some rows were grouped into "(other)" by GA4.`);
    if (Array.isArray(m.samplingMetadatas) && m.samplingMetadatas.length) out.notes.push(`${label}: GA4 sampled this report.`);
    return map(r.data);
  };
  // No rows = no sessions matched (a real zero for the totals).
  const total = (d: any) => (d?.rows?.[0] ? toMetrics(d.rows[0].metricValues) : { ...ZERO });

  out.organic = take('Organic totals', organic, total);
  out.organicPrevious = take('Organic previous period', organicPrev, total);
  out.allTraffic = take('All traffic', all, total);
  const rate = (m?: Ga4Metrics) => (m?.sessions && m.purchases !== undefined ? m.purchases / m.sessions : undefined);
  out.organicConversionRate = rate(out.organic);
  out.organicConversionRatePrevious = rate(out.organicPrevious);

  const bySource = take('AI referrals', aiBySource, (d) => (d?.rows || []).map((r: any) => ({ source: r.dimensionValues?.[0]?.value || '', ...toMetrics(r.metricValues) })));
  if (bySource) {
    const sum = (k: keyof Ga4Metrics) => bySource.reduce((s: number, r: any) => s + (r[k] ?? 0), 0);
    out.aiReferrals = {
      sources: cfg.aiSources,
      total: { sessions: sum('sessions'), engagedSessions: sum('engagedSessions'), keyEvents: sum('keyEvents'), purchases: sum('purchases'), revenue: sum('revenue') },
      previousTotal: take('AI referrals previous period', aiPrev, total),
      bySource,
      daily:
        take('AI referrals by day', aiDaily, (d) =>
          (d?.rows || [])
            .map((r: any) => {
              const v = String(r.dimensionValues?.[0]?.value || ''); // YYYYMMDD
              return { date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, sessions: toNum(r.metricValues?.[0]?.value) };
            })
            .sort((a: any, b: any) => a.date.localeCompare(b.date)),
        ) || [],
    };
  }

  out.landingPages = take('Organic landing pages', landing, (d) => {
    const rows = (d?.rows || []).map((r: any) => ({ page: r.dimensionValues?.[0]?.value || '', ...toMetrics(r.metricValues) }));
    const groups = new Map<string, Ga4Metrics>();
    for (const r of rows) {
      const t = templateOf(r.page);
      const g = groups.get(t) || { sessions: 0, engagedSessions: 0, keyEvents: 0, purchases: 0, revenue: 0 };
      for (const k of ['sessions', 'engagedSessions', 'keyEvents', 'purchases', 'revenue'] as const) g[k] = (g[k] ?? 0) + (r[k] ?? 0);
      groups.set(t, g);
    }
    return {
      byTemplate: (['home', 'product', 'collection', 'other'] as const).filter((t) => groups.has(t)).map((t) => ({ template: t, ...groups.get(t)! })),
      top: rows.slice(0, 15),
    };
  });
  if ((landing.ok && (landing.data?.rowCount ?? 0) > 1000)) out.notes.push('Organic landing pages: only the top 1,000 pages by sessions were grouped by template.');

  failures.forEach((labels, message) => out.errors.push(`${labels.join(', ')}: ${message}`));
  out.notes = Array.from(new Set(out.notes));
  const anyData = !!(out.organic || out.aiReferrals || out.landingPages);
  out.status = !out.errors.length ? 'ok' : anyData ? 'partial' : failures.size && Array.from(failures.keys()).every((m) => /HTTP 403/.test(m)) ? 'no_access' : 'unavailable';
  if (out.status !== 'ok' && out.status !== 'partial') out.message = out.errors.join(' ');
  return out;
}
