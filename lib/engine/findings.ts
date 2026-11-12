import { GENERIC_GUIDES, ruleForAudit, ruleForCheck, toGuide, type FixRule } from './fixes';
import { AI_BOTS } from './site-checks';
import type { AppCost, BrowserPage, BrowserResults, CrawledPage, CruxData, EvidenceItem, Finding, FixGuide, ModuleId, NormalizedAudit, OwnerResults, PageSpeedTest, Severity, SiteChecks } from './types';

const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const maxSev = (a: Severity, b: Severity) => (SEV_ORDER.indexOf(a) <= SEV_ORDER.indexOf(b) ? a : b);
const MAX_EVIDENCE = 40;

/** "https://s.com" and "https://s.com/" are the same page. Non-URLs pass through unchanged. */
function canonUrl(u: string): string {
  try {
    return new URL(u).href;
  } catch {
    return u;
  }
}

const CATEGORY_MODULE: Record<string, ModuleId> = {
  performance: 'speed',
  accessibility: 'accessibility',
  seo: 'technical_seo',
  'best-practices': 'security',
  'agentic-browsing': 'ai_readiness', // Lighthouse 13: how well AI agents can read/operate the page
  other: 'security',
};

/** Lighthouse descriptions are markdown with a trailing [Learn more](url). */
function splitDescription(md: string): { text: string; learnMore?: string } {
  const links = Array.from(md.matchAll(/\[([^\]]+)\]\((https?:[^)]+)\)/g));
  const learnMore = links.find((m) => /learn|more/i.test(m[1]))?.[2] || links[0]?.[2];
  const text = md.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1').replace(/`/g, '').trim();
  return { text, learnMore };
}

function perfSeverity(ms: number, bytes: number): Severity {
  if (ms >= 1500) return 'critical';
  if (ms >= 600) return 'high';
  if (ms >= 150) return 'medium';
  if (bytes >= 500 * 1024) return 'medium';
  return 'low';
}

function weightSeverity(weight: number): Severity {
  if (weight >= 7) return 'high';
  if (weight >= 3) return 'medium';
  return 'low';
}

function dedupeEvidence(items: EvidenceItem[]): EvidenceItem[] {
  const seen = new Set<string>();
  const out: EvidenceItem[] = [];
  for (const e of items) {
    const k = `${e.url || ''}|${e.selector || ''}|${e.label || ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= MAX_EVIDENCE) break;
  }
  return out;
}

// ─── Lighthouse ─────────────────────────────────────────────────────────────

export function lighthouseFindings(tests: PageSpeedTest[]): Finding[] {
  const done = tests.filter((t) => t.status === 'done' && t.result);
  const pagesChecked = new Set(done.map((t) => t.url)).size;
  if (!pagesChecked) return [];

  type Acc = {
    rule?: FixRule;
    audits: Map<string, NormalizedAudit>;
    pages: Set<string>;
    mobileMs: number[];
    anyMs: number[];
    bytes: number[];
    evidence: EvidenceItem[];
    category: string;
    weight: number;
    maxLcp: number;
    maxCls: number;
  };
  const groups = new Map<string, Acc>();

  for (const t of done) {
    for (const a of t.result!.failedAudits) {
      const rule = ruleForAudit(a.id);
      const key = rule ? `rule:${rule.id}` : `lh:${a.id}`;
      const g = groups.get(key) || { rule, audits: new Map(), pages: new Set(), mobileMs: [], anyMs: [], bytes: [], evidence: [], category: a.category, weight: 0, maxLcp: 0, maxCls: 0 };
      g.audits.set(a.id, a);
      g.pages.add(t.url);
      g.weight = Math.max(g.weight, a.weight);
      g.maxLcp = Math.max(g.maxLcp, t.result!.lab.lcpMs ?? 0);
      g.maxCls = Math.max(g.maxCls, t.result!.lab.cls ?? 0);
      if (a.savingsMs) (t.strategy === 'mobile' ? g.mobileMs : g.anyMs).push(a.savingsMs);
      if (a.savingsBytes) g.bytes.push(a.savingsBytes);
      for (const it of a.items) g.evidence.push({ ...it, page: t.url });
      groups.set(key, g);
    }
  }

  const findings: Finding[] = [];
  for (const [key, g] of Array.from(groups.entries())) {
    const first = Array.from(g.audits.values())[0];
    const msList = g.mobileMs.length ? g.mobileMs : g.anyMs;
    const savingsMs = msList.length ? Math.round(msList.reduce((a, b) => a + b, 0) / msList.length) : 0;
    const savingsBytes = g.bytes.length ? Math.round(g.bytes.reduce((a, b) => a + b, 0) / g.bytes.length) : 0;
    const module = g.rule?.module || CATEGORY_MODULE[g.category] || 'security';
    let severity = g.category === 'performance' ? perfSeverity(savingsMs, savingsBytes) : weightSeverity(g.weight);
    // Lighthouse 13 insights often report 0 ms savings; use the page's actual metric instead.
    if (g.rule?.id === 'lcp-image') severity = maxSev(severity, g.maxLcp > 4000 ? 'high' : g.maxLcp > 2500 ? 'medium' : 'low');
    if (g.rule?.id === 'layout-shift') severity = maxSev(severity, g.maxCls > 0.25 ? 'high' : g.maxCls > 0.1 ? 'medium' : 'low');
    const desc = splitDescription(first.description);
    // Description = what Lighthouse measured; the rule summary lives in the fix guide (no duplicate text).
    const description = desc.text && desc.text !== g.rule?.summary ? desc.text : g.rule?.summary || desc.text;
    // Strongest evidence first
    g.evidence.sort((a, b) => (b.wastedMs || 0) - (a.wastedMs || 0) || (b.wastedBytes || 0) - (a.wastedBytes || 0));
    findings.push({
      id: key,
      module,
      checkId: Array.from(g.audits.keys()).join(','),
      title: g.rule?.title || first.title,
      description,
      severity,
      source: 'lighthouse',
      pagesAffected: Array.from(g.pages),
      pagesChecked,
      impact: savingsMs || savingsBytes ? { savingsMs: savingsMs || undefined, savingsBytes: savingsBytes || undefined, note: 'Average estimated savings per affected page (Lighthouse)' } : undefined,
      evidence: dedupeEvidence(g.evidence),
      fix: g.rule ? toGuide(g.rule) : undefined,
      learnMore: desc.learnMore,
    });
  }
  return findings;
}

// ─── Crawl & site checks ────────────────────────────────────────────────────

interface CheckHit {
  checkId: string;
  module: ModuleId;
  severity: Severity;
  title: string;
  description: string;
  pages: Array<{ url: string; issue?: string }>;
  pagesChecked: number;
  source: Finding['source'];
}

function hitToFinding(h: CheckHit): Finding {
  const rule = ruleForCheck(h.checkId);
  return {
    id: rule ? `rule:${rule.id}` : `check:${h.checkId}`,
    module: rule?.module || h.module,
    checkId: h.checkId,
    title: rule?.title || h.title,
    description: h.description || rule?.summary || '',
    severity: h.severity,
    source: h.source,
    pagesAffected: Array.from(new Set(h.pages.map((p) => p.url))),
    pagesChecked: h.pagesChecked,
    evidence: h.pages.slice(0, MAX_EVIDENCE).map((p) => ({ page: p.url, url: p.url, value: p.issue })),
    fix: rule ? toGuide(rule) : undefined,
  };
}

/** `shopify`: run checks that only make sense on a Shopify theme (URL rules, cart form, theme-specific detection). */
export function crawlFindings(pages: CrawledPage[], host: string, brokenSitemaps: Array<{ url: string; status: number }>, shopify = true): Finding[] {
  const hits: CheckHit[] = [];
  const ok = pages.filter((p) => !p.error && p.status >= 200 && p.status < 300);
  const indexable = ok.filter((p) => !p.noindex);
  const products = ok.filter((p) => p.type === 'product');
  const collections = ok.filter((p) => p.type === 'collection');
  const attempted = pages.filter((p) => !p.rateLimited && !p.blocked);
  const add = (h: Omit<CheckHit, 'source'>) => h.pages.length && hits.push({ ...h, source: 'crawl' });

  const broken = attempted.filter((p) => p.status >= 400);
  add({
    checkId: 'broken_urls',
    module: 'url_architecture',
    severity: broken.length / Math.max(1, attempted.length) > 0.1 ? 'critical' : 'high',
    title: 'Sitemap URLs returning errors',
    description: `${broken.length} of ${attempted.length} crawled sitemap URLs return HTTP errors.`,
    pages: broken.map((p) => ({ url: p.url, issue: `HTTP ${p.status}` })),
    pagesChecked: attempted.length,
  });
  if (brokenSitemaps.length) {
    hits.push({
      checkId: 'broken_sitemaps',
      module: 'url_architecture',
      severity: 'high',
      title: 'Child sitemaps failing to load',
      description: `${brokenSitemaps.length} child sitemap files could not be loaded.`,
      pages: brokenSitemaps.map((b) => ({ url: b.url, issue: b.status ? `HTTP ${b.status}` : 'failed' })),
      pagesChecked: brokenSitemaps.length,
      source: 'site',
    });
  }
  add({ checkId: 'unreachable', module: 'technical_seo', severity: 'medium', title: 'Unreachable pages', description: 'Pages that timed out or failed to load during the crawl.', pages: attempted.filter((p) => p.status === 0).map((p) => ({ url: p.url, issue: p.error || 'failed' })), pagesChecked: attempted.length });
  add({ checkId: 'noindex_in_sitemap', module: 'technical_seo', severity: 'high', title: 'noindex pages in sitemap', description: 'These sitemap URLs carry a noindex robots tag.', pages: ok.filter((p) => p.noindex && p.type !== 'home').map((p) => ({ url: p.url, issue: `robots: ${p.metaRobots}` })), pagesChecked: ok.length });
  add({
    checkId: 'canonical_issues',
    module: 'technical_seo',
    severity: 'high',
    title: 'Canonical issues',
    description: 'Missing, non-self or cross-domain canonical tags.',
    pages: ok.filter((p) => ['missing', 'mismatch', 'cross_domain'].includes(p.canonicalStatus)).map((p) => ({ url: p.url, issue: `${p.canonicalStatus}${p.canonical ? ` → ${p.canonical}` : ''}` })),
    pagesChecked: ok.length,
  });
  add({ checkId: 'missing_meta', module: 'technical_seo', severity: 'medium', title: 'Missing meta descriptions', description: 'Indexable pages without a meta description.', pages: indexable.filter((p) => !p.metaDescription).map((p) => ({ url: p.url })), pagesChecked: indexable.length });
  add({ checkId: 'h1_issues', module: 'technical_seo', severity: 'medium', title: 'H1 issues', description: 'Pages without exactly one H1.', pages: indexable.filter((p) => p.h1Count !== 1).map((p) => ({ url: p.url, issue: `${p.h1Count} H1 tags` })), pagesChecked: indexable.length });
  add({
    checkId: 'title_issues',
    module: 'technical_seo',
    severity: 'low',
    title: 'Title length issues',
    description: 'Titles missing, under 20 or over 65 characters.',
    pages: indexable.filter((p) => !p.title || p.title.length > 65 || p.title.length < 20).map((p) => ({ url: p.url, issue: p.title ? `${p.title.length} chars: “${p.title.slice(0, 80)}”` : 'missing' })),
    pagesChecked: indexable.length,
  });
  add({ checkId: 'missing_alt', module: 'technical_seo', severity: 'medium', title: 'Images without alt', description: 'Images with no alt attribute (alt="" is treated as decorative).', pages: ok.filter((p) => p.imagesMissingAlt > 0).map((p) => ({ url: p.url, issue: `${p.imagesMissingAlt} of ${p.totalImages} images` })), pagesChecked: ok.length });
  if (shopify) add({ checkId: 'dual_urls', module: 'url_architecture', severity: 'medium', title: 'Collection-scoped product links', description: 'Pages linking to /collections/*/products/* duplicate URLs.', pages: ok.filter((p) => p.dualUrls.length).map((p) => ({ url: p.url, issue: `${p.dualUrls.length} links, e.g. ${p.dualUrls[0]}` })), pagesChecked: ok.length });
  if (shopify && !host.endsWith('.myshopify.com')) {
    add({
      checkId: 'myshopify_links',
      module: 'url_architecture',
      severity: 'high',
      title: 'myshopify.com domain leaks',
      description: 'Links or canonicals pointing at the internal .myshopify.com domain.',
      pages: ok.filter((p) => (p.myshopifyLinks || 0) > 0 || /\.myshopify\.com/i.test(p.canonical)).map((p) => ({ url: p.url, issue: /\.myshopify\.com/i.test(p.canonical) ? `canonical → ${p.canonical}` : `${p.myshopifyLinks} links` })),
      pagesChecked: ok.length,
    });
  }

  // Structured data
  const required = /Missing (Product JSON-LD|Product\.name|Product\.offers|Offer\.price\b|Offer\.priceCurrency)/;
  const recommended = /Missing (Offer\.shippingDetails|Offer\.hasMerchantReturnPolicy|Offer\.availability|Product\.image|Product\.brand|Product identifier)/;
  add({ checkId: 'product_schema_required', module: 'structured_data', severity: 'critical', title: 'Product schema missing required fields', description: 'Product pages not eligible for product rich results.', pages: products.filter((p) => p.schemaFindings.some((f) => required.test(f))).map((p) => ({ url: p.url, issue: p.schemaFindings.filter((f) => required.test(f)).join(', ') })), pagesChecked: products.length });
  add({ checkId: 'product_schema_recommended', module: 'structured_data', severity: 'medium', title: 'Product schema missing recommended fields', description: 'Missing merchant-listing fields.', pages: products.filter((p) => !p.schemaFindings.some((f) => required.test(f)) && p.schemaFindings.some((f) => recommended.test(f))).map((p) => ({ url: p.url, issue: p.schemaFindings.filter((f) => recommended.test(f)).join(', ') })), pagesChecked: products.length });
  add({ checkId: 'collection_schema', module: 'structured_data', severity: 'medium', title: 'Collection schema missing', description: 'Collections without BreadcrumbList or ItemList/CollectionPage markup.', pages: collections.filter((p) => p.schemaFindings.some((f) => /BreadcrumbList|ItemList/.test(f))).map((p) => ({ url: p.url, issue: p.schemaFindings.filter((f) => /BreadcrumbList|ItemList/.test(f)).join(', ') })), pagesChecked: collections.length });
  add({ checkId: 'conflicting_product_schema', module: 'structured_data', severity: 'high', title: 'Duplicate Product schema', description: 'More than one Product entity on the page.', pages: ok.filter((p) => p.schemaFindings.some((f) => f.includes('conflicting Product'))).map((p) => ({ url: p.url, issue: p.schemaFindings.find((f) => f.includes('conflicting')) })), pagesChecked: ok.length });
  add({ checkId: 'invalid_json_ld', module: 'structured_data', severity: 'high', title: 'Invalid JSON-LD', description: 'JSON-LD blocks that fail to parse.', pages: ok.filter((p) => p.invalidJsonLd > 0).map((p) => ({ url: p.url, issue: `${p.invalidJsonLd} invalid block(s)` })), pagesChecked: ok.length });
  // Values Google rejects, from the full scan (Product required fields are reported above)
  const scanned = ok.filter((p) => p.schema);
  const valueErrors = (p: CrawledPage) =>
    Array.from(new Set(p.schema!.items.flatMap((i) => i.issues.filter((x) => x.level === 'error' && !(i.type === 'Product' && /^Missing required/.test(x.message))).map((x) => `${i.type}${x.path ? '.' + x.path.replace(/\[\d+\]/g, '') : ''}: ${x.message}`))));
  add({ checkId: 'schema_value_errors', module: 'structured_data', severity: 'high', title: 'Structured data errors', description: 'Schema items with values or properties Google rejects (see the Schema tab).', pages: scanned.filter((p) => valueErrors(p).length).map((p) => { const e = valueErrors(p); return { url: p.url, issue: e.slice(0, 3).join('; ') + (e.length > 3 ? ` (+${e.length - 3} more)` : '') }; }), pagesChecked: scanned.length });
  const home = ok.find((p) => p.type === 'home');
  if (home) {
    if (!home.schemaTypes.some((t) => t === 'Organization' || t === 'OnlineStore')) add({ checkId: 'home_org_schema', module: 'structured_data', severity: 'medium', title: 'No Organization schema', description: 'Homepage has no Organization schema.', pages: [{ url: home.url }], pagesChecked: 1 });
    if (!home.schemaTypes.includes('WebSite')) add({ checkId: 'website_schema', module: 'structured_data', severity: 'low', title: 'No WebSite schema', description: 'Homepage has no WebSite schema.', pages: [{ url: home.url }], pagesChecked: 1 });
  }
  const articles = ok.filter((p) => p.type === 'article');
  add({ checkId: 'article_schema', module: 'structured_data', severity: 'low', title: 'Article schema missing', description: 'Blog articles without Article/BlogPosting schema.', pages: articles.filter((p) => !p.schemaTypes.some((t) => /Article|BlogPosting/.test(t))).map((p) => ({ url: p.url })), pagesChecked: articles.length });

  // Product quality
  add({ checkId: 'thin_product_content', module: 'product_quality', severity: 'medium', title: 'Thin product content', description: 'Product pages with under 250 words of main content.', pages: products.filter((p) => p.wordCount < 250).map((p) => ({ url: p.url, issue: `${p.wordCount} words` })), pagesChecked: products.length });
  add({ checkId: 'product_missing_identifiers', module: 'product_quality', severity: 'low', title: 'Missing brand / identifiers', description: 'Product schema without brand or GTIN/SKU/MPN.', pages: products.filter((p) => p.schemaFindings.some((f) => /Product\.brand|Product identifier/.test(f))).map((p) => ({ url: p.url, issue: p.schemaFindings.filter((f) => /brand|identifier/.test(f)).join(', ') })), pagesChecked: products.length });

  // AI readiness
  if (shopify) add({ checkId: 'collection_definitions', module: 'ai_readiness', severity: 'medium', title: 'Collections without intro text', description: 'No collection description of 40+ words found (theme-dependent detection).', pages: collections.filter((p) => p.definitionWords < 40).map((p) => ({ url: p.url, issue: p.definitionWords ? `${p.definitionWords} words` : 'none found' })), pagesChecked: collections.length });
  const faqBase = [...products, ...collections];
  const faqShare = faqBase.length ? faqBase.filter((p) => p.hasFaq).length / faqBase.length : 1;
  if (faqBase.length && faqShare < 0.2) {
    add({ checkId: 'faq_missing', module: 'ai_readiness', severity: 'low', title: 'Little FAQ content', description: `Only ${Math.round(faqShare * 100)}% of product/collection pages have FAQ content.`, pages: faqBase.filter((p) => !p.hasFaq).map((p) => ({ url: p.url })), pagesChecked: faqBase.length });
  }

  // Conversion (detection relies on Shopify's /cart/add form and review-app markup)
  if (!shopify) return hits.map(hitToFinding);
  add({ checkId: 'add_to_cart_missing', module: 'conversion', severity: 'high', title: 'No add-to-cart form found', description: 'No /cart/add form or Add to cart button in the server HTML.', pages: products.filter((p) => p.intentSignals && !p.intentSignals.add_to_cart_form).map((p) => ({ url: p.url })), pagesChecked: products.length });
  if (products.length >= 3 && !products.some((p) => p.intentSignals?.reviews_or_rating)) {
    add({ checkId: 'reviews_missing', module: 'conversion', severity: 'medium', title: 'No reviews detected', description: 'No review app or aggregateRating found on any audited product page.', pages: products.map((p) => ({ url: p.url })), pagesChecked: products.length });
  }

  return hits.map(hitToFinding);
}

export function siteFindings(site: SiteChecks, baseUrl: string): Finding[] {
  const hits: CheckHit[] = [];
  const add = (h: Omit<CheckHit, 'source' | 'pagesChecked'> & { pagesChecked?: number }) => hits.push({ pagesChecked: 1, ...h, source: 'site' });

  if (!site.robots.found) add({ checkId: 'robots_missing', module: 'technical_seo', severity: 'high', title: 'robots.txt missing', description: `robots.txt returned HTTP ${site.robots.status}.`, pages: [{ url: `${baseUrl}/robots.txt` }] });
  else if (!site.robots.hasSitemap) add({ checkId: 'robots_no_sitemap', module: 'technical_seo', severity: 'medium', title: 'robots.txt has no Sitemap line', description: 'robots.txt does not reference the sitemap.', pages: [{ url: `${baseUrl}/robots.txt` }] });

  const blocked = AI_BOTS.filter((b) => site.robots.aiBots[b] === 'blocked');
  if (blocked.length) {
    const searchBots = blocked.filter((b) => ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot'].includes(b));
    add({
      checkId: 'ai_bots_blocked',
      module: 'ai_readiness',
      severity: searchBots.length ? 'medium' : 'info',
      title: 'AI crawlers blocked',
      description: `Blocked in robots.txt: ${blocked.join(', ')}.${searchBots.length ? ' This includes AI search crawlers, so products cannot be cited in those answers.' : ' Only training crawlers are blocked; AI search crawlers are allowed.'}`,
      pages: blocked.map((b) => ({ url: `${baseUrl}/robots.txt`, issue: `${b}: Disallow /` })),
    });
  }
  if (!site.llmsTxt.found) add({ checkId: 'llms_txt_missing', module: 'ai_readiness', severity: 'info', title: 'No llms.txt', description: `/llms.txt returned HTTP ${site.llmsTxt.status}.`, pages: [{ url: `${baseUrl}/llms.txt` }] });

  if (site.searchPage && site.searchPage.status === 200 && !site.searchPage.noindex && !site.searchPage.disallowed) {
    add({ checkId: 'search_indexable', module: 'url_architecture', severity: 'medium', title: 'Search pages indexable', description: '/search is neither disallowed in robots.txt nor noindexed.', pages: [{ url: `${baseUrl}/search?q=test` }] });
  }
  const missingPolicies = Object.entries(site.policies).filter(([, s]) => s === 404);
  if (missingPolicies.length) add({ checkId: 'policy_missing', module: 'conversion', severity: 'medium', title: 'Policy pages missing', description: `${missingPolicies.length} standard Shopify policy pages return 404.`, pages: missingPolicies.map(([p, s]) => ({ url: baseUrl + p, issue: `HTTP ${s}` })), pagesChecked: Object.keys(site.policies).length });

  const missingHeaders = Object.entries(site.headers).filter(([, v]) => !v).map(([k]) => k);
  if (missingHeaders.length) {
    add({ checkId: 'security_headers', module: 'security', severity: missingHeaders.includes('strict-transport-security') ? 'low' : 'info', title: 'Missing security headers', description: `Not sent by the homepage: ${missingHeaders.join(', ')}.`, pages: missingHeaders.map((h) => ({ url: `${baseUrl}/`, issue: h })) });
  }
  if (!site.consentBanner) add({ checkId: 'consent_missing', module: 'security', severity: 'info', title: 'No consent banner detected', description: 'No known consent banner found in the homepage HTML (JavaScript-only banners are not detected).', pages: [{ url: `${baseUrl}/` }] });

  if (site.hreflang.count > 0 && (!site.hreflang.hasXDefault || !site.hreflang.selfReference)) {
    const issues = [!site.hreflang.hasXDefault && 'no x-default', !site.hreflang.selfReference && 'no self-reference'].filter(Boolean).join(', ');
    add({ checkId: 'hreflang_issues', module: 'international', severity: 'medium', title: 'hreflang incomplete', description: `Homepage hreflang set (${site.hreflang.count} alternates) has ${issues}.`, pages: [{ url: `${baseUrl}/`, issue: issues }] });
  }
  return hits.map(hitToFinding);
}

export function cruxFindings(crux: CruxData | undefined, origin: string): Finding[] {
  const p = crux?.phone;
  if (!p) return [];
  const fails: string[] = [];
  if (p.lcpMs !== null && p.lcpMs > 2500) fails.push(`LCP ${(p.lcpMs / 1000).toFixed(1)} s (good ≤ 2.5 s)`);
  if (p.inpMs !== null && p.inpMs > 200) fails.push(`INP ${p.inpMs} ms (good ≤ 200 ms)`);
  if (p.cls !== null && p.cls > 0.1) fails.push(`CLS ${p.cls} (good ≤ 0.1)`);
  if (!fails.length) return [];
  return [
    {
      id: 'crux:cwv',
      module: 'speed',
      checkId: 'crux_cwv_failing',
      title: 'Real users fail Core Web Vitals on mobile',
      description: `Chrome real-user data (p75, last 28 days) for the whole store fails: ${fails.join('; ')}. This is the data Google uses for ranking.`,
      severity: fails.length >= 2 ? 'critical' : 'high',
      source: 'crux',
      pagesAffected: [origin],
      pagesChecked: 1,
      evidence: fails.map((f) => ({ page: origin, label: f })),
      fix: {
        id: 'crux-cwv',
        summary: 'Fix the lab issues behind each failing metric; field data updates over the following 28 days.',
        steps: ['LCP → see “Largest Contentful Paint element loads late”, image and render-blocking issues.', 'INP → see “Heavy main-thread work” and the Apps tab.', 'CLS → see “Layout shifts”.', 'Re-run monthly and watch the trend chart.'],
      },
    },
  ];
}

export function appFindings(apps: AppCost[]): Finding[] {
  const heavy = apps.filter((a) => a.detectedBy.includes('lighthouse') && a.category !== 'Platform' && (a.avgBlockingMs >= 100 || a.avgMainThreadMs >= 300));
  if (!heavy.length) return [];
  // Lighthouse 13's third-party insight reports main-thread time but not blocking time; use whichever exists.
  const cost = (a: AppCost) => Math.max(a.avgBlockingMs, a.avgMainThreadMs / 2);
  const worst = Math.max(...heavy.map(cost));
  return [
    {
      id: 'apps:heavy',
      module: 'apps',
      checkId: 'heavy_apps',
      title: `${heavy.length} third-party apps/scripts are expensive`,
      description: 'These third parties use significant main-thread time on the tested pages (mobile). Each one delays interactivity.',
      severity: worst >= 500 ? 'high' : worst >= 200 ? 'medium' : 'low',
      source: 'apps',
      pagesAffected: Array.from(new Set(heavy.flatMap((a) => a.pageUrls || []))),
      pagesChecked: heavy[0].pagesTested,
      evidence: heavy.map((a) => ({ label: `${a.name} (${a.category})`, value: `${a.avgMainThreadMs} ms main thread, ${a.avgBlockingMs} ms blocking, ${a.avgTransferKb} KB — on ${a.pages}/${a.pagesTested} pages`, wastedMs: Math.round(cost(a)) })),
      fix: {
        id: 'apps-heavy',
        summary: 'Remove, defer or replace the heaviest apps.',
        steps: [
          'Uninstall apps you do not actively use and delete their leftover theme code.',
          'Move pixels (Meta, TikTok, Pinterest, GA4) to Settings > Customer events or a server-side integration.',
          'Load chat, popups and widgets after user interaction or on the templates that need them.',
          'Compare alternatives: a lighter review or upsell app can save hundreds of milliseconds.',
        ],
        adminPath: 'apps',
      },
    },
  ];
}

// ─── Browser worker ─────────────────────────────────────────────────────────

const AXE_SEVERITY: Record<string, Severity> = { critical: 'high', serious: 'medium', moderate: 'low', minor: 'low' };

export function browserFindings(b: BrowserResults): Finding[] {
  const out: Finding[] = [];
  const okPages = b.pages.filter((p) => p.ok);
  const pagesChecked = new Set(okPages.map((p) => p.url)).size;
  if (!pagesChecked && !b.flow) return out;

  // axe violations, keyed like Lighthouse accessibility audits so the same rule merges into one finding
  const axe = new Map<string, Finding>();
  for (const p of okPages) {
    for (const v of p.axe) {
      const rule = ruleForAudit(v.id);
      const key = rule ? `rule:${rule.id}` : `lh:${v.id}`;
      const sev = AXE_SEVERITY[v.impact || 'minor'] || 'low';
      const f = axe.get(key) || {
        id: key,
        module: rule?.module || 'accessibility',
        checkId: `axe:${v.id}`,
        title: rule?.title || v.help,
        // Without a fix rule, axe's help text is already the title; say what was measured instead.
        description: rule ? `${v.help} (axe rule “${v.id}”, WCAG 2.2 AA, real mobile browser).` : `Automated WCAG 2.2 AA check (axe rule “${v.id}”) in a real mobile browser.`,
        severity: sev,
        source: 'browser' as const,
        pagesAffected: [],
        pagesChecked,
        evidence: [],
        fix: rule ? toGuide(rule) : undefined,
        learnMore: v.helpUrl,
      };
      f.severity = maxSev(f.severity, sev);
      if (!f.pagesAffected.includes(p.url)) f.pagesAffected.push(p.url);
      for (const n of v.nodes) f.evidence.push({ page: p.url, selector: n.target, snippet: n.html, label: p.context === 'menu open' ? 'With mobile menu open' : undefined });
      axe.set(key, f);
    }
  }
  axe.forEach((f) => out.push({ ...f, evidence: dedupeEvidence(f.evidence) }));

  // HTTP 429 resource errors come from Shopify rate-limiting this audit server, not from the store.
  const ownErrors = (p: BrowserPage) => p.consoleErrors.filter((e) => !/status of 429\b/.test(e));
  const withErrors = okPages.filter((p) => ownErrors(p).length).map((p) => ({ ...p, consoleErrors: ownErrors(p) }));
  if (withErrors.length) {
    const rule = ruleForAudit('errors-in-console');
    out.push({
      id: rule ? `rule:${rule.id}` : 'browser:console',
      module: 'security',
      checkId: 'browser_console_errors',
      title: rule?.title || 'JavaScript errors in the browser console',
      description: 'Errors logged while the page loaded in a real mobile browser.',
      severity: withErrors.some((p) => p.consoleErrors.some((e) => e.startsWith('Uncaught'))) ? 'medium' : 'low',
      source: 'browser',
      pagesAffected: Array.from(new Set(withErrors.map((p) => p.url))),
      pagesChecked,
      evidence: dedupeEvidence(withErrors.flatMap((p) => p.consoleErrors.map((e) => ({ page: p.url, label: e })))),
      fix: rule ? toGuide(rule) : undefined,
    });
  }

  const jsSchema = okPages.filter((p) => p.jsInjectedSchema.length);
  if (jsSchema.length) {
    const rule = ruleForCheck('js_schema');
    out.push({
      id: rule ? `rule:${rule.id}` : 'browser:js-schema',
      module: 'structured_data',
      checkId: 'js_schema',
      title: rule?.title || 'Structured data added by JavaScript',
      description: `Schema types that exist only after JavaScript runs: ${Array.from(new Set(jsSchema.flatMap((p) => p.jsInjectedSchema))).join(', ')}.`,
      severity: 'low',
      source: 'browser',
      pagesAffected: jsSchema.map((p) => p.url),
      pagesChecked,
      evidence: jsSchema.map((p) => ({ page: p.url, label: `Rendered only: ${p.jsInjectedSchema.join(', ')}`, value: `server HTML: ${p.serverSchemaTypes.join(', ') || 'none'}` })),
      fix: rule ? toGuide(rule) : undefined,
    });
  }

  if (b.flow) {
    const fl = b.flow;
    const failed = !fl.addedToCart || !fl.reachedCheckout;
    if (failed) {
      const checkId = !fl.addedToCart ? 'cart_add_failed' : 'checkout_unreachable';
      const rule = ruleForCheck(checkId);
      out.push({
        id: rule ? `rule:${rule.id}` : `browser:${checkId}`,
        module: 'conversion',
        checkId,
        title: rule?.title || (fl.addedToCart ? 'Checkout could not be reached' : 'Add to cart failed'),
        description: `Automated mobile test: ${fl.steps.map((s) => `${s.ok ? '✓' : '✗'} ${s.name}`).join(' → ')}. ${fl.steps.find((s) => !s.ok)?.detail || fl.error || ''}`,
        severity: fl.addedToCart ? 'critical' : 'high',
        source: 'browser',
        pagesAffected: [fl.productUrl],
        pagesChecked: 1,
        evidence: fl.steps.map((s) => ({ page: fl.productUrl, label: `${s.ok ? '✓' : '✗'} ${s.name}`, value: `${s.ms} ms${s.detail ? ` — ${s.detail}` : ''}` })),
        fix: rule ? toGuide(rule) : undefined,
      });
    }
  }
  return out;
}

// ─── Owner mode ─────────────────────────────────────────────────────────────

const OWNER_CHECKS: Record<string, { module: ModuleId; severity: Severity; title: string; basis: 'products' | 'collections' | 'theme' }> = {
  owner_missing_meta: { module: 'technical_seo', severity: 'medium', title: 'Products without an SEO description', basis: 'products' },
  owner_title_long: { module: 'technical_seo', severity: 'low', title: 'Product SEO titles over 70 characters', basis: 'products' },
  owner_thin_description: { module: 'product_quality', severity: 'medium', title: 'Products with thin descriptions (< 50 words)', basis: 'products' },
  owner_duplicate_description: { module: 'product_quality', severity: 'medium', title: 'Products sharing the same description', basis: 'products' },
  owner_no_images: { module: 'product_quality', severity: 'high', title: 'Active products without images', basis: 'products' },
  owner_media_alt: { module: 'technical_seo', severity: 'medium', title: 'Product images without alt text', basis: 'products' },
  owner_missing_barcode: { module: 'product_quality', severity: 'low', title: 'Products without barcodes (GTIN)', basis: 'products' },
  owner_oos_indexed: { module: 'product_quality', severity: 'low', title: 'Out-of-stock products still published', basis: 'products' },
  owner_empty_collections: { module: 'url_architecture', severity: 'medium', title: 'Empty collections', basis: 'collections' },
  owner_collection_no_description: { module: 'ai_readiness', severity: 'medium', title: 'Collections without a description (full catalog)', basis: 'collections' },
};

export function ownerFindings(o: OwnerResults): Finding[] {
  const out: Finding[] = [];
  const productsChecked = o.counts?.activeProducts || 0;
  const collectionsChecked = o.counts?.collectionsScanned || 0;
  for (const [checkId, items] of Object.entries(o.issues || {})) {
    if (!items.length) continue;
    const meta = OWNER_CHECKS[checkId];
    if (!meta) continue;
    const rule = ruleForCheck(checkId);
    const checked = meta.basis === 'collections' ? collectionsChecked : productsChecked;
    const total = o.totals?.[checkId] ?? items.length;
    const via = o.via === 'feed' ? 'every published item, read from the public product feed' : 'full catalog via the Shopify Admin API';
    out.push({
      id: rule ? `rule:${rule.id}` : `owner:${checkId}`,
      module: rule?.module || meta.module,
      checkId,
      title: rule?.title || meta.title,
      description: `${total.toLocaleString('en-US')} of ${checked.toLocaleString('en-US')} ${meta.basis} (${via}).${total > items.length ? ` The first ${items.length} are listed.` : ''}`,
      severity: meta.severity,
      source: o.via === 'feed' ? 'catalog' : 'owner',
      pagesAffected: items.map((i) => i.url),
      affectedTotal: total,
      pagesChecked: checked,
      evidence: items.slice(0, MAX_EVIDENCE).map((i) => ({ page: i.url, url: i.url, label: i.title, value: i.issue })),
      fix: rule ? toGuide(rule) : undefined,
    });
  }
  if (o.themeScripts?.length) {
    const rule = ruleForCheck('theme_hardcoded_scripts');
    out.push({
      id: rule ? `rule:${rule.id}` : 'owner:theme-scripts',
      module: 'apps',
      checkId: 'theme_hardcoded_scripts',
      title: rule?.title || 'Third-party scripts hard-coded in theme.liquid',
      description: `${o.themeScripts.length} external script domain(s) are hard-coded in layout/theme.liquid of “${o.themeName || 'the live theme'}”. They load on every page and survive app uninstalls.`,
      severity: o.themeScripts.length >= 5 ? 'medium' : 'low',
      source: 'owner',
      pagesAffected: [],
      pagesChecked: 1,
      evidence: o.themeScripts.map((t) => ({ label: t.app ? `${t.domain} (${t.app})` : t.domain, value: t.file })),
      fix: rule ? toGuide(rule) : undefined,
    });
  }
  return out;
}

// Fix steps that only apply to a Shopify theme/admin. Removed for other platforms.
const SHOPIFY_ONLY = /shopify|liquid|theme\.liquid|theme editor|app embeds?|online store|settings\s*>|snippets\/|sections\/|templates\/|layout\/|template\.name|\{%|\{\{|metafield|myshopify|customer events|admin\b|app store|uninstall apps?/i;

/** Platform-neutral version of a fix guide: Shopify-specific steps, snippets and admin links removed. */
export function genericGuide(fix: FixGuide | undefined, learnMore?: string): FixGuide | undefined {
  if (!fix) return undefined;
  const override = GENERIC_GUIDES[fix.id];
  const steps = override ? override.steps.slice() : fix.steps.filter((s) => !SHOPIFY_ONLY.test(s));
  if (!steps.length) steps.push(learnMore ? 'Follow the linked Google guidance for this audit; the platform-specific steps depend on how your site is built.' : 'Apply the change in your site’s templates or CMS; the exact steps depend on how your site is built.');
  // A Shopify-worded summary is dropped rather than edited into a broken sentence.
  const summary = override?.summary ?? (SHOPIFY_ONLY.test(fix.summary) ? fix.summary.replace(/\s*[—-]\s*usually from apps.*$/i, '') : fix.summary);
  return { id: fix.id, summary: SHOPIFY_ONLY.test(summary) ? '' : summary, steps, docs: fix.docs };
}

/** Removes evidence fields that only repeat another field (e.g. a label identical to the selector). */
function cleanEvidence(e: EvidenceItem): EvidenceItem {
  const out = { ...e };
  if (out.label && (out.label === out.selector || out.label === out.url || out.label === out.snippet || out.label === out.page)) delete out.label;
  if (out.value && (out.value === out.label || out.value === out.url)) delete out.value;
  return out;
}

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

/**
 * Merges findings that resolved to the same fix rule from different sources (e.g. LH image-alt +
 * crawl missing_alt), removes repeated text, and adapts fix guides to the site's platform.
 */
export function mergeFindings(input: Finding[], opts: { shopify?: boolean } = {}): Finding[] {
  const shopify = opts.shopify !== false;
  // Sources spell the same page differently ("https://s.com" vs "https://s.com/"); canonicalize first.
  const list = input.map((f) => ({
    ...f,
    pagesAffected: Array.from(new Set(f.pagesAffected.map(canonUrl))),
    evidence: f.evidence.map((e) => cleanEvidence(e.page ? { ...e, page: canonUrl(e.page) } : e)),
  }));
  const map = new Map<string, Finding>();
  for (const f of list) {
    const cur = map.get(f.id);
    if (!cur) {
      map.set(f.id, { ...f, sources: [f.source], pagesAffected: [...f.pagesAffected], evidence: [...f.evidence] });
      continue;
    }
    cur.severity = maxSev(cur.severity, f.severity);
    cur.pagesAffected = Array.from(new Set([...cur.pagesAffected, ...f.pagesAffected]));
    // Different sources may test different page sets; never report more affected pages than checked.
    cur.pagesChecked = Math.max(cur.pagesChecked, f.pagesChecked, cur.pagesAffected.length);
    if (f.affectedTotal != null) cur.affectedTotal = Math.max(cur.affectedTotal ?? 0, f.affectedTotal);
    cur.evidence = dedupeEvidence([...cur.evidence, ...f.evidence]);
    cur.checkId = Array.from(new Set(`${cur.checkId},${f.checkId}`.split(','))).join(',');
    if (!cur.impact && f.impact) cur.impact = f.impact;
    if (!cur.sources!.includes(f.source)) cur.sources!.push(f.source);
    // Keep one description; append only sentences that add new information.
    const have = new Set(sentences(cur.description).map((s) => s.toLowerCase()));
    const extra = sentences(f.description).filter((s) => !have.has(s.toLowerCase()) && !cur.description.toLowerCase().includes(s.toLowerCase()));
    if (extra.length && f.source !== cur.source && cur.description.length < 300) cur.description = `${cur.description} ${extra.join(' ')}`.trim();
  }
  for (const f of Array.from(map.values())) {
    if (!shopify) f.fix = genericGuide(f.fix, f.learnMore);
    // Description and fix summary must not say the same thing twice.
    if (f.fix && f.fix.summary.trim().toLowerCase() === f.description.trim().toLowerCase()) f.fix = { ...f.fix, summary: '' };
  }
  return Array.from(map.values()).sort(
    (a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || (b.impact?.savingsMs || 0) - (a.impact?.savingsMs || 0) || b.pagesAffected.length - a.pagesAffected.length
  );
}
