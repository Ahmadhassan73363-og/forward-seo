// Browser-safe: only type imports from core (which pulls in cheerio).
import type { PageAuditResult, PSIResult, DeficitDetail } from './core';
import { ratio, avg, round1 } from './scoring';

export interface DiscoverySummary {
  counts: { products: number; collections: number; pages: number; blogs: number; articles: number };
  brokenSitemaps: Array<{ url: string; status: number; sitemap: string }>;
  sitemapFound: boolean;
}

/** Everything the discover step learns, passed back by the client for later steps. */
export interface AuditContext {
  inputHost: string;
  baseUrl: string;
  host: string;
  storeHandle: string;
  homePage: PageAuditResult;
  discovery: DiscoverySummary;
  targets: Array<{ url: string; type: string }>;
  maxPages: number;
  warnings: string[];
  startedAt: number;
}

export interface BuildReportInput {
  ctx: AuditContext;
  pages: PageAuditResult[]; // crawled pages, excluding the homepage
  psiMobileRes: PSIResult;
  psiDesktopRes: PSIResult;
  skippedCount: number;
  skippedReason?: string;
}

export function buildReport(input: BuildReportInput) {
  const { ctx, psiMobileRes, psiDesktopRes, skippedCount } = input;
  const { baseUrl, host, storeHandle, homePage, discovery, maxPages } = ctx;
  const started = ctx.startedAt;
  const skippedForTime = skippedCount;
  const warnings = [...ctx.warnings];
  const totalDiscovered =
    discovery.counts.products + discovery.counts.collections + discovery.counts.pages + discovery.counts.articles + discovery.counts.blogs;

  if (skippedCount > 0) warnings.push(`${skippedCount} selected pages were not crawled (${input.skippedReason || 'time budget reached'}).`);

  const pagesAudited: PageAuditResult[] = [homePage, ...input.pages];
  const okPages = pagesAudited.filter((p) => p.status_code >= 200 && p.status_code < 300 && !p.fetch_error);
  const failedPages = pagesAudited.filter((p) => !okPages.includes(p));
  const blockedPages = failedPages.filter((p) => p.blocked || p.rate_limited);
  const rateLimitedPages = failedPages.filter((p) => p.rate_limited);
  const challengedPages = failedPages.filter((p) => p.blocked);
  if (rateLimitedPages.length > 0) {
    warnings.push(`${rateLimitedPages.length} pages were still rate-limited by Shopify (HTTP 429) after waiting; they are excluded from scoring.`);
  }
  if (challengedPages.length > 0) {
    warnings.push(`${challengedPages.length} pages returned a bot-protection challenge (Cloudflare/WAF); they are excluded from scoring.`);
  }

  // Headless / JS-rendered storefronts serve near-empty HTML from the Shopify domain.
  const wordCounts = okPages.map((p) => p.word_count).sort((a, b) => a - b);
  const medianWords = wordCounts.length ? wordCounts[Math.floor(wordCounts.length / 2)] : 0;
  if (okPages.length >= 3 && medianWords < 30) {
    warnings.push(
      `Crawled pages contain almost no text (median ${medianWords} words). This looks like a headless or JavaScript-rendered storefront${
        /checkout\./.test(host) ? ` (redirected to the checkout domain ${host})` : ''
      }; HTML-only checks are unreliable here. Audit the public storefront domain instead.`
    );
  }

  const psiMobile = psiMobileRes.ok ? psiMobileRes.data : null;
  const psiDesktop = psiDesktopRes.ok ? psiDesktopRes.data : null;
  if (!psiMobileRes.ok) warnings.push(`PageSpeed (mobile) unavailable: ${psiMobileRes.error}`);
  if (!psiDesktopRes.ok) warnings.push(`PageSpeed (desktop) unavailable: ${psiDesktopRes.error}`);

  // 6. Group findings
  const productPages = okPages.filter((p) => p.page_type === 'product');
  const collectionPages = okPages.filter((p) => p.page_type === 'collection');
  const indexablePages = okPages.filter((p) => !p.noindex);

  const productsLackingSchema = productPages.filter((p) => p.schema_findings.some((f) => f.startsWith('Missing')));
  const productsMissingRequired = productPages.filter((p) =>
    p.schema_findings.some((f) => /Missing (Product JSON-LD|Product\.name|Product\.offers|Offer\.price\b|Offer\.priceCurrency)/.test(f))
  );
  const collectionsLackingBreadcrumbs = collectionPages.filter((p) => p.schema_findings.some((f) => f.includes('BreadcrumbList') || f.includes('ItemList')));
  const pagesWithConflictingSchema = okPages.filter((p) => p.schema_findings.some((f) => f.includes('conflicting Product')));
  const pagesWithInvalidJsonLd = okPages.filter((p) => p.invalid_json_ld_blocks > 0);
  const collectionsLackingDefinition = collectionPages.filter((p) => !p.has_definition_paragraph);
  const pagesWithMissingAlt = okPages.filter((p) => p.images_missing_alt > 0);
  const pagesMissingMeta = indexablePages.filter((p) => !p.meta_description);
  const pagesBadH1 = indexablePages.filter((p) => p.h1_count !== 1);
  const pagesBadTitle = indexablePages.filter((p) => !p.title || p.title_length > 65 || p.title_length < 20);
  const pagesCanonicalIssues = okPages.filter((p) => p.canonical_status === 'missing' || p.canonical_status === 'mismatch' || p.canonical_status === 'cross_domain');
  const sitemapNoindex = okPages.filter((p) => p.noindex && p.page_type !== 'home');
  const pagesWithDualUrls = okPages.filter((p) => p.dual_urls_found.length > 0);
  const brokenPages = failedPages.filter((p) => !p.blocked && !p.rate_limited && p.status_code >= 400);
  const errorPages = failedPages.filter((p) => !p.blocked && p.status_code === 0);

  // 7. Deficits
  const deficitDetails: DeficitDetail[] = [];
  const admin = (path: string) => `https://admin.shopify.com/store/${storeHandle}/${path}`;

  if (brokenPages.length > 0 || discovery.brokenSitemaps.length > 0) {
    deficitDetails.push({
      id: 'broken_sitemap_urls',
      title: `${brokenPages.length} sitemap URLs return errors${discovery.brokenSitemaps.length ? ` and ${discovery.brokenSitemaps.length} child sitemaps fail to load` : ''}`,
      dimension: 'Technical Architecture',
      impact: 'Critical',
      location: 'Shopify Admin > Online Store > Navigation > URL Redirects & Google Search Console',
      action_guide: 'Set deleted or unpublished items to Draft so they leave the sitemap, or add 301 redirects to the closest live equivalent.',
      code_snippet: '# Shopify Admin > Navigation > URL Redirects\n/products/old-item  ->  /products/new-item',
      doc_link: 'playbooks/audit/architecture-audit.md',
      admin_link: admin('navigation/redirects'),
      affected_urls: [
        ...brokenPages.map((p) => ({ url: p.url, issue: `Returns HTTP ${p.status_code}`, statusCode: p.status_code })),
        ...discovery.brokenSitemaps.map((b) => ({ url: b.url, issue: b.status ? `Child sitemap returns HTTP ${b.status}` : 'Child sitemap failed to load', statusCode: b.status })),
      ],
    });
  }

  if (errorPages.length > 0) {
    deficitDetails.push({
      id: 'unreachable_pages',
      title: `${errorPages.length} pages timed out or could not be fetched`,
      dimension: 'Technical Architecture',
      impact: 'High',
      location: 'Hosting / CDN',
      action_guide: 'These pages did not respond within the crawl timeout. Check them manually; slow server responses also hurt crawl budget.',
      affected_urls: errorPages.map((p) => ({ url: p.url, issue: p.fetch_error || 'Fetch failed' })),
    });
  }

  if (sitemapNoindex.length > 0) {
    deficitDetails.push({
      id: 'noindex_in_sitemap',
      title: `${sitemapNoindex.length} pages listed in the sitemap are set to noindex`,
      dimension: 'Technical Architecture',
      impact: 'High',
      location: 'Online Store > Themes > Edit code > layout/theme.liquid (meta robots) or SEO app settings',
      action_guide: 'Either remove the noindex tag or remove these URLs from the sitemap. Conflicting signals waste crawl budget.',
      doc_link: 'playbooks/audit/technical-audit.md',
      admin_link: admin('themes'),
      affected_urls: sitemapNoindex.map((p) => ({ url: p.url, issue: `meta robots: ${p.meta_robots}` })),
    });
  }

  if (productsLackingSchema.length > 0) {
    deficitDetails.push({
      id: 'product_schema_offer',
      title: `${productsLackingSchema.length} of ${productPages.length} product pages have incomplete Product/Offer schema`,
      dimension: 'Structured Data',
      impact: productsMissingRequired.length > 0 ? 'Critical' : 'High',
      location: 'Online Store > Themes > Edit code > snippets/seo-product-schema.liquid',
      action_guide:
        'Required for Google product rich results: name, offers.price, offers.priceCurrency. Recommended for merchant listings: availability, shippingDetails, hasMerchantReturnPolicy, brand, image and a GTIN/SKU.',
      code_snippet: `{%- comment -%} Google Compliant Product Schema with Shipping & Return {%- endcomment -%}
<script type="application/ld+json">
{
"@context": "https://schema.org/",
"@type": "Product",
"name": {{ product.title | json }},
"image": [{{ product.featured_image | image_url: width: 1200 | prepend: "https:" | json }}],
"description": {{ product.description | strip_html | truncatewords: 50 | json }},
"brand": { "@type": "Brand", "name": {{ product.vendor | json }} },
"sku": {{ product.selected_or_first_available_variant.sku | json }},
"offers": {
  "@type": "Offer",
  "price": "{{ product.price | money_without_currency | remove: ',' }}",
  "priceCurrency": "{{ cart.currency.iso_code }}",
  "availability": "https://schema.org/{% if product.available %}InStock{% else %}OutOfStock{% endif %}",
  "shippingDetails": {
    "@type": "OfferShippingDetails",
    "shippingRate": { "@type": "MonetaryAmount", "value": "0", "currency": "{{ cart.currency.iso_code }}" }
  },
  "hasMerchantReturnPolicy": {
    "@type": "MerchantReturnPolicy",
    "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
    "merchantReturnDays": 30
  }
}
}
</script>`,
      file_path: 'snippets/seo-product-schema.liquid',
      doc_link: 'playbooks/audit/schema-audit.md',
      admin_link: admin('themes'),
      affected_urls: productsLackingSchema.map((p) => ({
        url: p.url,
        issue: p.schema_findings.filter((f) => f.startsWith('Missing')).join(', '),
      })),
    });
  }

  if (pagesWithInvalidJsonLd.length > 0) {
    deficitDetails.push({
      id: 'invalid_json_ld',
      title: `${pagesWithInvalidJsonLd.length} pages contain JSON-LD that fails to parse`,
      dimension: 'Structured Data',
      impact: 'High',
      location: 'Theme snippets or apps that output <script type="application/ld+json">',
      action_guide: 'Google ignores invalid JSON-LD entirely. Common causes: trailing commas, unescaped quotes (use the | json filter in Liquid), or empty Liquid values.',
      doc_link: 'playbooks/audit/schema-audit.md',
      admin_link: admin('themes'),
      affected_urls: pagesWithInvalidJsonLd.map((p) => ({ url: p.url, issue: `${p.invalid_json_ld_blocks} invalid block(s)` })),
    });
  }

  if (collectionsLackingBreadcrumbs.length > 0) {
    deficitDetails.push({
      id: 'collection_breadcrumbs_schema',
      title: `${collectionsLackingBreadcrumbs.length} of ${collectionPages.length} collection pages lack BreadcrumbList / ItemList markup`,
      dimension: 'Structured Data',
      impact: 'High',
      location: 'Online Store > Themes > Edit code > snippets/seo-collection-schema.liquid',
      action_guide: 'Add BreadcrumbList and CollectionPage/ItemList JSON-LD to collection templates.',
      code_snippet: `{%- if template.name == 'collection' -%}
<script type="application/ld+json">
{
"@context": "https://schema.org",
"@type": "BreadcrumbList",
"itemListElement": [
  { "@type": "ListItem", "position": 1, "name": "Home", "item": "{{ shop.url }}" },
  { "@type": "ListItem", "position": 2, "name": {{ collection.title | json }}, "item": "{{ shop.url }}{{ collection.url }}" }
]
}
</script>
{%- endif -%}`,
      file_path: 'snippets/seo-collection-schema.liquid',
      doc_link: 'playbooks/audit/schema-audit.md',
      admin_link: admin('themes'),
      affected_urls: collectionsLackingBreadcrumbs.map((c) => ({
        url: c.url,
        issue: c.schema_findings.filter((f) => f.includes('BreadcrumbList') || f.includes('ItemList')).join(', '),
      })),
    });
  }

  if (pagesWithConflictingSchema.length > 0) {
    deficitDetails.push({
      id: 'conflicting_review_schemas',
      title: `${pagesWithConflictingSchema.length} pages output more than one Product schema`,
      dimension: 'Structured Data',
      impact: 'High',
      location: 'Theme product template and review apps (Judge.me, Yotpo, Loox) > SEO / Rich Snippets settings',
      action_guide: 'Keep one Product entity per page. Disable duplicate schema output in the review app or merge aggregateRating into the theme schema.',
      doc_link: 'playbooks/audit/schema-audit.md',
      admin_link: admin('apps'),
      affected_urls: pagesWithConflictingSchema.map((p) => ({
        url: p.url,
        issue: p.schema_findings.find((f) => f.includes('conflicting')) || 'Multiple Product entities',
      })),
    });
  }

  if (collectionsLackingDefinition.length > 0) {
    deficitDetails.push({
      id: 'aeo_factual_definitions',
      title: `${collectionsLackingDefinition.length} of ${collectionPages.length} collections have no description of 40+ words`,
      dimension: 'AEO & GEO Readiness',
      impact: 'Medium',
      location: 'Shopify Admin > Products > Collections > [Collection] > Description',
      action_guide: 'Add a 40–60 word factual paragraph near the H1 that defines the category, materials and use case. Detection looks for common theme description containers; verify manually on custom themes.',
      code_snippet: `<div class="category-definition-block" data-aeo="direct-answer">
<p><strong>[Collection Name]</strong> are [materials/features] made for [audience/use case]. Each item offers [key benefit].</p>
</div>`,
      doc_link: 'playbooks/aeo-geo/answer-engine-optimization.md',
      admin_link: admin('collections'),
      affected_urls: collectionsLackingDefinition.map((c) => ({
        url: c.url,
        issue: c.definition_word_count > 0 ? `Description is only ${c.definition_word_count} words` : 'No collection description found',
      })),
    });
  }

  if (pagesCanonicalIssues.length > 0) {
    deficitDetails.push({
      id: 'canonical_issues',
      title: `${pagesCanonicalIssues.length} pages have a missing or non-self canonical`,
      dimension: 'Technical SEO',
      impact: 'High',
      location: 'layout/theme.liquid — <link rel="canonical" href="{{ canonical_url }}">',
      action_guide: 'Each indexable page should declare itself as canonical. Cross-domain canonicals usually mean the primary domain is misconfigured.',
      code_snippet: '<link rel="canonical" href="{{ canonical_url }}">',
      doc_link: 'playbooks/audit/technical-audit.md',
      admin_link: admin('themes'),
      affected_urls: pagesCanonicalIssues.map((p) => ({ url: p.url, issue: `${p.canonical_status}${p.canonical_url ? ` → ${p.canonical_url}` : ''}` })),
    });
  }

  if (pagesMissingMeta.length > 0) {
    deficitDetails.push({
      id: 'missing_meta_descriptions',
      title: `${pagesMissingMeta.length} indexable pages have no meta description`,
      dimension: 'Technical SEO',
      impact: 'Medium',
      location: 'Shopify Admin > [Product/Collection/Page] > Search engine listing',
      action_guide: 'Write a unique 120–155 character description for each page.',
      doc_link: 'playbooks/audit/technical-audit.md',
      admin_link: admin('products'),
      affected_urls: pagesMissingMeta.map((p) => ({ url: p.url, issue: 'No <meta name="description">' })),
    });
  }

  if (pagesBadH1.length > 0) {
    deficitDetails.push({
      id: 'h1_issues',
      title: `${pagesBadH1.length} pages have zero or multiple H1 tags`,
      dimension: 'Technical SEO',
      impact: 'Medium',
      location: 'Theme section templates',
      action_guide: 'Use exactly one H1 per page containing the main topic (product or collection name).',
      affected_urls: pagesBadH1.map((p) => ({ url: p.url, issue: `${p.h1_count} H1 tags` })),
    });
  }

  if (pagesBadTitle.length > 0) {
    deficitDetails.push({
      id: 'title_issues',
      title: `${pagesBadTitle.length} pages have missing, too short or too long titles`,
      dimension: 'Technical SEO',
      impact: 'Low',
      location: 'Shopify Admin > [Item] > Search engine listing > Page title',
      action_guide: 'Keep titles between 20 and 65 characters so they are not truncated in search results.',
      affected_urls: pagesBadTitle.map((p) => ({ url: p.url, issue: p.title ? `${p.title_length} chars: "${p.title}"` : 'Missing <title>' })),
    });
  }

  if (pagesWithDualUrls.length > 0) {
    deficitDetails.push({
      id: 'dual_urls',
      title: `${pagesWithDualUrls.length} pages link to /collections/*/products/* duplicate URLs`,
      dimension: 'Technical Architecture',
      impact: 'Medium',
      location: 'snippets/product-card.liquid (or card-product.liquid)',
      action_guide: "Remove '| within: collection' from product links so all internal links point at the canonical /products/ URL.",
      code_snippet: '<a href="{{ product.url }}">  {%- comment -%} not {{ product.url | within: collection }} {%- endcomment -%}',
      file_path: 'snippets/product-card.liquid',
      admin_link: admin('themes'),
      affected_urls: pagesWithDualUrls.map((p) => ({ url: p.url, issue: `${p.dual_urls_found.length} duplicate-path links, e.g. ${p.dual_urls_found[0]}` })),
    });
  }

  if (psiMobile && psiMobile.performanceScore !== null && (psiMobile.performanceScore < 90 || (psiMobile.lab.lcpMs ?? 0) > 2500 || (psiMobile.lab.tbtMs ?? 0) > 200)) {
    deficitDetails.push({
      id: 'mobile_cwv_deficit',
      title: `Mobile PageSpeed ${psiMobile.performanceScore}/100 — LCP ${psiMobile.lab.lcpDisplay}, TBT ${psiMobile.lab.tbtDisplay}`,
      dimension: 'Core Web Vitals',
      impact: psiMobile.performanceScore < 50 ? 'Critical' : 'High',
      location: 'layout/theme.liquid & hero section',
      action_guide:
        psiMobile.opportunities.length > 0
          ? `Top Lighthouse opportunities: ${psiMobile.opportunities.slice(0, 3).map((o) => o.title).join('; ')}.`
          : 'Preload the LCP image with fetchpriority="high" and defer non-essential third-party scripts.',
      code_snippet: `{%- if template.name == 'index' and section.settings.image -%}
<link rel="preload" as="image" href="{{ section.settings.image | image_url: width: 1000 }}" fetchpriority="high">
{%- endif -%}`,
      doc_link: 'playbooks/audit/page-speed-core-web-vitals.md',
      admin_link: admin('themes'),
      affected_urls: [{ url: psiMobile.tested_url, issue: `Mobile LCP ${psiMobile.lab.lcpDisplay}, TBT ${psiMobile.lab.tbtDisplay}, CLS ${psiMobile.lab.clsDisplay}` }],
    });
  }

  if (pagesWithMissingAlt.length > 0) {
    deficitDetails.push({
      id: 'missing_image_alts',
      title: `${pagesWithMissingAlt.reduce((a, p) => a + p.images_missing_alt, 0)} images have no alt attribute across ${pagesWithMissingAlt.length} pages`,
      dimension: 'Technical SEO & Accessibility',
      impact: 'Medium',
      location: 'Shopify Admin > Products / Files, and theme image snippets',
      action_guide: 'Add descriptive alt text to content images. (Images with alt="" are treated as decorative and not counted.)',
      code_snippet: `{{ image | image_url: width: 800 | image_tag: alt: image.alt, loading: 'lazy' }}`,
      file_path: 'snippets/product-card.liquid',
      doc_link: 'playbooks/audit/technical-audit.md',
      admin_link: admin('products'),
      affected_urls: pagesWithMissingAlt.map((p) => ({ url: p.url, issue: `${p.images_missing_alt} image(s) missing alt` })),
    });
  }

  // 8. Dimension scores — all computed from crawl data; null = not measurable this run
  const dimNotes: Record<string, string[]> = { technical: [], schema_entity: [], aeo_geo: [], architecture: [], core_web_vitals: [], intent_conversion: [] };

  // Technical: status health + per-page on-page checks
  let technical: number | null = null;
  {
    const crawlable = pagesAudited.filter((p) => !p.blocked && !p.rate_limited);
    const statusOk = ratio(okPages.length, crawlable.length);
    const pageChecks = indexablePages.map((p) => {
      const checks = [
        !!p.title && p.title_length >= 20 && p.title_length <= 65,
        !!p.meta_description,
        p.h1_count === 1,
        p.canonical_status === 'match',
        p.total_images === 0 || p.images_missing_alt / p.total_images <= 0.1,
      ];
      return checks.filter(Boolean).length / checks.length;
    });
    const onPage = avg(pageChecks);
    if (statusOk !== null && onPage !== null) technical = round1(100 * (0.35 * statusOk + 0.65 * onPage));
    if (statusOk !== null && statusOk < 1) dimNotes.technical.push(`${crawlable.length - okPages.length} of ${crawlable.length} crawled URLs returned errors.`);
    if (pagesMissingMeta.length) dimNotes.technical.push(`${pagesMissingMeta.length} pages missing meta description.`);
    if (pagesBadH1.length) dimNotes.technical.push(`${pagesBadH1.length} pages with zero or multiple H1s.`);
    if (pagesCanonicalIssues.length) dimNotes.technical.push(`${pagesCanonicalIssues.length} canonical issues.`);
  }

  // Catalog coverage: product/collection pages carry most of the schema, AEO and intent signal.
  // Scoring those dimensions from only the homepage and blog posts gives inflated results.
  const catalogCrawled = productPages.length + collectionPages.length;
  const catalogDiscovered = discovery.counts.products + discovery.counts.collections;
  const catalogMissing = catalogDiscovered > 0 && catalogCrawled === 0;
  if (catalogMissing) {
    dimNotes.schema_entity.push('Not scored: no product or collection pages could be crawled.');
    dimNotes.aeo_geo.push('Not scored: no product or collection pages could be crawled.');
  }

  // Schema: average page schema score over typed pages
  const schemaPages = okPages.filter((p) => ['home', 'product', 'collection', 'article'].includes(p.page_type));
  const schemaAvg = avg(schemaPages.map((p) => p.schema_score));
  const schemaScore = schemaAvg !== null && !catalogMissing ? round1(schemaAvg) : null;
  if (productsLackingSchema.length) dimNotes.schema_entity.push(`${productsLackingSchema.length} of ${productPages.length} product pages have incomplete Product/Offer schema.`);
  if (collectionsLackingBreadcrumbs.length) dimNotes.schema_entity.push(`${collectionsLackingBreadcrumbs.length} collections missing breadcrumb/list schema.`);
  if (pagesWithInvalidJsonLd.length) dimNotes.schema_entity.push(`${pagesWithInvalidJsonLd.length} pages with invalid JSON-LD.`);

  // AEO/GEO
  let aeoScore: number | null = null;
  if (!catalogMissing) {
    const parts: Array<[number, number]> = []; // [value 0..1, weight]
    const defRatio = ratio(collectionPages.length - collectionsLackingDefinition.length, collectionPages.length);
    if (defRatio !== null) parts.push([defRatio, 0.5]);
    const faqBase = okPages.filter((p) => p.page_type === 'product' || p.page_type === 'collection');
    const faqRatio = ratio(faqBase.filter((p) => p.has_faq_content).length, faqBase.length);
    if (faqRatio !== null) parts.push([Math.min(1, faqRatio * 2), 0.25]); // FAQ on half of key pages = full marks
    const hasOrg = homePage.schema_types.includes('Organization') || homePage.schema_types.includes('OnlineStore');
    parts.push([hasOrg ? 1 : 0, 0.25]);
    const w = parts.reduce((s, [, wt]) => s + wt, 0);
    aeoScore = round1((100 * parts.reduce((s, [v, wt]) => s + v * wt, 0)) / w);
    if (collectionsLackingDefinition.length) dimNotes.aeo_geo.push(`${collectionsLackingDefinition.length} collections lack a 40+ word description.`);
    if (!hasOrg) dimNotes.aeo_geo.push('Homepage has no Organization schema.');
    if (faqRatio !== null && faqRatio < 0.5) dimNotes.aeo_geo.push(`Only ${Math.round(faqRatio * 100)}% of product/collection pages have FAQ content.`);
  }

  // Architecture
  let archScore: number | null = null;
  {
    const crawlable = pagesAudited.filter((p) => !p.blocked && !p.rate_limited && p.page_type !== 'home');
    if (crawlable.length > 0 || discovery.sitemapFound) {
      let s = 100;
      if (!discovery.sitemapFound) {
        s -= 25;
        dimNotes.architecture.push('No sitemap.xml found.');
      }
      s -= Math.min(30, discovery.brokenSitemaps.length * 10);
      const brokenRatio = ratio(brokenPages.length, crawlable.length) ?? 0;
      s -= brokenRatio * 50;
      const dualRatio = ratio(pagesWithDualUrls.length, okPages.length) ?? 0;
      s -= dualRatio * 20;
      const breadcrumbGap = ratio(collectionsLackingBreadcrumbs.length, collectionPages.length) ?? 0;
      s -= breadcrumbGap * 15;
      const noindexRatio = ratio(sitemapNoindex.length, okPages.length) ?? 0;
      s -= noindexRatio * 20;
      archScore = round1(Math.max(0, s));
      if (brokenPages.length) dimNotes.architecture.push(`${brokenPages.length} sitemap URLs return 4xx/5xx.`);
      if (discovery.brokenSitemaps.length) dimNotes.architecture.push(`${discovery.brokenSitemaps.length} child sitemaps failed.`);
      if (pagesWithDualUrls.length) dimNotes.architecture.push(`${pagesWithDualUrls.length} pages link to /collections/*/products/* duplicates.`);
      if (sitemapNoindex.length) dimNotes.architecture.push(`${sitemapNoindex.length} noindex pages in sitemap.`);
    }
  }

  // CWV: real PSI only
  const cwvScore = psiMobile?.performanceScore ?? null;
  if (cwvScore === null) dimNotes.core_web_vitals.push('Not scored: Google PageSpeed Insights did not return a result.');
  else if (cwvScore < 90) {
    dimNotes.core_web_vitals.push(`Mobile performance ${cwvScore}/100 (target 90+).`);
    if ((psiMobile!.lab.lcpMs ?? 0) > 2500) dimNotes.core_web_vitals.push(`Mobile LCP ${psiMobile!.lab.lcpDisplay} (target ≤ 2.5 s).`);
    if ((psiMobile!.lab.tbtMs ?? 0) > 200) dimNotes.core_web_vitals.push(`TBT ${psiMobile!.lab.tbtDisplay} (target ≤ 200 ms).`);
  }

  // Intent & conversion: product-page commercial signals
  let intentScore: number | null = null;
  {
    const sigs = productPages.map((p) => p.intent_signals).filter(Boolean) as Record<string, boolean>[];
    if (sigs.length > 0) {
      const keys = Object.keys(sigs[0]);
      const perKey = keys.map((k) => [k, sigs.filter((s) => s[k]).length / sigs.length] as const);
      intentScore = round1(100 * (perKey.reduce((s, [, v]) => s + v, 0) / perKey.length));
      perKey
        .filter(([, v]) => v < 0.8)
        .forEach(([k, v]) => dimNotes.intent_conversion.push(`${k.replace(/_/g, ' ')}: present on ${Math.round(v * 100)}% of product pages.`));
    } else dimNotes.intent_conversion.push('Not scored: no product pages could be audited.');
  }

  const weights = { technical: 0.2, schema_entity: 0.2, aeo_geo: 0.2, architecture: 0.15, core_web_vitals: 0.15, intent_conversion: 0.1 };
  const dimensionScores: Record<keyof typeof weights, number | null> = {
    technical,
    schema_entity: schemaScore,
    aeo_geo: aeoScore,
    architecture: archScore,
    core_web_vitals: cwvScore,
    intent_conversion: intentScore,
  };

  // Re-normalize weights over the dimensions we could actually measure
  const measured = (Object.keys(weights) as Array<keyof typeof weights>).filter((k) => dimensionScores[k] !== null);
  const measuredWeight = measured.reduce((s, k) => s + weights[k], 0);
  const globalScore = measuredWeight > 0 ? Math.round(measured.reduce((s, k) => s + (dimensionScores[k] as number) * weights[k], 0) / measuredWeight) : 0;
  const unmeasured = (Object.keys(weights) as Array<keyof typeof weights>).filter((k) => dimensionScores[k] === null);
  if (unmeasured.length) warnings.push(`Not scored this run: ${unmeasured.join(', ')}. The overall score is weighted across the remaining dimensions.`);

  // Below half the total weight (or with no catalog coverage) a letter grade would mislead.
  const incomplete = measuredWeight < 0.5 || catalogMissing;
  const grade = incomplete
    ? 'Incomplete'
    : globalScore >= 85
    ? 'A'
    : globalScore >= 75
    ? 'B'
    : globalScore >= 60
    ? 'C'
    : globalScore >= 45
    ? 'D'
    : 'F';
  if (incomplete) {
    warnings.unshift(
      catalogMissing
        ? 'INCOMPLETE AUDIT: no product or collection pages could be crawled (Shopify rate limit). The score is not representative — re-run later.'
        : 'INCOMPLETE AUDIT: less than half of the scoring dimensions could be measured. The score is not representative.'
    );
  }

  const dimensionDetails: Record<string, any> = {};
  (Object.keys(weights) as Array<keyof typeof weights>).forEach((k) => {
    const sc = dimensionScores[k];
    dimensionDetails[k] = {
      score: sc,
      weight: weights[k],
      effective_weight: sc === null ? 0 : round1((weights[k] / measuredWeight) * 100) / 100,
      weighted_score: sc === null ? null : round1((sc * weights[k]) / measuredWeight),
      deductions: dimNotes[k],
    };
  });
  dimensionDetails.schema_entity.metrics = {
    product_schema_ratio: productPages.length ? Math.round(((productPages.length - productsLackingSchema.length) / productPages.length) * 100) : null,
    product_required_ok_ratio: productPages.length ? Math.round(((productPages.length - productsMissingRequired.length) / productPages.length) * 100) : null,
    has_breadcrumbs: collectionPages.length ? collectionsLackingBreadcrumbs.length === 0 : null,
  };
  dimensionDetails.core_web_vitals.metrics = {
    mobile_score: psiMobile?.performanceScore ?? null,
    desktop_score: psiDesktop?.performanceScore ?? null,
    mobile_lcp_seconds: psiMobile?.lab.lcpMs != null ? Number((psiMobile.lab.lcpMs / 1000).toFixed(1)) : null,
    mobile_tbt_ms: psiMobile?.lab.tbtMs ?? null,
    mobile_cls: psiMobile?.lab.cls ?? null,
  };

  // Recommendations & roadmap derived from what was actually found
  const impactRank = { Critical: 0, High: 1, Medium: 2, Low: 3 } as const;
  const sorted = [...deficitDetails].sort((a, b) => impactRank[a.impact] - impactRank[b.impact]);
  const liquidRecs = sorted.filter((d) => d.file_path || d.code_snippet).map((d) => `${d.title} — ${d.location}`);
  const roadmap: Record<string, string[]> = {};
  const phase1 = sorted.filter((d) => d.impact === 'Critical').map((d) => d.title);
  const phase2 = sorted.filter((d) => d.impact === 'High').map((d) => d.title);
  const phase3 = sorted.filter((d) => d.impact === 'Medium' || d.impact === 'Low').map((d) => d.title);
  if (phase1.length) roadmap['Phase 1 (Days 1–30): Critical fixes'] = phase1;
  if (phase2.length) roadmap['Phase 2 (Days 31–60): High-impact improvements'] = phase2;
  if (phase3.length) roadmap['Phase 3 (Days 61–90): Optimization & polish'] = phase3;

  const allApps = Array.from(new Set(okPages.flatMap((p) => p.detected_apps)));
  const avgScripts = avg(okPages.map((p) => p.script_count));

  const report = {
    store_url: baseUrl,
    generated_at: new Date().toISOString(),
    global_score: globalScore,
    grade,
    executive_assessment:
      `SOHGI ${globalScore}/100 (${grade}) from ${okPages.length} successfully crawled pages` +
      (failedPages.length ? ` (${failedPages.length} failed)` : '') +
      ` out of ${totalDiscovered + 1} discovered. ` +
      `${deficitDetails.length} issue categories found` +
      (psiMobile?.performanceScore != null ? `; mobile PageSpeed ${psiMobile.performanceScore}/100, LCP ${psiMobile.lab.lcpDisplay}.` : '; PageSpeed data unavailable for this run.'),
    dimension_scores: dimensionScores,
    dimension_details: dimensionDetails,
    pagespeed: {
      mobile: psiMobile,
      desktop: psiDesktop,
      errors: {
        mobile: psiMobileRes.ok ? null : psiMobileRes.error,
        desktop: psiDesktopRes.ok ? null : psiDesktopRes.error,
      },
    },
    crawl: {
      discovered: {
        products: discovery.counts.products,
        collections: discovery.counts.collections,
        pages: discovery.counts.pages,
        blogs: discovery.counts.blogs,
        articles: discovery.counts.articles,
      },
      sitemap_found: discovery.sitemapFound,
      max_pages: maxPages,
      attempted: pagesAudited.length,
      succeeded: okPages.length,
      failed: failedPages.length,
      blocked: blockedPages.length,
      skipped_for_time: skippedForTime,
      duration_ms: Date.now() - started,
    },
    warnings,
    critical_deficits: deficitDetails.map((d) => d.title),
    deficit_details: deficitDetails,
    liquid_recommendations: liquidRecs,
    competitors: [],
    actionable_roadmap: roadmap,
    pages_audited: pagesAudited,
    scripts_summary: {
      average_scripts_per_page: avgScripts !== null ? Math.round(avgScripts) : 0,
      total_render_blocking_scripts: okPages.reduce((s, p) => s + p.render_blocking_scripts, 0),
      all_detected_apps: allApps,
    },
  };

  return report;
}
