import type { MerchantData } from '../integration-types';
import { envFlag, envInt, googleAccount } from '../google/config';
import { googleBase, googleRequest, googleToken, SCOPES } from '../google/client';
import { mapLimit, parseDomainMap, sameSite, toNum } from '../http';

/*
 * Google Merchant Center via the Merchant API v1 (the Content API for Shopping was shut down on
 * 18 Aug 2026). The shared Google service account must be added as a user in Merchant Center.
 *
 *   MERCHANT_ENABLED    true to fetch Merchant Center (off by default)
 *   MERCHANT_ACCOUNTS   optional per-store account IDs: "store.com=123456789"
 *                       Without it, the account whose homepage matches the store is used.
 *   MERCHANT_DAYS       days of free-listing performance (default 28)
 *   MERCHANT_MAX_PRODUCTS  products read for status counts (default 5000)
 *
 * Reports use the Merchant Reports Query Language: snake_case in the query, camelCase in the JSON.
 */

export function merchantConfig() {
  const acct = googleAccount();
  if (acct.configured === false || !envFlag('MERCHANT_ENABLED', false)) return { enabled: false as const };
  return {
    enabled: true as const,
    credentials: acct.credentials,
    error: acct.error,
    email: acct.email,
    days: envInt('MERCHANT_DAYS', 28, 7, 365),
    maxProducts: envInt('MERCHANT_MAX_PRODUCTS', 5000, 100, 50000),
    accounts: parseDomainMap(process.env.MERCHANT_ACCOUNTS),
  };
}

const BASE = () => googleBase('merchantapi.googleapis.com');
const API_NAME = 'Merchant API';
const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};
const dateStr = (d: any) => (d && d.year ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : '');

async function findAccount(host: string, token: string, mapped?: string): Promise<{ account?: string; name?: string; matchedBy?: MerchantData['matchedBy']; error?: string; seen: number }> {
  if (mapped) return { account: mapped.startsWith('accounts/') ? mapped : `accounts/${mapped}`, matchedBy: 'MERCHANT_ACCOUNTS', seen: 1 };
  const accounts: Array<{ name: string; accountName?: string; homePageUri?: string }> = [];
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const r = await googleRequest<any>(`${BASE()}/accounts/v1/accounts?pageSize=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, token, undefined, API_NAME);
    if (r.ok === false) return { error: `Could not list Merchant Center accounts: ${r.message}`, seen: 0 };
    accounts.push(...(r.data?.accounts || []).filter((a: any) => a?.name));
    pageToken = r.data?.nextPageToken || '';
    if (!pageToken) break;
  }
  // homePageUri is on the account; fall back to the homepage resource when it's missing.
  const checked = await mapLimit(accounts.slice(0, 100), 8, async (a) => {
    let uri = a.homePageUri;
    if (!uri) {
      const h = await googleRequest<any>(`${BASE()}/accounts/v1/${a.name}/homepage`, token, undefined, API_NAME);
      uri = h.ok ? h.data?.uri : undefined;
    }
    return { ...a, match: !!uri && sameSite(uri.includes('://') ? uri : `https://${uri}`, host) };
  });
  const hit = checked.find((a) => a.match);
  return hit ? { account: hit.name, name: hit.accountName, matchedBy: 'homepage URL', seen: accounts.length } : { seen: accounts.length };
}

export async function fetchMerchant(host: string): Promise<MerchantData | undefined> {
  const cfg = merchantConfig();
  if (cfg.enabled === false) return undefined;
  const out: MerchantData = { serviceAccount: cfg.email, fetchedAt: new Date().toISOString(), status: 'ok', errors: [] };
  const fail = (status: MerchantData['status'], message: string): MerchantData => ({ ...out, status, message });
  if (!cfg.credentials) return fail('unavailable', `Google key problem: ${cfg.error}.`);
  const token = await googleToken(cfg.credentials, SCOPES.merchant);
  if (token.ok === false) return fail('unavailable', token.message);

  const bare = host.toLowerCase().replace(/^www\./, '');
  const found = await findAccount(host, token.data, cfg.accounts.get(bare));
  if (found.error) return fail('unavailable', found.error);
  if (!found.account) {
    return fail(
      'no_access',
      `The service account can read ${found.seen} Merchant Center account${found.seen === 1 ? '' : 's'}, none with the homepage ${host}. ` +
        `The store owner can add ${cfg.email} in Merchant Center → Settings → People and access, or set MERCHANT_ACCOUNTS=${bare}=<account id>.`,
    );
  }
  out.account = found.account;
  out.accountName = found.name;
  out.matchedBy = found.matchedBy;

  out.range = { start: day(cfg.days), end: day(1), days: cfg.days };
  const prev = { start: day(2 * cfg.days), end: day(cfg.days + 1) };
  const search = (query: string, pageToken?: string) =>
    googleRequest<any>(`${BASE()}/reports/v1/${found.account}/reports:search`, token.data, { query, pageSize: 1000, ...(pageToken ? { pageToken } : {}) }, API_NAME);
  const perf = (from: string, to: string, extra = '') =>
    `SELECT ${extra}clicks, impressions, click_through_rate, conversions FROM product_performance_view WHERE date BETWEEN '${from}' AND '${to}' AND marketing_method = 'ORGANIC'`;

  const [daily, previous, top] = await Promise.all([
    search(perf(out.range.start, out.range.end, 'date, ')),
    search(perf(prev.start, prev.end)),
    search(`${perf(out.range.start, out.range.end, 'offer_id, title, ')} ORDER BY clicks DESC LIMIT 10`),
  ]);

  const sumPerf = (rows: any[]) => {
    if (!rows.length) return { clicks: 0, impressions: 0 }; // no rows = no free-listing traffic (a real zero)
    const s = { clicks: 0, impressions: 0, conversions: 0 };
    for (const r of rows) {
      const v = r.productPerformanceView || {};
      s.clicks += toNum(v.clicks) ?? 0;
      s.impressions += toNum(v.impressions) ?? 0;
      s.conversions += toNum(v.conversions) ?? 0;
    }
    return { ...s, ctr: s.impressions ? s.clicks / s.impressions : undefined };
  };

  if (daily.ok === true) {
    const rows = daily.data?.results || [];
    out.freeListings = sumPerf(rows);
    out.daily = rows
      .map((r: any) => ({ date: dateStr(r.productPerformanceView?.date), clicks: toNum(r.productPerformanceView?.clicks), impressions: toNum(r.productPerformanceView?.impressions) }))
      .filter((r: any) => r.date)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  } else out.errors.push(`Free listings performance: ${daily.message}`);
  if (previous.ok === true) out.freeListingsPrevious = sumPerf(previous.data?.results || []);
  else out.errors.push(`Previous period: ${previous.message}`);
  if (top.ok === true) {
    out.topProducts = (top.data?.results || []).map((r: any) => {
      const v = r.productPerformanceView || {};
      return { offerId: v.offerId, title: v.title, clicks: toNum(v.clicks), impressions: toNum(v.impressions), ctr: toNum(v.clickThroughRate) };
    });
  } else out.errors.push(`Top products: ${top.message}`);

  // Product statuses and issues (paged; capped by MERCHANT_MAX_PRODUCTS).
  const counts = { total: 0, eligible: 0, limited: 0, pending: 0, disapproved: 0, truncated: false };
  const issues = new Map<string, { code: string; attribute?: string; severity?: string; count: number }>();
  const disapproved: NonNullable<MerchantData['disapprovedSample']> = [];
  let pageToken: string | undefined;
  let statusError: string | undefined;
  do {
    const r = await search('SELECT id, offer_id, title, aggregated_reporting_context_status, item_issues FROM product_view', pageToken);
    if (r.ok === false) {
      statusError = r.message;
      break;
    }
    for (const row of r.data?.results || []) {
      const v = row.productView || {};
      counts.total++;
      const st = v.aggregatedReportingContextStatus;
      if (st === 'ELIGIBLE') counts.eligible++;
      else if (st === 'ELIGIBLE_LIMITED') counts.limited++;
      else if (st === 'PENDING') counts.pending++;
      else if (st === 'NOT_ELIGIBLE_OR_DISAPPROVED') counts.disapproved++;
      const its: string[] = [];
      for (const it of v.itemIssues || []) {
        const code = it?.type?.code || 'unknown';
        const key = `${code}|${it?.type?.canonicalAttribute || ''}`;
        const e = issues.get(key) || { code, attribute: it?.type?.canonicalAttribute || undefined, severity: it?.severity?.aggregatedSeverity, count: 0 };
        e.count++;
        issues.set(key, e);
        its.push(it?.type?.canonicalAttribute ? `${code} (${it.type.canonicalAttribute})` : code);
      }
      if (st === 'NOT_ELIGIBLE_OR_DISAPPROVED' && disapproved.length < 15) disapproved.push({ offerId: v.offerId, title: v.title, issues: its });
    }
    pageToken = r.data?.nextPageToken || undefined;
    if (pageToken && counts.total >= cfg.maxProducts) {
      counts.truncated = true;
      break;
    }
  } while (pageToken);
  if (statusError && !counts.total) out.errors.push(`Product statuses: ${statusError}`);
  else {
    if (statusError) out.errors.push(`Product statuses (stopped after ${counts.total}): ${statusError}`);
    out.products = counts;
    out.topIssues = Array.from(issues.values()).sort((a, b) => b.count - a.count).slice(0, 12);
    out.disapprovedSample = disapproved;
  }

  const anyData = !!(out.freeListings || out.products || out.topProducts);
  out.status = !out.errors.length ? 'ok' : anyData ? 'partial' : out.errors.every((e) => /HTTP 403/.test(e)) ? 'no_access' : 'unavailable';
  if (out.status === 'unavailable' || out.status === 'no_access') out.message = out.errors.join(' ');
  return out;
}
