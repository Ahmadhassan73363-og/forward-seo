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
} from './core';
import type { AuditContext } from './report';

export type DiscoverResult = { ok: true; ctx: AuditContext } | { ok: false; status: number; message: string };

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

export function clampMaxPages(n: any) {
  return Math.max(5, Math.min(HARD_MAX_PAGES, Number(n) || DEFAULT_MAX_PAGES));
}

/** Loads the homepage, reads sitemaps, and picks an evenly spread sample of pages to crawl. */
export async function discover(parsed: URL, maxPages: number): Promise<DiscoverResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const inputOrigin = `${parsed.protocol}//${parsed.hostname}`;

  const homeStart = Date.now();
  let homeHtml = '';
  let homeStatus = 0;
  let homeFinal = inputOrigin + '/';
  let homeRetryAfter: string | null = null;
  let homeError: string | null = null;
  try {
    const resp = await fetchWithTimeout(inputOrigin + '/', 15_000);
    homeStatus = resp.status;
    homeFinal = resp.url || homeFinal;
    homeHtml = await resp.text();
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
  const baseUrl = `${finalParsed.protocol}//${finalParsed.hostname}`;
  const host = finalParsed.hostname;
  if (finalParsed.hostname !== parsed.hostname) {
    warnings.push(`${parsed.hostname} redirects to ${finalParsed.hostname}; the audit used the final domain.`);
  }
  const storeHandle =
    (homeHtml.match(/Shopify\.shop\s*=\s*["']([^"']+)\.myshopify\.com/) || [])[1] ||
    parsed.hostname.replace('.myshopify.com', '').replace(/^www\./, '');

  const homePage = auditHtml(homeHtml, { url: baseUrl, finalUrl: homeFinal, status: homeStatus, latency: homeLatency, type: 'home', host });

  const discovery = await discoverStorePages(baseUrl);
  warnings.push(...discovery.notes);

  const pools = {
    product: discovery.products,
    collection: discovery.collections,
    page: discovery.pages,
    article: discovery.articles,
  };
  const alloc = allocate(maxPages - 1, pools, { product: 0.45, collection: 0.3, page: 0.1, article: 0.15 });
  // Interleave types so non-catalog pages can be fetched while catalog routes are paused.
  const perType = (Object.keys(pools) as Array<keyof typeof pools>).map((t) => sample(pools[t], alloc[t]).map((url) => ({ url, type: t as string })));
  const targets: Array<{ url: string; type: string }> = [];
  for (let i = 0; perType.some((l) => i < l.length); i++) perType.forEach((l) => l[i] && targets.push(l[i]));

  const totalDiscovered = discovery.products.length + discovery.collections.length + discovery.pages.length + discovery.articles.length;
  if (totalDiscovered === 0) warnings.push('No product, collection, page or article URLs could be discovered (sitemap and catalog JSON both empty or blocked).');
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
