import { load, type CheerioAPI } from 'cheerio';
import { guardedFetch } from '../engine/net-guard';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PageAuditResult {
  url: string;
  final_url: string;
  redirected: boolean;
  page_type: string;
  status_code: number; // 0 = network error / timeout
  fetch_error: string | null;
  blocked: boolean; // WAF / Cloudflare challenge
  rate_limited?: boolean; // Shopify 429 local_rate_limited
  retry_after_ms?: number;
  response_time_ms: number;
  content_size_bytes: number;
  title: string;
  title_length: number;
  meta_description: string;
  meta_description_length: number;
  meta_robots: string;
  noindex: boolean;
  h1: string;
  h1_count: number;
  h2_count: number;
  h3_count: number;
  canonical_url: string;
  canonical_status: 'match' | 'mismatch' | 'missing' | 'cross_domain' | 'n/a';
  is_canonical_match: boolean;
  word_count: number;
  has_faq_content: boolean;
  has_definition_paragraph: boolean;
  definition_word_count: number;
  json_ld_entities: any[];
  invalid_json_ld_blocks: number;
  schema_score: number;
  schema_types: string[];
  schema_findings: string[];
  script_count: number;
  third_party_scripts: number;
  render_blocking_scripts: number;
  detected_apps: string[];
  total_images: number;
  images_missing_alt: number;
  images_empty_alt: number;
  dual_urls_found: string[];
  links_count: number;
  myshopify_links?: number;
  intent_signals?: Record<string, boolean>;
}

// ─── Config ─────────────────────────────────────────────────────────────────

export const KNOWN_APPS: Record<string, string[]> = {
  'Google Analytics (GA4)': ['google-analytics.com', 'gtag/js', 'analytics.js'],
  'Google Tag Manager': ['googletagmanager.com/gtm.js'],
  'Meta Pixel (Facebook)': ['connect.facebook.net', 'fbevents.js'],
  'TikTok Pixel': ['analytics.tiktok.com'],
  'Pinterest Tag': ['s.pinimg.com/ct/core.js', 'pintrk'],
  'Microsoft Clarity': ['clarity.ms'],
  'Hotjar': ['static.hotjar.com'],
  'Klaviyo': ['static.klaviyo.com', 'klaviyo.js'],
  'Omnisend': ['omnisnippet', 'omnisend.com'],
  'Attentive': ['cdn.attn.tv'],
  'Postscript': ['sdk.postscript.io'],
  'Judge.me': ['cdn.judge.me', 'judgeme'],
  'Yotpo Reviews': ['staticw2.yotpo.com', 'yotpo.com'],
  'Loox Reviews': ['loox.io'],
  'Okendo': ['cdn.okendo.io', 'okendo-reviews'],
  'Stamped.io': ['stamped.io'],
  'Junip': ['junip.co'],
  'Gorgias': ['config.gorgias.chat', 'gorgias.chat'],
  'Zendesk': ['static.zdassets.com'],
  'Tidio': ['code.tidio.co'],
  'Recharge': ['rechargecdn.com', 'rechargepayments.com'],
  'Smile.io': ['cdn.sweettooth.io', 'smile.io'],
  'LoyaltyLion': ['sdk.loyaltylion.net'],
  'Algolia': ['algolia'],
  'Searchanise': ['searchanise'],
  'Boost Commerce': ['boost-pfs', 'boostcommerce'],
  'Shopify Core': ['cdn.shopify.com/shopifycloud'],
};

// Real browser UA with a tool suffix. Spoofing Googlebot from a non-Google IP gets
// blocked by Cloudflare/Shopify bot protection (they verify Googlebot by reverse DNS).
export const CRAWLER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 ForwardShopifyAudit/1.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export const PAGE_TIMEOUT_MS = 12_000;
export const CRAWL_DEADLINE_MS = 45_000;

/*
 * Shopify rate-limits storefront *catalog* routes (/products/*, /collections/*, and their
 * .js/.json variants) per client IP. The catalog-wide feeds /products.json and /collections.json
 * were not limited in testing (see lib/engine/catalog-feed.ts). A limited request gets `429 local_rate_limited` with
 * `Retry-After: 60`, served by Shopify's edge (Cloudflare). It is not a bot challenge and
 * the User-Agent makes no difference. Homepage, /pages/*, /blogs/* and sitemaps are not
 * limited the same way.
 *
 * The only reliable way through is to stay under the limit and honour Retry-After, so the
 * crawler paces catalog requests and pauses everything when the store asks it to.
 */
export const CATALOG_GAP_START_MS = 1200; // initial spacing between catalog requests
export const CATALOG_GAP_MIN_MS = 700;
export const CATALOG_GAP_MAX_MS = 6000;
export const OTHER_GAP_MS = 250; // homepage, /pages, /blogs
export const DEFAULT_MAX_PAGES = 40;
/** Cap for the single-request /api/audit route, which must finish inside one 60s invocation. */
export const HARD_MAX_PAGES = 150;
/** Safety cap for "all pages" mode in the batched flow (browser drives the crawl). */
export const ALL_PAGES_LIMIT = 25_000;

// ─── Utilities ──────────────────────────────────────────────────────────────

export async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}) {
  // guardedFetch refuses private/local targets and re-checks every redirect hop (SSRF guard).
  return guardedFetch(url, {
    ...init,
    headers: { ...CRAWLER_HEADERS, ...(init.headers || {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function normalizeUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = '';
    x.search = '';
    let path = x.pathname.replace(/\/+$/, '');
    return `${x.protocol}//${x.hostname.toLowerCase()}${path}`;
  } catch {
    return u.replace(/\/+$/, '').toLowerCase();
  }
}

export function errMsg(e: any): string {
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'timeout';
  return e?.cause?.code || e?.message || 'fetch failed';
}

/** A real WAF/Cloudflare challenge page (needs a browser or human). Not the same as a rate limit. */
export function isBotChallenge(status: number, html: string): boolean {
  if (status !== 403 && status !== 503) return false;
  const l = html.slice(0, 20000).toLowerCase();
  return (
    l.includes('cf-chl') ||
    l.includes('challenge-platform') ||
    l.includes('just a moment') ||
    l.includes('attention required') ||
    l.includes('captcha')
  );
}

export function parseRetryAfterMs(h: string | null, fallbackMs = 60_000): number {
  if (!h) return fallbackMs;
  const secs = Number(h);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const date = Date.parse(h);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : fallbackMs;
}

export function isCatalogRoute(url: string): boolean {
  try {
    const p = new URL(url).pathname.replace(/^\/[a-z]{2}(-[a-z]{2})?(?=\/)/i, '');
    return /^\/(products|collections)(\/|$)/.test(p);
  } catch {
    return false;
  }
}

/**
 * Paces requests for one crawl. Catalog routes share an adaptive gap (AIMD: shrink slowly on
 * success, double on 429). A 429 pauses *all* catalog requests until Retry-After has passed.
 * State is serialisable so a client can carry it across several serverless invocations.
 */
export interface LimiterState {
  catalogGapMs: number;
  pausedUntil: number; // epoch ms
  consecutive429: number; // 429s since the last successful catalog request
}

const MAX_PAUSE_MS = 10 * 60_000;

export class PoliteLimiter {
  state: LimiterState;
  private lastCatalog = 0;
  private lastOther = 0;

  constructor(state?: Partial<LimiterState>) {
    this.state = {
      catalogGapMs: Math.min(CATALOG_GAP_MAX_MS, Math.max(CATALOG_GAP_MIN_MS, state?.catalogGapMs || CATALOG_GAP_START_MS)),
      pausedUntil: state?.pausedUntil || 0,
      consecutive429: state?.consecutive429 || 0,
    };
  }

  /** Ms to wait before this URL may be requested. */
  delayFor(url: string, now = Date.now()): number {
    if (isCatalogRoute(url)) {
      return Math.max(0, this.state.pausedUntil - now, this.lastCatalog + this.state.catalogGapMs - now);
    }
    return Math.max(0, this.lastOther + OTHER_GAP_MS - now);
  }

  markSent(url: string) {
    if (isCatalogRoute(url)) this.lastCatalog = Date.now();
    else this.lastOther = Date.now();
  }

  onSuccess(url: string) {
    if (isCatalogRoute(url)) {
      this.state.catalogGapMs = Math.max(CATALOG_GAP_MIN_MS, Math.round(this.state.catalogGapMs * 0.95));
      this.state.consecutive429 = 0;
    }
  }

  /**
   * Every request made during Shopify's penalty window restarts the window, so probing right at
   * Retry-After can keep an IP blocked indefinitely. Repeated 429s back off exponentially.
   */
  onRateLimited(retryAfterMs: number) {
    this.state.consecutive429++;
    const backoff = Math.min(MAX_PAUSE_MS, retryAfterMs * 2 ** (this.state.consecutive429 - 1));
    this.state.pausedUntil = Math.max(this.state.pausedUntil, Date.now() + backoff);
    this.state.catalogGapMs = Math.min(CATALOG_GAP_MAX_MS, this.state.catalogGapMs * 2);
  }
}

/** Stride-sample so we cover the whole list, not just the first N entries. */
export function sample<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list.slice();
  const out: T[] = [];
  const step = list.length / n;
  for (let i = 0; i < n; i++) out.push(list[Math.floor(i * step)]);
  return out;
}

export function typesOf(entity: any): string[] {
  const t = entity?.['@type'];
  if (!t) return [];
  return (Array.isArray(t) ? t : [t]).map(String);
}

/** Flattens arrays and @graph containers into a flat list of entities. */
export function flattenJsonLd(node: any, out: any[] = []): any[] {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => flattenJsonLd(n, out));
    return out;
  }
  if (typeof node !== 'object') return out;
  if (node['@graph']) flattenJsonLd(node['@graph'], out);
  if (node['@type']) out.push(node);
  return out;
}

export function asArray<T = any>(x: any): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

// ─── HTML analysis ──────────────────────────────────────────────────────────

export function extractJsonLd($: CheerioAPI): { entities: any[]; invalid: number } {
  const entities: any[] = [];
  let invalid = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      flattenJsonLd(JSON.parse(raw), entities);
    } catch {
      invalid++;
    }
  });
  return { entities, invalid };
}

export function analyzeScripts($: CheerioAPI, html: string, host: string) {
  let total = 0;
  let thirdParty = 0;
  let renderBlocking = 0;
  $('script[src]').each((_, el) => {
    const $el = $(el);
    const type = ($el.attr('type') || '').toLowerCase();
    if (type && type !== 'text/javascript' && type !== 'module' && type !== 'application/javascript') return;
    total++;
    const src = $el.attr('src') || '';
    try {
      const h = new URL(src, `https://${host}`).hostname;
      if (h !== host && !h.endsWith('cdn.shopify.com') && !h.endsWith('shopifycdn.com')) thirdParty++;
    } catch {}
    const inHead = $el.parents('head').length > 0;
    const deferred = $el.attr('async') !== undefined || $el.attr('defer') !== undefined || type === 'module';
    if (inHead && !deferred) renderBlocking++;
  });

  const lower = html.toLowerCase();
  const apps = Object.entries(KNOWN_APPS)
    .filter(([, sigs]) => sigs.some((s) => lower.includes(s)))
    .map(([app]) => app);
  return { total, thirdParty, renderBlocking, apps };
}

export function analyzeImages($: CheerioAPI) {
  let total = 0;
  let missingAlt = 0;
  let emptyAlt = 0;
  $('img').each((_, el) => {
    if ($(el).parents('noscript').length) return;
    total++;
    const alt = $(el).attr('alt');
    if (alt === undefined) missingAlt++;
    else if (alt.trim() === '') emptyAlt++;
  });
  return { total, missingAlt, emptyAlt };
}

export function wordCount(text: string) {
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9À-￿]/.test(w)).length;
}

export function findCollectionDescriptionWords($: CheerioAPI): number {
  const selectors = [
    '.collection-hero__description',
    '.collection__description',
    '.collection-description',
    '[class*="collection-description"]',
    '[class*="collection__description"]',
    '[class*="collection-header"] .rte',
    '.collection-hero .rte',
    '.page-header .rte',
  ];
  let best = 0;
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      best = Math.max(best, wordCount($(el).text()));
    });
  }
  return best;
}

export function checkProductSchema(entities: any[]): { findings: string[]; requiredMissing: number; recommendedMissing: number; product: any | null } {
  const products = entities.filter((e) => typesOf(e).some((t) => t === 'Product' || t === 'ProductGroup'));
  const findings: string[] = [];
  if (products.length === 0) {
    return { findings: ['Missing Product JSON-LD schema'], requiredMissing: 1, recommendedMissing: 0, product: null };
  }
  const p = products[0];

  // Collect offers from Offer, Offer[], AggregateOffer.offers and ProductGroup.hasVariant[].offers
  const offers: any[] = [];
  for (const o of asArray(p.offers)) {
    if (typesOf(o).includes('AggregateOffer')) {
      offers.push(o, ...asArray(o.offers));
    } else offers.push(o);
  }
  for (const v of asArray(p.hasVariant)) offers.push(...asArray(v?.offers));

  // Google allows return policy at Organization level too.
  const orgReturnPolicy = entities.some(
    (e) => typesOf(e).some((t) => t === 'Organization' || t === 'OnlineStore') && e.hasMerchantReturnPolicy
  );

  let requiredMissing = 0;
  let recommendedMissing = 0;
  const req = (cond: boolean, msg: string) => {
    if (!cond) {
      findings.push(msg);
      requiredMissing++;
    }
  };
  const rec = (cond: boolean, msg: string) => {
    if (!cond) {
      findings.push(msg);
      recommendedMissing++;
    }
  };

  req(!!p.name, 'Missing Product.name');
  req(offers.length > 0 || !!p.review || !!p.aggregateRating, 'Missing Product.offers');
  if (offers.length > 0) {
    req(offers.some((o) => o.price !== undefined || o.lowPrice !== undefined || o.priceSpecification), 'Missing Offer.price');
    req(offers.some((o) => o.priceCurrency || o.priceSpecification?.priceCurrency), 'Missing Offer.priceCurrency');
    rec(offers.some((o) => o.availability), 'Missing Offer.availability');
    rec(offers.some((o) => o.shippingDetails), 'Missing Offer.shippingDetails');
    rec(offers.some((o) => o.hasMerchantReturnPolicy) || orgReturnPolicy, 'Missing Offer.hasMerchantReturnPolicy');
  }
  rec(!!p.image, 'Missing Product.image');
  rec(!!p.brand, 'Missing Product.brand');
  rec(!!(p.sku || p.gtin || p.gtin8 || p.gtin12 || p.gtin13 || p.gtin14 || p.mpn), 'Missing Product identifier (sku/gtin/mpn)');

  const distinctNames = new Set(products.map((x) => String(x.name || '').trim().toLowerCase()).filter(Boolean));
  if (products.length > 1) {
    findings.push(`Found ${products.length} conflicting Product schemas on page${distinctNames.size > 1 ? ' (different names)' : ''}`);
  }
  return { findings, requiredMissing, recommendedMissing, product: p };
}

export function auditHtml(
  html: string,
  meta: { url: string; finalUrl: string; status: number; latency: number; type: string; host: string }
): PageAuditResult {
  const $ = load(html);
  const { url, finalUrl, status, latency, type, host } = meta;

  const title = $('head title').first().text().trim() || $('title').first().text().trim();
  const metaDesc = ($('meta[name="description" i]').attr('content') || '').trim();
  const metaRobots = ($('meta[name="robots" i]').attr('content') || '').toLowerCase();
  const h1s = $('h1');
  const h1 = h1s.first().text().replace(/\s+/g, ' ').trim();

  // Canonical
  const canonicalHref = $('link[rel="canonical"]').attr('href');
  let canonical = '';
  let canonicalStatus: PageAuditResult['canonical_status'] = 'missing';
  if (canonicalHref) {
    try {
      canonical = new URL(canonicalHref, finalUrl).toString();
      const cHost = new URL(canonical).hostname.replace(/^www\./, '');
      const fHost = new URL(finalUrl).hostname.replace(/^www\./, '');
      if (cHost !== fHost) canonicalStatus = 'cross_domain';
      else canonicalStatus = normalizeUrl(canonical).replace(/^https?:\/\/(www\.)?/, '') === normalizeUrl(finalUrl).replace(/^https?:\/\/(www\.)?/, '') ? 'match' : 'mismatch';
    } catch {
      canonical = canonicalHref;
      canonicalStatus = 'mismatch';
    }
  }

  const { entities, invalid } = extractJsonLd($);
  const schemaTypes = Array.from(new Set(entities.flatMap(typesOf)));
  const scripts = analyzeScripts($, html, host);
  const images = analyzeImages($);

  // Links
  let internalLinks = 0;
  let myshopifyLinks = 0;
  const dual = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    try {
      const u = new URL(href, finalUrl);
      if (u.hostname.replace(/^www\./, '') === host.replace(/^www\./, '')) {
        internalLinks++;
        if (/\/collections\/[^/]+\/products\//.test(u.pathname)) dual.add(u.pathname);
      } else if (u.hostname.endsWith('.myshopify.com') && !host.endsWith('.myshopify.com')) {
        myshopifyLinks++;
      }
    } catch {}
  });

  // Visible text
  const $body = load(html);
  $body('script, style, noscript, svg, template, iframe, header, footer, nav, [role="navigation"]').remove();
  // Prefer <main> so mega-menus and footers don't inflate the content word count.
  const $main = $body('main').first();
  const words = wordCount(($main.length ? $main : $body('body')).text());

  const hasFaq =
    schemaTypes.includes('FAQPage') ||
    $('details summary').length >= 2 ||
    $('h2, h3, h4')
      .toArray()
      .some((el) => /faq|frequently asked/i.test($(el).text()));

  // Schema checks per page type
  const findings: string[] = [];
  let schemaScore = 100;
  let intentSignals: Record<string, boolean> | undefined;
  let definitionWords = 0;

  if (invalid > 0) {
    findings.push(`${invalid} JSON-LD block(s) contain invalid JSON (ignored by Google)`);
    schemaScore -= 15 * invalid;
  }

  if (type === 'product') {
    const r = checkProductSchema(entities);
    findings.push(...r.findings);
    schemaScore -= r.requiredMissing * 30 + r.recommendedMissing * 8;
    if (r.findings.some((f) => f.includes('conflicting'))) schemaScore -= 15;

    const offers = r.product ? asArray(r.product.offers) : [];
    intentSignals = {
      add_to_cart_form:
        $('form[action*="/cart/add"], button[name="add"]').length > 0 ||
        $('button')
          .toArray()
          .some((el) => /add to (cart|bag|basket)/i.test($(el).text())),
      price_in_schema: offers.some((o) => o?.price !== undefined || o?.lowPrice !== undefined),
      reviews_or_rating: !!r.product?.aggregateRating || scripts.apps.some((a) => /Judge|Yotpo|Loox|Okendo|Stamped|Junip/.test(a)),
      multiple_images: images.total >= 3,
      meta_description: metaDesc.length > 0,
      substantive_content: words >= 250,
    };
  } else if (type === 'collection') {
    if (!schemaTypes.includes('BreadcrumbList')) {
      findings.push('Missing BreadcrumbList schema');
      schemaScore -= 25;
    }
    if (!schemaTypes.includes('ItemList') && !schemaTypes.includes('CollectionPage')) {
      findings.push('Missing ItemList/CollectionPage schema');
      schemaScore -= 25;
    }
    definitionWords = findCollectionDescriptionWords($);
  } else if (type === 'home') {
    if (!schemaTypes.includes('Organization') && !schemaTypes.includes('OnlineStore')) {
      findings.push('Missing Organization schema');
      schemaScore -= 35;
    }
    if (!schemaTypes.includes('WebSite')) {
      findings.push('Missing WebSite schema');
      schemaScore -= 15;
    }
  } else if (type === 'article') {
    if (!schemaTypes.some((t) => t === 'Article' || t === 'BlogPosting' || t === 'NewsArticle')) {
      findings.push('Missing Article/BlogPosting schema');
      schemaScore -= 40;
    }
  }

  return {
    url,
    final_url: finalUrl,
    redirected: normalizeUrl(url) !== normalizeUrl(finalUrl),
    page_type: type,
    status_code: status,
    fetch_error: null,
    blocked: false,
    response_time_ms: latency,
    content_size_bytes: Buffer.byteLength(html),
    title,
    title_length: title.length,
    meta_description: metaDesc,
    meta_description_length: metaDesc.length,
    meta_robots: metaRobots,
    noindex: metaRobots.includes('noindex'),
    h1,
    h1_count: h1s.length,
    h2_count: $('h2').length,
    h3_count: $('h3').length,
    canonical_url: canonical,
    canonical_status: canonicalStatus,
    is_canonical_match: canonicalStatus === 'match',
    word_count: words,
    has_faq_content: hasFaq,
    has_definition_paragraph: type === 'collection' ? definitionWords >= 40 : false,
    definition_word_count: definitionWords,
    // Large ProductGroup graphs can be 100KB+; keep the payload small enough to post between batches.
    json_ld_entities: JSON.stringify(entities).length <= 20_000 ? entities : [],
    invalid_json_ld_blocks: invalid,
    schema_score: Math.max(0, Math.min(100, schemaScore)),
    schema_types: schemaTypes,
    schema_findings: findings,
    script_count: scripts.total,
    third_party_scripts: scripts.thirdParty,
    render_blocking_scripts: scripts.renderBlocking,
    detected_apps: scripts.apps,
    total_images: images.total,
    images_missing_alt: images.missingAlt,
    images_empty_alt: images.emptyAlt,
    dual_urls_found: Array.from(dual).slice(0, 10),
    links_count: internalLinks,
    myshopify_links: myshopifyLinks,
    intent_signals: intentSignals,
  };
}

export function failedPage(
  url: string,
  type: string,
  status: number,
  latency: number,
  error: string | null,
  blocked: boolean,
  rateLimited = false,
  retryAfterMs = 0
): PageAuditResult {
  return {
    url,
    final_url: url,
    redirected: false,
    page_type: type,
    status_code: status,
    fetch_error: error,
    blocked,
    rate_limited: rateLimited,
    retry_after_ms: retryAfterMs,
    response_time_ms: latency,
    content_size_bytes: 0,
    title: '',
    title_length: 0,
    meta_description: '',
    meta_description_length: 0,
    meta_robots: '',
    noindex: false,
    h1: '',
    h1_count: 0,
    h2_count: 0,
    h3_count: 0,
    canonical_url: '',
    canonical_status: 'n/a',
    is_canonical_match: true,
    word_count: 0,
    has_faq_content: false,
    has_definition_paragraph: false,
    definition_word_count: 0,
    json_ld_entities: [],
    invalid_json_ld_blocks: 0,
    schema_score: 0,
    schema_types: [],
    schema_findings: [],
    script_count: 0,
    third_party_scripts: 0,
    render_blocking_scripts: 0,
    detected_apps: [],
    total_images: 0,
    images_missing_alt: 0,
    images_empty_alt: 0,
    dual_urls_found: [],
    links_count: 0,
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One request, no retries. Rate limits are reported back so the caller's limiter can pause. */
export async function auditUrl(url: string, type: string, host: string): Promise<PageAuditResult> {
  const start = Date.now();
  try {
    const resp = await fetchWithTimeout(url, PAGE_TIMEOUT_MS);
    const html = await resp.text();
    const latency = Date.now() - start;
    if (resp.status === 429) {
      const retryAfterMs = parseRetryAfterMs(resp.headers.get('retry-after'));
      const reason = html.trim().slice(0, 40) || 'rate limited';
      return failedPage(url, type, 429, latency, `HTTP 429 (${reason})`, false, true, retryAfterMs);
    }
    if (!resp.ok) {
      return failedPage(url, type, resp.status, latency, `HTTP ${resp.status}`, isBotChallenge(resp.status, html));
    }
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('html')) {
      return failedPage(url, type, resp.status, latency, `Non-HTML response (${ct || 'unknown'})`, false);
    }
    return auditHtml(html, { url, finalUrl: resp.url || url, status: resp.status, latency, type, host });
  } catch (e) {
    return failedPage(url, type, 0, Date.now() - start, errMsg(e), false);
  }
}

export interface CrawlBatchResult {
  results: PageAuditResult[];
  remaining: Array<{ url: string; type: string }>;
  limiter: LimiterState;
  /** >0 when Shopify asked us to wait longer than this invocation can. */
  waitMs: number;
}

/**
 * Crawls targets sequentially through the limiter until done, the deadline, or a rate-limit
 * pause too long to sit out inside this invocation. Rate-limited URLs are re-queued, not failed.
 */
export async function crawlBatch(
  targets: Array<{ url: string; type: string }>,
  host: string,
  limiterState: Partial<LimiterState> | undefined,
  deadline: number,
  maxInlineWaitMs = 8000
): Promise<CrawlBatchResult> {
  const limiter = new PoliteLimiter(limiterState);
  const queue = targets.slice();
  const results: PageAuditResult[] = [];

  while (queue.length > 0) {
    // Prefer a target we can fetch now (non-catalog pages aren't affected by catalog pauses).
    let pick = 0;
    let bestDelay = Infinity;
    for (let i = 0; i < Math.min(queue.length, 20); i++) {
      const dly = limiter.delayFor(queue[i].url);
      if (dly < bestDelay) {
        bestDelay = dly;
        pick = i;
        if (dly === 0) break;
      }
    }

    if (bestDelay > maxInlineWaitMs) {
      return { results, remaining: queue, limiter: limiter.state, waitMs: bestDelay };
    }
    if (Date.now() + bestDelay + PAGE_TIMEOUT_MS > deadline) break;
    if (bestDelay > 0) await sleep(bestDelay);

    const t = queue[pick];
    limiter.markSent(t.url);
    const r = await auditUrl(t.url, t.type, host);
    if (r.rate_limited) {
      limiter.onRateLimited(r.retry_after_ms || 60_000);
      continue; // keep it queued; the limiter now blocks catalog routes until Retry-After passes
    }
    queue.splice(pick, 1);
    limiter.onSuccess(t.url);
    results.push(r);
  }
  return { results, remaining: queue, limiter: limiter.state, waitMs: 0 };
}

// ─── Discovery ──────────────────────────────────────────────────────────────

export type Discovery = {
  products: string[];
  collections: string[];
  pages: string[];
  blogs: string[];
  articles: string[];
  brokenSitemaps: Array<{ url: string; status: number; sitemap: string }>;
  sitemapFound: boolean;
  notes: string[];
};

export function extractLocs(xml: string): string[] {
  const $ = load(xml, { xml: true });
  return $('loc')
    .toArray()
    .map((el) => $(el).text().trim())
    .filter((u) => u.startsWith('http'));
}

export function classifyUrl(u: string): keyof Pick<Discovery, 'products' | 'collections' | 'pages' | 'blogs' | 'articles'> | null {
  let path: string;
  try {
    path = new URL(u).pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
  // Strip a locale prefix like /en-ca or /fr
  path = path.replace(/^\/[a-z]{2}(-[a-z]{2})?(?=\/)/i, '');
  if (/^\/products\/[^/]+$/.test(path)) return 'products';
  if (/^\/collections\/[^/]+$/.test(path) && !path.endsWith('/all')) return 'collections';
  if (/^\/pages\/[^/]+$/.test(path)) return 'pages';
  if (/^\/blogs\/[^/]+\/[^/]+$/.test(path)) return 'articles';
  if (/^\/blogs\/[^/]+$/.test(path)) return 'blogs';
  return null;
}

/** Non-Shopify sites: classify by common URL conventions; everything else is a content page. */
export function classifyGenericUrl(u: string): keyof Pick<Discovery, 'products' | 'collections' | 'pages' | 'blogs' | 'articles'> | null {
  let p: URL;
  try {
    p = new URL(u);
  } catch {
    return null;
  }
  const path = p.pathname.replace(/\/+$/, '');
  if (!path || /\.(xml|pdf|jpe?g|png|gif|webp|svg|zip)$/i.test(path)) return null;
  if (/\/(product|products|item)\/[^/]+$/i.test(path)) return 'products';
  if (/\/(product-category|category|categories|collections?)\/[^/]+$/i.test(path)) return 'collections';
  if (/\/(blog|blogs|news|articles?|posts?|insights|stories)\/[^/]+/i.test(path) || /\/\d{4}\/\d{2}\//.test(path)) return 'articles';
  return 'pages';
}

export async function discoverStorePages(baseUrl: string, shopify = true): Promise<Discovery> {
  const d: Discovery = { products: [], collections: [], pages: [], blogs: [], articles: [], brokenSitemaps: [], sitemapFound: false, notes: [] };
  const add = (u: string) => {
    const t = shopify ? classifyUrl(u) : classifyGenericUrl(u);
    if (t) d[t].push(u);
  };

  // Shopify always serves /sitemap.xml. Other platforms often name their index differently.
  let indexUrl = `${baseUrl}/sitemap.xml`;
  if (!shopify) {
    for (const name of ['sitemap.xml', 'sitemap_index.xml', 'wp-sitemap.xml']) {
      const r = await fetchWithTimeout(`${baseUrl}/${name}`, 10_000).catch(() => null);
      const body = r?.ok ? await r.text().catch(() => '') : '';
      if (/<(urlset|sitemapindex)/i.test(body)) {
        indexUrl = `${baseUrl}/${name}`;
        break;
      }
    }
  }
  try {
    const res = await fetchWithTimeout(indexUrl, 10_000);
    if (res.ok) {
      d.sitemapFound = true;
      const xml = await res.text();
      const isIndex = /<sitemapindex/i.test(xml);
      const locs = extractLocs(xml);
      if (!isIndex) {
        locs.forEach(add);
      } else {
        // Same-host child sitemaps only (skip other market/locale indexes to avoid duplicates)
        const children = locs.filter((u) => {
          try {
            const p = new URL(u);
            return p.hostname === new URL(baseUrl).hostname && !/^\/[a-z]{2}(-[a-z]{2})?\/sitemap/i.test(p.pathname);
          } catch {
            return false;
          }
        });
        await mapWithConcurrency(children, 6, async (sub) => {
          try {
            const r = await fetchWithTimeout(sub, 10_000);
            if (r.ok) extractLocs(await r.text()).forEach(add);
            else d.brokenSitemaps.push({ url: sub, status: r.status, sitemap: indexUrl });
          } catch (e) {
            d.brokenSitemaps.push({ url: sub, status: 0, sitemap: indexUrl });
          }
        });
      }
    } else {
      d.notes.push(`sitemap.xml returned HTTP ${res.status}`);
    }
  } catch (e) {
    d.notes.push(`sitemap.xml could not be fetched (${errMsg(e)})`);
  }

  // Shopify-only fallback when the sitemap gave us nothing. (Catalog checks read the full feed separately.)
  if (shopify && (d.products.length === 0 || d.collections.length === 0)) try {
    const [pResp, cResp] = await Promise.all([
      fetchWithTimeout(`${baseUrl}/products.json?limit=250`, 10_000).catch(() => null),
      fetchWithTimeout(`${baseUrl}/collections.json?limit=250`, 10_000).catch(() => null),
    ]);
    if (pResp?.ok) {
      const pData = await pResp.json().catch(() => ({}));
      for (const p of pData.products || []) if (p.handle) d.products.push(`${baseUrl}/products/${p.handle}`);
    }
    if (cResp?.ok) {
      const cData = await cResp.json().catch(() => ({}));
      for (const c of cData.collections || []) if (c.handle && c.handle !== 'frontpage') d.collections.push(`${baseUrl}/collections/${c.handle}`);
    }
  } catch {}

  const dedupe = (arr: string[]) => {
    const seen = new Set<string>();
    return arr.filter((u) => {
      const k = normalizeUrl(u);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  d.products = dedupe(d.products);
  d.collections = dedupe(d.collections);
  d.pages = dedupe(d.pages);
  d.blogs = dedupe(d.blogs);
  d.articles = dedupe(d.articles);
  return d;
}

/** Splits the page budget across types, reallocating unused slots. */
export function allocate(budget: number, pools: Record<string, string[]>, weights: Record<string, number>) {
  const keys = Object.keys(pools);
  const alloc: Record<string, number> = {};
  keys.forEach((k) => (alloc[k] = 0));
  let remaining = budget;
  let active = keys.filter((k) => pools[k].length > 0);
  while (remaining > 0 && active.length > 0) {
    const totalW = active.reduce((s, k) => s + weights[k], 0);
    let given = 0;
    for (const k of active) {
      const share = Math.max(1, Math.floor((remaining * weights[k]) / totalW));
      const take = Math.min(share, pools[k].length - alloc[k], remaining - given);
      alloc[k] += take;
      given += take;
    }
    if (given === 0) break;
    remaining -= given;
    active = active.filter((k) => alloc[k] < pools[k].length);
  }
  return alloc;
}

// ─── Scoring helpers ────────────────────────────────────────────────────────

export { ratio, avg, round1 } from "./scoring";
