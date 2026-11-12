import { classifyGenericUrl, crawlBatch, isCatalogRoute, normalizeUrl, sleep, type LimiterState, type PageAuditResult } from '../audit/core';
import { discover, typeForPath } from '../audit/discover';
import { aggregateApps } from './apps';
import { fetchCatalogFeed } from './catalog-feed';
import { fetchCrux } from './crux';
import { fetchAhrefs } from './ahrefs';
import { runBrowserTests } from './browser';
import { appFindings, browserFindings, crawlFindings, cruxFindings, lighthouseFindings, mergeFindings, ownerFindings, siteFindings } from './findings';
import { runOwnerAudit, type OwnerCredentials } from './shopify-admin';
import { runPageSpeed } from './psi';
import { scoreRun } from './scoring';
import { runSiteChecks } from './site-checks';
import { listRuns, loadRun, saveRun, saveScreenshot } from './store';
import type { CrawledPage, CruxData, ModuleId, PageSpeedTest, Run } from './types';

const PSI_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.PSI_CONCURRENCY) || 8));
const PSI_MAX_ATTEMPTS = 3;
// Stop waiting for Shopify's catalog rate limit after this long paused with no progress. Every
// request inside the penalty window restarts it, so long waits rarely pay off from a flagged IP.
const CRAWL_MAX_WAIT_MS = Math.max(0, Number(process.env.CRAWL_MAX_WAIT_MS) || 120_000);
// Pages still blocked at the end may reuse a successful crawl of the same URL from a recent run.
const CRAWL_CACHE_MAX_AGE_MS = Math.max(0, Number(process.env.CRAWL_CACHE_HOURS ?? 72)) * 3600_000;
export const MAX_PAGES = 100;
/** Page cap for live (no-storage) audits, which must finish within one request. */
export const LIVE_MAX_PAGES = Math.min(MAX_PAGES, Math.max(1, Number(process.env.LIVE_MAX_PAGES) || 30));

type CachedPage = { page: CrawledPage; runId: string; crawledAt: string };

const GENERIC_TYPE = { products: 'product', collections: 'collection', pages: 'page', articles: 'article', blogs: 'blog' } as const;
function genericType(u: string): string {
  try {
    if (new URL(u).pathname.replace(/\/+$/, '') === '') return 'home';
  } catch {}
  const t = classifyGenericUrl(u);
  return t ? GENERIC_TYPE[t] : 'page';
}

/** Successful crawls of this host from recent completed runs, newest first, keyed by normalized URL. */
async function recentCrawlCache(host: string, excludeId: string): Promise<Map<string, CachedPage>> {
  const cache = new Map<string, CachedPage>();
  if (!CRAWL_CACHE_MAX_AGE_MS) return cache;
  const cutoff = Date.now() - CRAWL_CACHE_MAX_AGE_MS;
  const runs = (await listRuns(60)).filter((r) => r.id !== excludeId && r.host === host && r.status === 'completed' && Date.parse(r.createdAt) >= cutoff).slice(0, 10);
  for (const s of runs) {
    const r = await loadRun(s.id);
    for (const p of r?.crawl || []) {
      if (p.error || p.rateLimited || p.cachedFrom) continue; // never chain cached copies
      const k = normalizeUrl(p.url);
      if (!cache.has(k)) cache.set(k, { page: p, runId: s.id, crawledAt: r!.finishedAt || s.createdAt });
    }
  }
  return cache;
}

export function toCrawled(p: PageAuditResult): CrawledPage {
  return {
    url: p.url,
    type: p.page_type,
    status: p.status_code,
    error: p.fetch_error,
    rateLimited: !!p.rate_limited,
    blocked: p.blocked,
    responseMs: p.response_time_ms,
    title: p.title,
    metaDescription: p.meta_description,
    metaRobots: p.meta_robots,
    noindex: p.noindex,
    h1Count: p.h1_count,
    h1: p.h1,
    canonical: p.canonical_url,
    canonicalStatus: p.canonical_status,
    wordCount: p.word_count,
    schemaTypes: p.schema_types,
    schemaFindings: p.schema_findings,
    invalidJsonLd: p.invalid_json_ld_blocks,
    hasFaq: p.has_faq_content,
    definitionWords: p.definition_word_count,
    totalImages: p.total_images,
    imagesMissingAlt: p.images_missing_alt,
    dualUrls: p.dual_urls_found,
    internalLinks: p.links_count,
    scriptCount: p.script_count,
    thirdPartyScripts: p.third_party_scripts,
    renderBlockingScripts: p.render_blocking_scripts,
    detectedApps: p.detected_apps,
    intentSignals: p.intent_signals,
    myshopifyLinks: p.myshopify_links,
  };
}

export interface PipelineHooks {
  apiKey?: string;
  owner?: OwnerCredentials;
  isCancelled: () => boolean;
  /**
   * Epoch ms after which no new work starts (serverless time limit). Work not started by then is
   * reported as not run, never as passing, and the report is built from what finished.
   */
  deadline?: number;
}

/** Runs one audit end to end, mutating and periodically persisting `run`. */
export async function executeRun(run: Run, hooks: PipelineHooks): Promise<void> {
  let lastSave = 0;
  const persist = async (force = false) => {
    if (!force && Date.now() - lastSave < 1500) return;
    lastSave = Date.now();
    await saveRun(run);
  };
  const timeUp = () => !!hooks.deadline && Date.now() >= hooks.deadline;
  const stopping = () => hooks.isCancelled() || timeUp();
  // Each PageSpeed call may use at most the time left before the deadline (Google needs ~15 s minimum).
  const psiTimeout = () => (hooks.deadline ? Math.max(15_000, hooks.deadline - Date.now()) : undefined);
  const stage = async (s: string, message?: string) => {
    run.progress.stage = s;
    run.progress.message = message;
    await persist(true);
  };

  // 1. Discovery
  await stage('discovering', 'Loading homepage and sitemaps');
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(run.input.url) ? run.input.url : `https://${run.input.url}`);
  } catch {
    throw new Error(`Invalid URL: ${run.input.url}`);
  }
  const pages = Math.max(1, Math.min(MAX_PAGES, run.input.pages));
  const d = await discover(parsed, pages);
  if (d.ok === false) throw new Error(d.message);
  const ctx = d.ctx;
  const shopify = ctx.platform.id === 'shopify';
  run.store = { inputHost: ctx.inputHost, baseUrl: ctx.baseUrl, host: ctx.host, handle: ctx.storeHandle, platform: ctx.platform };
  run.discovery = { ...ctx.discovery.counts, sitemapFound: ctx.discovery.sitemapFound, brokenSitemaps: ctx.discovery.brokenSitemaps.length };
  // The sampling note doesn't apply when the user chose the URLs.
  run.warnings.push(...ctx.warnings.filter((w) => !(run.input.customUrls?.length && w.startsWith('Audited a sample'))));

  const homeUrl = ctx.baseUrl + '/';
  let others = ctx.targets;
  if (run.input.customUrls?.length) {
    const rejected: string[] = [];
    others = run.input.customUrls
      .map((u) => u.trim())
      .filter(Boolean)
      .filter((u) => {
        try {
          const h = new URL(u).hostname.replace(/^www\./, '');
          const ok = h === ctx.host.replace(/^www\./, '') || h === ctx.inputHost.replace(/^www\./, '');
          if (!ok) rejected.push(u);
          return ok;
        } catch {
          rejected.push(u);
          return false;
        }
      })
      .map((u) => ({ url: u.replace(`//${ctx.inputHost}`, `//${ctx.host}`), type: shopify ? typeForPath(u) : genericType(u) }))
      .filter((t) => t.type !== 'home')
      .slice(0, pages - 1);
    if (rejected.length) run.warnings.push(`${rejected.length} custom URLs were skipped because they are not on ${ctx.host}.`);
  }
  run.targets = [{ url: homeUrl, type: 'home' }, ...others];
  run.psiTests = run.targets.flatMap((t) => run.input.strategies.map((s) => ({ url: t.url, type: t.type, strategy: s, status: 'pending' as const, attempts: 0 })));
  run.progress.psiTotal = run.psiTests.length;
  run.progress.crawlTotal = run.targets.length;
  run.crawl = [toCrawled(ctx.homePage)];
  run.progress.crawlDone = 1;
  await stage('testing', 'Running PageSpeed Insights, crawl and site checks');

  // 2a. PageSpeed Insights (Google runs Lighthouse; not affected by Shopify rate limits)
  const psiTask = async () => {
    if (!hooks.apiKey) run.warnings.push('No PSI_API_KEY configured: PageSpeed requests use the shared anonymous quota and usually fail with HTTP 429.');
    let next = 0;
    let quotaBlocked = false;
    const worker = async () => {
      while (next < run.psiTests.length && !hooks.isCancelled()) {
        const t: PageSpeedTest = run.psiTests[next++];
        if (quotaBlocked || timeUp()) {
          t.status = 'failed';
          t.error = quotaBlocked ? 'Skipped: PSI quota exhausted' : 'Not run: audit time limit reached';
          run.progress.psiDone++;
          continue;
        }
        t.status = 'running';
        while (t.attempts < PSI_MAX_ATTEMPTS && !stopping()) {
          t.attempts++;
          const out = await runPageSpeed(t.url, t.strategy, hooks.apiKey, psiTimeout());
          if (out.ok === true) {
            t.result = out.result;
            if (out.screenshotData && t.strategy === 'mobile') {
              const key = `shot-${run.psiTests.indexOf(t)}`;
              t.result.screenshot = await saveScreenshot(run.id, key, out.screenshotData).catch(() => undefined);
            }
            t.status = 'done';
            t.error = undefined;
            break;
          }
          t.error = out.error;
          if (!out.retryable) break;
          const until = Date.now() + (out.retryAfterMs ?? 10_000 * t.attempts);
          while (Date.now() < until && !stopping()) await sleep(500);
        }
        if (t.status !== 'done') {
          t.status = 'failed';
          // Cut short by our own time limit, not a failure at Google.
          if (timeUp() && !hooks.isCancelled()) t.error = 'Not finished: audit time limit reached while Google was still testing';
          // Without a key, the anonymous quota won't recover during this run — stop wasting calls.
          if (!hooks.apiKey && /429/.test(t.error || '')) quotaBlocked = true;
        }
        run.progress.psiDone++;
        await persist();
      }
    };
    await Promise.all(Array.from({ length: PSI_CONCURRENCY }, worker));
  };

  // 2b. HTML crawl of the same pages (schema, canonicals, links), honouring Shopify's Retry-After
  const crawlTask = async () => {
    // One product and one collection first: they carry the template-level checks (schema, buy box)
    // and get through before a rate-limit window opens. Non-catalog pages are never paused.
    const firstOf = (type: string) => others.find((t) => t.type === type);
    const lead = [firstOf('product'), firstOf('collection')].filter(Boolean) as typeof others;
    let queue = [...lead, ...others.filter((t) => !lead.includes(t))];
    let limiter: Partial<LimiterState> | undefined;
    let stalled = 0;
    while (queue.length && !stopping()) {
      const batch = await crawlBatch(queue, ctx.host, limiter, Math.min(Date.now() + 40_000, hooks.deadline || Infinity));
      limiter = batch.limiter;
      queue = batch.remaining;
      run.crawl.push(...batch.results.map(toCrawled));
      run.progress.crawlDone = run.crawl.length;
      if (batch.results.length) stalled = 0;
      await persist();
      if (batch.waitMs > 0 && queue.length) {
        if (stalled + batch.waitMs > CRAWL_MAX_WAIT_MS) break;
        stalled += batch.waitMs;
        run.progress.waitUntil = Date.now() + batch.waitMs;
        run.progress.message = 'Shopify asked the crawler to pause (HTTP 429 Retry-After); PageSpeed tests continue meanwhile';
        await persist(true);
        const until = Date.now() + batch.waitMs;
        while (Date.now() < until && !stopping()) await sleep(1000);
        run.progress.waitUntil = undefined;
      }
    }
    if (!queue.length || hooks.isCancelled()) return;
    if (timeUp()) {
      run.crawl.push(...queue.map((t) => notCrawledPage(t, 'Not crawled: audit time limit reached')));
      run.warnings.push(`${queue.length} pages were not crawled because the audit reached its time limit. Audit fewer pages for a complete crawl.`);
      run.progress.crawlDone = run.crawl.length;
      return;
    }

    // Still blocked: fall back to a recent run's crawl of the same URL, clearly marked as cached.
    const cache = await recentCrawlCache(ctx.host, run.id).catch(() => new Map<string, CachedPage>());
    let reused = 0;
    for (const t of queue) {
      const hit = cache.get(normalizeUrl(t.url));
      if (hit) {
        run.crawl.push({ ...hit.page, cachedFrom: { runId: hit.runId, crawledAt: hit.crawledAt } });
        reused++;
      } else {
        run.crawl.push(blockedPage(t)); // shown as "429" on the Pages tab, excluded from checks
      }
    }
    const missing = queue.length - reused;
    const catalogBlocked = queue.some((t) => isCatalogRoute(t.url));
    const who = shopify ? 'Shopify' : 'The site';
    if (reused) run.warnings.push(`${reused} pages blocked by ${shopify ? "Shopify's" : 'the site’s'} rate limit were filled from a recent audit's crawl (marked “cached” on the Pages tab).`);
    if (missing) {
      run.warnings.push(
        `${missing} pages were not crawled: ${who} rate-limited this server's IP (HTTP 429)${shopify && catalogBlocked ? ' on product/collection pages' : ''}.` +
          (shopify ? ' Catalog-wide checks used the public product feed instead.' : '') +
          ' Running the tool from a server whose IP is not already limited avoids this.'
      );
    }
    run.progress.crawlDone = run.crawl.length;
    await persist(true);
  };

  // 2e. Whole-catalog checks from /products.json + /collections.json (not affected by the HTML rate limit)
  const catalogTask = async () => {
    if (!shopify || hooks.owner) return; // Shopify only; owner mode reads the same catalog with more fields
    run.catalog = await fetchCatalogFeed(ctx.baseUrl, stopping).catch((e) => ({ status: 'failed' as const, via: 'feed' as const, message: e?.message || String(e) }));
    if (run.catalog.status === 'failed') run.warnings.push(`Catalog feed: ${run.catalog.message}`);
    else if (run.catalog.message) run.warnings.push(`Catalog feed: ${run.catalog.message}`);
    await persist();
  };

  // 2b'. Browser tests (Playwright) on a few representative pages, after the crawl
  const browserTask = async () => {
    if (run.input.browserTests === false || stopping()) return;
    const cartFlow = !!run.input.cartFlow && shopify; // the flow uses Shopify's /cart.js and /checkout
    if (run.input.cartFlow && !shopify) run.warnings.push(`Cart flow skipped: it only works on Shopify stores (this site runs on ${ctx.platform.name}).`);
    const okPages = run.crawl.filter((p) => !p.error && !p.cachedFrom); // cached pages are still blocked live
    const pick = (type: string) => okPages.find((p) => p.type === type);
    const chosen = [pick('home'), pick('product'), pick('collection'), pick('page') || pick('article')].filter(Boolean) as CrawledPage[];
    const productUrl = pick('product')?.url || run.targets.find((t) => t.type === 'product')?.url;
    run.progress.message = 'Running browser tests (accessibility, rendered schema, console errors' + (cartFlow ? ', cart flow)' : ')');
    await persist(true);
    run.browser = await runBrowserTests({
      runId: run.id,
      baseUrl: ctx.baseUrl,
      pages: chosen.map((p) => ({ url: p.url, type: p.type, serverSchemaTypes: p.schemaTypes })),
      cartFlow,
      productUrl,
      isCancelled: stopping,
    }).catch((e) => ({ status: 'failed' as const, message: e?.message || String(e), pages: [] }));
    if (run.browser.status !== 'ok' && run.browser.message) run.warnings.push(`Browser tests ${run.browser.status}: ${run.browser.message}`);
    if (cartFlow && !productUrl) run.warnings.push('Cart flow skipped: no product page was available.');
    await persist();
  };

  // 2d. Owner mode: full catalog via the Shopify Admin API (only if the token belongs to this store)
  const ownerTask = async () => {
    if (!hooks.owner) return;
    if (!shopify) {
      run.owner = { status: 'skipped', message: `Owner mode skipped: ${ctx.host} is not a Shopify store (${ctx.platform.name}).` };
      run.warnings.push(run.owner.message!);
      return;
    }
    run.progress.message = 'Reading the catalog through the Shopify Admin API';
    const res = await runOwnerAudit(hooks.owner);
    const bare = (h: string) => h.replace(/^www\./, '').toLowerCase();
    if (res.status === 'ok' && res.shop) {
      const matches = [bare(res.shop.primaryDomain), bare(res.shop.myshopifyDomain)].some((h) => h === bare(ctx.host) || h === bare(ctx.inputHost));
      if (!matches) {
        run.owner = { status: 'skipped', message: `The Admin API token belongs to ${res.shop.primaryDomain}, not ${ctx.host}; catalog data was not used.` };
        run.warnings.push(run.owner.message!);
        return;
      }
    }
    run.owner = res;
    if (res.status === 'failed') run.warnings.push(`Owner mode failed: ${res.message}`);
    else if (res.truncated) run.warnings.push(`Owner mode scanned the first ${res.counts?.productsScanned} of ${res.counts?.products} products (OWNER_MAX_PRODUCTS).`);
    await persist();
  };

  // 2c. Site-level checks and real-user data
  const siteTask = async () => {
    run.site = await runSiteChecks(ctx.baseUrl, shopify).catch((e) => {
      run.warnings.push(`Site checks failed: ${e?.message}`);
      return undefined;
    });
    run.crux = await fetchCrux(ctx.baseUrl, hooks.apiKey).catch((e) => ({ status: 'unavailable' as const, message: `Chrome UX Report request failed: ${e?.message || e}` } as CruxData));
    await persist();
  };

  // 2f. Ahrefs authority and search visibility (AHREFS_FREE_API_KEY / AHREFS_PAID_API_KEY; not scored)
  const ahrefsTask = async () => {
    if (hooks.isCancelled()) return;
    run.ahrefs = await fetchAhrefs(ctx.host); // undefined when no Ahrefs key is configured
    if (!run.ahrefs) return;
    if (run.ahrefs.status === 'unavailable') run.warnings.push(`Ahrefs: ${run.ahrefs.message}`);
    else if (run.ahrefs.siteExplorer?.message) run.warnings.push(`Ahrefs: ${run.ahrefs.siteExplorer.message}`);
    await persist();
  };

  // One failing part must not discard the others' results: turn errors into warnings.
  const safe = (name: string, task: () => Promise<void>) => () =>
    task().catch((e) => {
      run.warnings.push(`${name} stopped early: ${e?.message || e}. Results gathered before the error are kept.`);
    });

  await Promise.all([safe('PageSpeed testing', psiTask)(), safe('Crawl', crawlTask)().then(safe('Browser tests', browserTask)), safe('Site checks', siteTask)(), safe('Ahrefs', ahrefsTask)(), safe('Owner mode', ownerTask)(), safe('Catalog feed', catalogTask)()]);
  if (hooks.isCancelled()) return;

  // 3. Analyse
  await stage('analyzing', 'Building findings and scores');
  run.apps = aggregateApps(run.psiTests, run.crawl);
  const brokenSitemaps = ctx.discovery.brokenSitemaps;
  run.findings = mergeFindings(
    [
      ...lighthouseFindings(run.psiTests),
      ...crawlFindings(run.crawl, ctx.host, brokenSitemaps, shopify),
      ...(run.site ? siteFindings(run.site, ctx.baseUrl) : []),
      ...cruxFindings(run.crux, ctx.baseUrl),
      ...appFindings(run.apps),
      ...(run.browser ? browserFindings(run.browser) : []),
      ...(run.owner?.status === 'ok' ? ownerFindings(run.owner) : run.catalog?.status === 'ok' ? ownerFindings(run.catalog) : []),
    ],
    { shopify }
  );
  const catalogOk = run.owner?.status === 'ok' || run.catalog?.status === 'ok';

  const psiDone = run.psiTests.filter((t) => t.status === 'done').length;
  const okCrawl = run.crawl.filter((p) => !p.error);
  const okProducts = okCrawl.filter((p) => p.type === 'product').length;
  const okCatalog = okCrawl.filter((p) => p.type === 'product' || p.type === 'collection').length;
  const multiLanguage = (run.site?.hreflang.count ?? 0) > 0;
  const on = ctx.platform.id === 'unknown' ? 'this site (not a Shopify store)' : `${ctx.platform.name} sites`;

  // Only score what was actually checked. "Not applicable" modules are excluded from the grade.
  const notApplicable: Partial<Record<ModuleId, string>> = {};
  if (!shopify) {
    notApplicable.url_architecture = `Shopify URL rules (collection-scoped product URLs, myshopify domain) don't apply to ${on}`;
    notApplicable.conversion = `the cart, review and policy checks rely on Shopify routes and don't apply to ${on}`;
    if (!okProducts) notApplicable.product_quality = 'no product pages were found on this site';
  }
  if (run.site && !multiLanguage) notApplicable.international = 'single-language site (no hreflang tags), so there is nothing to check';

  const measured: Partial<Record<ModuleId, boolean>> = {
    speed: psiDone > 0,
    apps: psiDone > 0,
    accessibility: psiDone > 0 || !!run.browser?.pages.some((p) => p.ok),
    technical_seo: okCrawl.length > 1,
    url_architecture: okCrawl.length > 1,
    structured_data: shopify ? okCatalog > 0 : okCrawl.length > 0,
    product_quality: okProducts > 0 || catalogOk,
    ai_readiness: !!run.site && (!shopify || okCatalog > 0 || catalogOk),
    international: !!run.site && multiLanguage,
    conversion: (!!run.site && okProducts > 0) || !!run.browser?.flow,
    security: !!run.site,
  };
  const psiReason = psiDone ? undefined : 'no PageSpeed test succeeded';
  const notMeasuredReason: Partial<Record<ModuleId, string>> = {
    speed: psiReason,
    apps: psiReason,
    accessibility: psiReason,
    technical_seo: 'fewer than two pages could be crawled',
    url_architecture: 'fewer than two pages could be crawled',
    structured_data: shopify ? 'no product or collection page could be crawled' : 'no page could be crawled',
    product_quality: 'no product page could be crawled and the catalog feed was unavailable',
    ai_readiness: run.site ? 'no product or collection data was available' : 'site checks failed',
    international: 'site checks failed',
    conversion: 'no product page could be crawled',
    security: 'site checks failed',
  };
  run.scores = scoreRun({ findings: run.findings, tests: run.psiTests, measured, notApplicable, notMeasuredReason });

  const psiFailed = run.psiTests.filter((t) => t.status === 'failed');
  if (psiFailed.length) {
    const reasons = Array.from(new Set(psiFailed.map((t) => t.error))).slice(0, 3).join(' | ');
    run.warnings.push(`${psiFailed.length} of ${run.psiTests.length} PageSpeed tests failed: ${reasons}`);
  }
  if (shopify && !okCatalog && ctx.discovery.counts.products + ctx.discovery.counts.collections > 0) {
    run.warnings.push(
      catalogOk
        ? 'No product or collection pages could be crawled, so structured data and conversion are not scored. Product quality comes from the full catalog feed.'
        : 'No product or collection pages could be crawled; structured data, product quality and conversion modules are not scored.'
    );
  }
}

/** Placeholder for a page that stayed rate-limited: listed on the Pages tab, excluded from all checks. */
function blockedPage(t: { url: string; type: string }): CrawledPage {
  return { ...notCrawledPage(t, 'HTTP 429 (rate limited)'), status: 429, rateLimited: true };
}

/** A page that was never fetched: listed with the reason, excluded from all checks. */
function notCrawledPage(t: { url: string; type: string }, reason: string): CrawledPage {
  return {
    url: t.url,
    type: t.type,
    status: 0,
    error: reason,
    rateLimited: false,
    responseMs: 0,
    title: '',
    metaDescription: '',
    metaRobots: '',
    noindex: false,
    h1Count: 0,
    h1: [],
    canonical: '',
    canonicalStatus: 'missing',
    wordCount: 0,
    schemaTypes: [],
    schemaFindings: [],
    invalidJsonLd: 0,
    hasFaq: false,
    definitionWords: 0,
    totalImages: 0,
    imagesMissingAlt: 0,
    dualUrls: [],
    internalLinks: 0,
    scriptCount: 0,
    thirdPartyScripts: [],
    renderBlockingScripts: 0,
    detectedApps: [],
    intentSignals: undefined,
    myshopifyLinks: 0,
  } as unknown as CrawledPage;
}
