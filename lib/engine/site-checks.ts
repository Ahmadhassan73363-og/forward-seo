import { load } from 'cheerio';
import { fetchWithTimeout, normalizeUrl } from '../audit/core';
import type { SiteChecks } from './types';

// Crawlers that decide whether a store can appear in AI answers / AI search.
export const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot'];

const SECURITY_HEADERS = ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy'];
const POLICY_PATHS = ['/policies/privacy-policy', '/policies/refund-policy', '/policies/shipping-policy', '/policies/terms-of-service'];
const CONSENT_SIGNATURES: Array<[string, string]> = [
  ['shopify-pc__banner', 'Shopify Customer Privacy banner'],
  ['onetrust', 'OneTrust'],
  ['cookiebot', 'Cookiebot'],
  ['consentmo', 'Consentmo'],
  ['pandectes', 'Pandectes'],
  ['cookieyes', 'CookieYes'],
  ['termly', 'Termly'],
  ['usercentrics', 'Usercentrics'],
  ['iubenda', 'iubenda'],
  ['axeptio', 'Axeptio'],
  ['osano', 'Osano'],
];

interface RobotsGroup {
  agents: string[];
  rules: Array<{ type: 'allow' | 'disallow'; path: string }>;
}

export function parseRobots(txt: string): { groups: RobotsGroup[]; sitemaps: string[] } {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (current) current.rules.push({ type: key, path: val });
      lastWasAgent = false;
    } else if (key === 'sitemap') {
      sitemaps.push(val);
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  return { groups, sitemaps };
}

/** Whether a bot may crawl the site root, using its own group if present, else `*`. */
export function botAccess(groups: RobotsGroup[], bot: string): 'allowed' | 'blocked' {
  const name = bot.toLowerCase();
  const own = groups.filter((g) => g.agents.includes(name));
  const applicable = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  const rules = applicable.flatMap((g) => g.rules);
  const blocksRoot = rules.some((r) => r.type === 'disallow' && r.path === '/');
  const allowsRoot = rules.some((r) => r.type === 'allow' && (r.path === '/' || r.path === '/$'));
  return blocksRoot && !allowsRoot ? 'blocked' : 'allowed';
}

export function pathDisallowed(groups: RobotsGroup[], path: string): boolean {
  const star = groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
  return star.some((r) => r.type === 'disallow' && r.path && path.startsWith(r.path.replace(/\*.*$/, '')));
}

async function statusOf(url: string): Promise<number> {
  try {
    const r = await fetchWithTimeout(url, 12_000);
    await r.arrayBuffer().catch(() => null);
    return r.status;
  } catch {
    return 0;
  }
}

/** `shopify`: also check Shopify policy pages and /search (these routes only exist on Shopify). */
export async function runSiteChecks(baseUrl: string, shopify = true): Promise<SiteChecks> {
  const policyPaths = shopify ? POLICY_PATHS : [];
  const home = `${baseUrl}/`;
  const [homeRes, robotsRes, llmsStatus, ...policyStatuses] = await Promise.all([
    fetchWithTimeout(home, 15_000).catch(() => null),
    fetchWithTimeout(`${baseUrl}/robots.txt`, 12_000).catch(() => null),
    statusOf(`${baseUrl}/llms.txt`),
    ...policyPaths.map((p) => statusOf(baseUrl + p)),
  ]);

  // Headers + HTML signals from the homepage
  const headers: Record<string, string | null> = {};
  let homeHtml = '';
  if (homeRes) {
    SECURITY_HEADERS.forEach((h) => (headers[h] = homeRes.headers.get(h)));
    homeHtml = await homeRes.text().catch(() => '');
  } else SECURITY_HEADERS.forEach((h) => (headers[h] = null));

  const lower = homeHtml.toLowerCase();
  const consent = CONSENT_SIGNATURES.find(([sig]) => lower.includes(sig));

  const $ = load(homeHtml || '<html></html>');
  const alts = $('link[rel="alternate"][hreflang]').toArray().map((el) => ({ code: String($(el).attr('hreflang') || '').toLowerCase(), href: $(el).attr('href') || '' }));
  const homeNorm = normalizeUrl(homeRes?.url || home);
  const hreflang = {
    count: alts.length,
    hasXDefault: alts.some((a) => a.code === 'x-default'),
    selfReference: alts.some((a) => {
      try {
        return normalizeUrl(new URL(a.href, home).toString()) === homeNorm;
      } catch {
        return false;
      }
    }),
    codes: Array.from(new Set(alts.map((a) => a.code))).slice(0, 50),
  };

  // robots.txt
  let robotsTxt = '';
  if (robotsRes?.ok) robotsTxt = await robotsRes.text().catch(() => '');
  const parsed = parseRobots(robotsTxt);
  const aiBots: Record<string, 'allowed' | 'blocked' | 'partial'> = {};
  AI_BOTS.forEach((b) => (aiBots[b] = botAccess(parsed.groups, b)));

  // Search results pages should not be indexable (thin, infinite URL space)
  let searchPage: SiteChecks['searchPage'] = null;
  if (shopify) try {
    const r = await fetchWithTimeout(`${baseUrl}/search?q=test`, 12_000);
    const html = await r.text();
    const robotsMeta = (load(html)('meta[name="robots" i]').attr('content') || '').toLowerCase();
    searchPage = { status: r.status, noindex: robotsMeta.includes('noindex'), disallowed: pathDisallowed(parsed.groups, '/search') };
  } catch {}

  const policies: Record<string, number> = {};
  policyPaths.forEach((p, i) => (policies[p] = policyStatuses[i] as number));

  return {
    robots: {
      found: !!robotsRes?.ok,
      status: robotsRes?.status ?? 0,
      hasSitemap: parsed.sitemaps.length > 0,
      aiBots,
      raw: robotsTxt.slice(0, 20_000),
    },
    llmsTxt: { found: llmsStatus === 200, status: llmsStatus },
    headers,
    https: (homeRes?.url || home).startsWith('https://'),
    policies,
    searchPage,
    consentBanner: consent ? consent[1] : null,
    hreflang,
  };
}
