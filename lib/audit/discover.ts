import {
  auditHtml,
  allocate,
  discoverStorePages,
  errMsg,
  fetchWithTimeout,
  isBotChallenge,
  parseRetryAfterMs,
  sample,
  DEFAULT_MAX_PAGES,
  HARD_MAX_PAGES,
  ALL_PAGES_LIMIT,
} from './core';
import type { PageAuditResult } from './core';
import { detectPlatform, isShopifyPasswordPage } from '../engine/platform';
import type { PlatformInfo } from '../engine/types';

export interface DiscoverySummary {
  counts: { products: number; collections: number; pages: number; blogs: number; articles: number };
  brokenSitemaps: Array<{ url: string; status: number; sitemap: string }>;
  sitemapFound: boolean;
}

/** Everything learned from the homepage and sitemaps, plus the pages selected for testing. */
export interface AuditContext {
  inputHost: string;
  baseUrl: string;
  host: string;
  storeHandle: string;
  platform: PlatformInfo;
  homePage: PageAuditResult;
  discovery: DiscoverySummary;
  targets: Array<{ url: string; type: string }>; // excludes the homepage
  maxPages: number;
  warnings: string[];
  startedAt: number;
}

export type DiscoverResult = { ok: true; ctx: AuditContext } | { ok: false; status: number; message: string };

/** Classifies a user-supplied URL by Shopify path pattern. */
export function typeForPath(url: string): string {
  try {
    const p = new URL(url).pathname.replace(/^\/[a-z]{2}(-[a-z]{2})?(?=\/)/i, '').replace(/\/+$/, '');
    if (p === '') return 'home';
    if (/^\/products\/[^/]+$/.test(p) || /^\/collections\/[^/]+\/products\/[^/]+$/.test(p)) return 'product';
    if (/^\/collections\/[^/]+$/.test(p)) return 'collection';
    if (/^\/pages\//.test(p)) return 'page';
    if (/^\/blogs\/[^/]+\/[^/]+$/.test(p)) return 'article';
    if (/^\/blogs\//.test(p)) return 'blog';
    return 'other';
  } catch {
    return 'other';
  }
}

export function normalizeInput(raw: string): { url: URL } | { error: string } {
  let s = String(raw || '').trim();
  if (!s) return { error: 'No store URL provided.' };
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    return { url: new URL(s) };
  } catch {
    return { error: `Invalid URL: ${s}` };
  }
}

/**
 * `allowAll` is only for the batched flow, where the browser can keep calling /crawl for as long
 * as a full crawl takes. "all" (or 0) means every discovered URL, up to ALL_PAGES_LIMIT.
 */
export function clampMaxPages(n: any, allowAll = false) {
  const cap = allowAll ? ALL_PAGES_LIMIT : HARD_MAX_PAGES;
  if (allowAll && (n === 'all' || n === 0 || n === '0')) return ALL_PAGES_LIMIT;
  return Math.max(5, Math.min(cap, Number(n) || DEFAULT_MAX_PAGES));
}

/** Loads the homepage, reads sitemaps, and picks an evenly spread sample of pages to crawl. */
export async function discover(parsed: URL, maxPages: number): Promise<DiscoverResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const inputOrigin = parsed.origin; // keeps a non-default port

  const homeStart = Date.now();
  let homeHtml = '';
  let homeStatus = 0;
  let homeFinal = inputOrigin + '/';
  let homeRetryAfter: string | null = null;
  let homeError: string | null = null;
  let homeHeaders: Headers = new Headers();
  try {
    const resp = await fetchWithTimeout(inputOrigin + '/', 15_000);
    homeStatus = resp.status;
    homeFinal = resp.url || homeFinal;
    homeHtml = await resp.text();
    homeHeaders = resp.headers;
    homeRetryAfter = resp.headers.get('retry-after');
    if (!resp.ok) homeError = `HTTP ${resp.status}`;
  } catch (e) {
    homeError = errMsg(e);
  }
  const homeLatency = Date.now() - homeStart;

  if (homeError) {
    if (homeStatus === 429) {
      const secs = Math.round(parseRetryAfterMs(homeRetryAfter) / 1000);
      return {
        ok: false,
        status: 429,
        message: `The store is rate-limiting this server (HTTP 429, retry after ${secs}s). Wait and try again — repeated audits of the same store from one server trigger Shopify's limit.`,
      };
    }
    const challenged = isBotChallenge(homeStatus, homeHtml);
    return {
      ok: false,
      status: 502,
      message: challenged
        ? `The homepage returned HTTP ${homeStatus} with a bot-protection challenge (Cloudflare/WAF). The store owner has to allow this crawler; the audit does not try to get around challenges.`
        : `Could not load the homepage (${homeError}). The audit was stopped instead of scoring an empty page.`,
    };
  }

  const finalParsed = new URL(homeFinal);
  const baseUrl = finalParsed.origin;
  const host = finalParsed.hostname;
  const platform = detectPlatform(homeHtml, homeHeaders);
  const shopify = platform.id === 'shopify';
  if (shopify && isShopifyPasswordPage(homeHtml, homeFinal)) {
    return {
      ok: false,
      status: 403,
      message: 'This Shopify store is password-protected (storefront password page). Remove the password in Online Store > Preferences, or audit it after launch. A password page cannot be audited meaningfully.',
    };
  }
  if (!shopify) {
    warnings.push(
      platform.id === 'unknown'
        ? 'No Shopify markers were found on the homepage and the platform could not be identified. Shopify-specific checks (catalog feed, theme, policies, cart, Shopify URL rules) were skipped; general web checks still ran.'
        : `This site runs on ${platform.name} (${platform.evidence[0]}). Shopify-specific checks (catalog feed, theme, policies, cart, Shopify URL rules) were skipped; general web checks still ran.`
    );
  }
  if (finalParsed.hostname !== parsed.hostname) {
    warnings.push(`${parsed.hostname} redirects to ${finalParsed.hostname}; the audit used the final domain.`);
  }
  const storeHandle =
    (homeHtml.match(/Shopify\.shop\s*=\s*["']([^"']+)\.myshopify\.com/) || [])[1] ||
    parsed.hostname.replace('.myshopify.com', '').replace(/^www\./, '');

  const homePage = auditHtml(homeHtml, { url: baseUrl, finalUrl: homeFinal, status: homeStatus, latency: homeLatency, type: 'home', host });

  const discovery = await discoverStorePages(baseUrl, shopify);
  warnings.push(...discovery.notes);

  const pools = {
    product: discovery.products,
    collection: discovery.collections,
    page: discovery.pages,
    article: discovery.articles,
    blog: discovery.blogs,
  };
  const alloc = allocate(maxPages - 1, pools, { product: 0.45, collection: 0.3, page: 0.1, article: 0.13, blog: 0.02 });
  // Interleave types so non-catalog pages can be fetched while catalog routes are paused.
  const perType = (Object.keys(pools) as Array<keyof typeof pools>).map((t) => sample(pools[t], alloc[t]).map((url) => ({ url, type: t as string })));
  const targets: Array<{ url: string; type: string }> = [];
  for (let i = 0; perType.some((l) => i < l.length); i++) perType.forEach((l) => l[i] && targets.push(l[i]));

  const totalDiscovered =
    discovery.products.length + discovery.collections.length + discovery.pages.length + discovery.articles.length + discovery.blogs.length;
  if (maxPages >= ALL_PAGES_LIMIT && totalDiscovered + 1 > ALL_PAGES_LIMIT) {
    warnings.push(`This store has ${totalDiscovered} URLs; "all pages" mode is capped at ${ALL_PAGES_LIMIT}.`);
  }
  if (totalDiscovered === 0) warnings.push(shopify ? 'No product, collection, page or article URLs could be discovered (sitemap and catalog JSON both empty or blocked).' : 'No URLs could be discovered from the sitemap, so only the homepage was tested.');
  if (totalDiscovered > targets.length) {
    warnings.push(`Audited a sample of ${targets.length} of ${totalDiscovered} discovered URLs (spread evenly across the catalog). Increase the page limit for more coverage.`);
  }

  return {
    ok: true,
    ctx: {
      inputHost: parsed.hostname,
      baseUrl,
      host,
      storeHandle,
      platform,
      homePage,
      discovery: {
        counts: {
          products: discovery.products.length,
          collections: discovery.collections.length,
          pages: discovery.pages.length,
          blogs: discovery.blogs.length,
          articles: discovery.articles.length,
        },
        brokenSitemaps: discovery.brokenSitemaps,
        sitemapFound: discovery.sitemapFound,
      },
      targets,
      maxPages,
      warnings,
      startedAt,
    },
  };
}
