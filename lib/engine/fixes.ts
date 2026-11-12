import type { FixGuide, ModuleId } from './types';

/*
 * Shopify fix library. Each rule matches Lighthouse audit IDs (classic + Lighthouse 12/13 insight
 * IDs) and/or the engine's own crawl/site check IDs. Findings that match the same rule are merged,
 * so e.g. `render-blocking-resources` and `render-blocking-insight` become one issue.
 */
export interface FixRule extends FixGuide {
  title: string;
  module: ModuleId;
  audits?: string[];
  auditPattern?: RegExp;
  checks?: string[];
}

export const FIX_RULES: FixRule[] = [
  // ── Speed ────────────────────────────────────────────────────────────────
  {
    id: 'render-blocking',
    title: 'Render-blocking scripts and stylesheets delay first paint',
    module: 'speed',
    audits: ['render-blocking-resources', 'render-blocking-insight'],
    summary: 'Scripts and CSS in <head> block the page from painting until they download.',
    steps: [
      'Open the evidence list: each URL is a file that blocks rendering. Identify which app or theme file loads it.',
      'Add `defer` to theme <script> tags in layout/theme.liquid; app scripts should load via App embeds (Theme editor > App embeds), not hard-coded tags.',
      'Remove script tags left behind by uninstalled apps (search theme.liquid and snippets/ for the domain).',
      'Load non-critical CSS asynchronously (media="print" onload swap) and keep only critical CSS inline.',
    ],
    where: 'layout/theme.liquid',
    snippet: `{{ 'theme.js' | asset_url | script_tag }}  {%- comment -%} blocks {%- endcomment -%}
<script src="{{ 'theme.js' | asset_url }}" defer></script>

{%- comment -%} non-critical CSS {%- endcomment -%}
<link rel="stylesheet" href="{{ 'component-x.css' | asset_url }}" media="print" onload="this.media='all'">`,
    adminPath: 'themes',
  },
  {
    id: 'unused-javascript',
    title: 'Unused, legacy or duplicated JavaScript',
    module: 'speed',
    audits: ['unused-javascript', 'legacy-javascript', 'legacy-javascript-insight', 'duplicated-javascript', 'duplicated-javascript-insight', 'unminified-javascript'],
    summary: 'Browsers download and parse JavaScript the page never uses — usually from apps that load on every template.',
    steps: [
      'Check the evidence for the biggest files and map each domain to an app (see the Apps tab).',
      'Uninstall apps you no longer use, then remove their leftover snippets/script tags from the theme.',
      'Load app scripts only on the templates that need them (e.g. reviews only on product pages) using `{% if template.name == "product" %}`.',
      'Ask app vendors for a lighter / deferred integration; avoid two apps doing the same job (two review or two pixel apps).',
    ],
    where: 'layout/theme.liquid, snippets/',
    snippet: `{%- if template.name == 'product' -%}
  <script src="https://cdn.example-reviews.com/widget.js" defer></script>
{%- endif -%}`,
    adminPath: 'apps',
  },
  {
    id: 'unused-css',
    title: 'Unused or unminified CSS',
    module: 'speed',
    audits: ['unused-css-rules', 'unminified-css'],
    summary: 'Large stylesheets that the page mostly does not use slow down rendering.',
    steps: [
      'Split large theme CSS into per-section files (Online Store 2.0 themes load section CSS only where used).',
      'Remove CSS for features/apps no longer in use.',
      'Avoid loading full icon/font libraries for a handful of icons.',
    ],
    where: 'assets/*.css, sections/*.liquid',
    adminPath: 'themes',
  },
  {
    id: 'images',
    title: 'Images are too large, not responsive or not in modern formats',
    module: 'speed',
    audits: ['modern-image-formats', 'uses-optimized-images', 'uses-responsive-images', 'efficient-animated-content', 'image-delivery-insight', 'offscreen-images', 'image-size-responsive'],
    summary: "Images are served bigger than displayed or below the fold without lazy loading. Shopify's CDN can resize and convert automatically.",
    steps: [
      'Use the `image_url` filter with an explicit width and `image_tag` with `widths` and `sizes` so the browser picks the right size (Shopify serves WebP/AVIF automatically).',
      'Add `loading: "lazy"` to images below the fold (never to the hero/LCP image).',
      'Replace GIF animations with video (`video_tag`).',
      'Upload source images at sensible sizes (≈2× display size, not 6000px).',
    ],
    where: 'snippets/card-product.liquid, sections/*.liquid',
    snippet: `{{ product.featured_image
  | image_url: width: 1200
  | image_tag:
    widths: '360, 540, 720, 900, 1200',
    sizes: '(min-width: 990px) 25vw, 50vw',
    loading: 'lazy',
    alt: product.featured_image.alt | default: product.title }}`,
    adminPath: 'themes',
  },
  {
    id: 'lcp-image',
    title: 'Largest Contentful Paint element loads late',
    module: 'speed',
    audits: ['prioritize-lcp-image', 'lcp-lazy-loaded', 'lcp-discovery-insight', 'lcp-phases-insight', 'lcp-breakdown-insight'],
    summary: 'The biggest above-the-fold element (usually the hero or main product image) is lazy-loaded, discovered late, or not prioritized.',
    steps: [
      'Find the LCP element in the evidence (selector/snippet) — typically the hero banner or first product image.',
      'Remove `loading="lazy"` from it and add `fetchpriority="high"`.',
      'Preload it in <head> on the template where it appears.',
      'Avoid sliders/carousels that inject the first image with JavaScript.',
    ],
    where: 'sections/image-banner.liquid, sections/main-product.liquid',
    snippet: `{%- if section.index == 1 -%}
  {{ section.settings.image | image_url: width: 1500 | image_tag: loading: 'eager', fetchpriority: 'high', widths: '750, 1100, 1500', sizes: '100vw' }}
{%- else -%}
  {{ section.settings.image | image_url: width: 1500 | image_tag: loading: 'lazy' }}
{%- endif -%}`,
    adminPath: 'themes',
  },
  {
    id: 'layout-shift',
    title: 'Layout shifts (CLS) from unsized media and late-loading widgets',
    module: 'speed',
    audits: ['unsized-images', 'layout-shift-elements', 'layout-shifts', 'cls-culprits-insight', 'non-composited-animations'],
    summary: 'Content jumps while loading — images without dimensions, app widgets (reviews, banners, chat) injected above existing content, or web fonts swapping.',
    steps: [
      'Give every image width/height (image_tag adds them) or a CSS aspect-ratio container.',
      'Reserve space for app widgets (min-height on the container) — review stars, announcement bars, upsell blocks.',
      'Avoid inserting announcement/cookie bars above content after load; overlay them instead.',
    ],
    where: 'sections/*.liquid, assets/base.css',
    snippet: `.product-reviews-placeholder { min-height: 24px; }
.media { aspect-ratio: var(--ratio, 1 / 1); }`,
    adminPath: 'themes',
  },
  {
    id: 'fonts',
    title: 'Web fonts block text rendering',
    module: 'speed',
    audits: ['font-display', 'font-display-insight', 'uses-rel-preconnect'],
    summary: 'Text is invisible while custom fonts load, or font hosts are connected to late.',
    steps: [
      "Use `font_display: 'swap'` when loading Shopify fonts.",
      'Preload the 1–2 font files used above the fold; limit families and weights.',
      'Preconnect to third-party font hosts if you must use them.',
    ],
    where: 'layout/theme.liquid',
    snippet: `{{ settings.type_body_font | font_face: font_display: 'swap' }}
<link rel="preload" as="font" href="{{ settings.type_body_font | font_url }}" type="font/woff2" crossorigin>`,
    adminPath: 'themes',
  },
  {
    id: 'server-response',
    title: 'Slow server response, redirects or missing compression',
    module: 'speed',
    audits: ['server-response-time', 'document-latency-insight', 'redirects', 'uses-text-compression'],
    summary: 'The HTML document itself is slow: heavy Liquid (large loops, many sections), redirect hops, or app proxies.',
    steps: [
      'Avoid redirect hops: link to the final URL (https, www/non-www, no trailing redirects).',
      'Reduce Liquid work: limit `for` loops over all products/collections, paginate, avoid nested loops in menus.',
      'Profile the theme with Shopify Theme Inspector for Chrome to find slow sections.',
      'Check apps that inject server-side content via app proxies.',
    ],
    where: 'sections/, snippets/',
    docs: 'https://shopify.dev/docs/storefronts/themes/best-practices/performance',
    adminPath: 'themes',
  },
  {
    id: 'main-thread',
    title: 'Heavy main-thread work hurts interactivity (TBT / INP)',
    module: 'speed',
    audits: ['bootup-time', 'mainthread-work-breakdown', 'long-tasks', 'forced-reflow-insight', 'inp-breakdown-insight', 'interaction-to-next-paint-insight', 'work-during-interaction'],
    summary: 'Too much JavaScript runs on load, so taps and clicks respond slowly.',
    steps: [
      'Use the Apps tab to see which third parties use the most main-thread time.',
      'Defer non-essential tags (chat, popups, heatmaps) until user interaction or idle time.',
      'Move marketing pixels into Shopify Customer Events (web pixels run sandboxed off the main page).',
    ],
    where: 'layout/theme.liquid, Settings > Customer events',
    adminPath: 'settings/customer_events',
  },
  {
    id: 'dom-size',
    title: 'Excessive DOM size',
    module: 'speed',
    audits: ['dom-size', 'dom-size-insight'],
    summary: 'Very large pages (mega menus with every link, hidden mobile + desktop duplicates) slow rendering and interaction.',
    steps: [
      'Render mega-menu content on demand instead of duplicating it for mobile and desktop.',
      'Limit products per collection page and use pagination/load-more.',
      'Remove hidden sections that are rendered but never shown.',
    ],
    where: 'sections/header.liquid, sections/main-collection-product-grid.liquid',
    adminPath: 'themes',
  },
  {
    id: 'caching',
    title: 'Assets with short cache lifetimes',
    module: 'speed',
    audits: ['uses-long-cache-ttl', 'cache-insight'],
    summary: "Repeat visitors re-download files. Shopify's CDN caches theme assets well — the culprits are usually third-party scripts.",
    steps: ['Check the evidence domains; for third-party scripts ask the vendor or self-host static assets in the theme `assets/` folder.'],
    adminPath: 'themes',
  },
  {
    id: 'third-party-facades',
    title: 'Heavy embeds that could load on demand',
    module: 'speed',
    audits: ['third-party-facades'],
    summary: 'Chat widgets and video embeds load their full code before anyone uses them.',
    steps: ['Replace YouTube/Vimeo iframes with a thumbnail that loads the player on click.', 'Load chat widgets after interaction or a delay.'],
    adminPath: 'themes',
  },
  {
    id: 'network-chains',
    title: 'Long chains of dependent network requests',
    module: 'speed',
    audits: ['critical-request-chains', 'network-dependency-tree-insight', 'uses-rel-preload'],
    summary: 'Critical files are discovered one after another instead of in parallel.',
    steps: ['Preconnect to required origins, preload critical fonts/hero images, avoid CSS @import chains.'],
    where: 'layout/theme.liquid',
    adminPath: 'themes',
  },
  {
    id: 'byte-weight',
    title: 'Very heavy pages',
    module: 'speed',
    audits: ['total-byte-weight'],
    summary: 'Total download size is large — mostly images, video and third-party scripts.',
    steps: ['Fix the image and JavaScript issues above; avoid autoplay background video on mobile.'],
    adminPath: 'themes',
  },
  // ── Technical SEO ────────────────────────────────────────────────────────
  {
    id: 'viewport',
    title: 'Missing or invalid mobile viewport',
    module: 'technical_seo',
    audits: ['viewport', 'viewport-insight'],
    summary: 'Pages without a proper viewport tag are not mobile friendly.',
    steps: ['Ensure layout/theme.liquid contains the viewport meta tag.'],
    where: 'layout/theme.liquid',
    snippet: '<meta name="viewport" content="width=device-width,initial-scale=1">',
    adminPath: 'themes',
  },
  {
    id: 'meta-description',
    title: 'Missing meta descriptions',
    module: 'technical_seo',
    audits: ['meta-description'],
    checks: ['missing_meta', 'owner_missing_meta'],
    summary: 'Pages without a meta description get an auto-generated snippet in search results.',
    steps: ['Write a unique 120–155 character description in each item’s “Search engine listing” section.', 'Make sure the theme outputs it: `{% if page_description %}<meta name="description" content="{{ page_description | escape }}">{% endif %}`.'],
    where: 'Admin > Products / Collections / Pages > Search engine listing',
    adminPath: 'products',
  },
  {
    id: 'document-title',
    title: 'Missing, too short or too long page titles',
    module: 'technical_seo',
    audits: ['document-title'],
    checks: ['title_issues', 'owner_title_long'],
    summary: 'Titles are the strongest on-page ranking and click-through signal.',
    steps: ['Keep titles 20–65 characters with the main keyword first.', 'Edit in “Search engine listing”; check the theme’s <title> logic does not append duplicate store names.'],
    where: 'Admin > Search engine listing, layout/theme.liquid',
    adminPath: 'products',
  },
  {
    id: 'h1',
    title: 'Pages with zero or multiple H1 headings',
    module: 'technical_seo',
    checks: ['h1_issues'],
    summary: 'Each page should have exactly one H1 naming its topic.',
    steps: ['Make the product/collection title the only H1; change logo, section headings and duplicate mobile/desktop headings to H2/div.'],
    where: 'sections/header.liquid, sections/main-*.liquid',
    adminPath: 'themes',
  },
  {
    id: 'canonical',
    title: 'Missing or non-self canonical tags',
    module: 'technical_seo',
    audits: ['canonical'],
    checks: ['canonical_issues'],
    summary: 'Canonicals tell Google which URL to index. Missing or wrong canonicals split ranking signals.',
    steps: ['Ensure layout/theme.liquid outputs `<link rel="canonical" href="{{ canonical_url }}">`.', 'Cross-domain canonicals usually mean the primary domain is misconfigured (Settings > Domains).'],
    where: 'layout/theme.liquid',
    snippet: '<link rel="canonical" href="{{ canonical_url }}">',
    adminPath: 'settings/domains',
  },
  {
    id: 'indexability',
    title: 'Pages blocked from indexing',
    module: 'technical_seo',
    audits: ['is-crawlable'],
    checks: ['noindex_in_sitemap'],
    summary: 'Pages listed in the sitemap carry noindex (or are blocked), sending Google conflicting signals.',
    steps: ['Remove the noindex if the page should rank, or hide it from the sitemap (SEO app setting / `seo.hidden` metafield = 1).', 'Check SEO apps and theme conditions that add `<meta name="robots" content="noindex">`.'],
    where: 'layout/theme.liquid, SEO app settings',
    adminPath: 'themes',
  },
  {
    id: 'broken-urls',
    title: 'Sitemap URLs returning errors',
    module: 'url_architecture',
    audits: ['http-status-code'],
    checks: ['broken_urls', 'broken_sitemaps'],
    summary: 'Deleted or unpublished items still in the sitemap waste crawl budget and show errors in Search Console.',
    steps: ['Set removed products to Draft/Archived so they leave the sitemap, or create 301 redirects to the closest live item.'],
    where: 'Admin > Online Store > Navigation > URL Redirects',
    snippet: '/products/old-item  →  /products/new-item',
    adminPath: 'navigation/redirects',
  },
  {
    id: 'unreachable',
    title: 'Pages that timed out or could not be fetched',
    module: 'technical_seo',
    checks: ['unreachable'],
    summary: 'These URLs did not respond in time during the crawl.',
    steps: ['Open them manually; slow or failing pages also hurt crawling by Google.'],
  },
  {
    id: 'robots-txt',
    title: 'robots.txt problems',
    module: 'technical_seo',
    audits: ['robots-txt'],
    checks: ['robots_missing', 'robots_no_sitemap'],
    summary: 'robots.txt is missing, invalid or does not reference the sitemap.',
    steps: ['Shopify generates robots.txt; customize only via templates/robots.txt.liquid and keep `{{ group.sitemap }}` output.'],
    where: 'templates/robots.txt.liquid',
    adminPath: 'themes',
  },
  {
    id: 'link-text',
    title: 'Links without descriptive text or not crawlable',
    module: 'technical_seo',
    audits: ['link-text', 'crawlable-anchors'],
    summary: 'Links like “click here” or JavaScript-only links give search engines no context.',
    steps: ['Use descriptive anchor text; use real <a href> links for navigation instead of JS click handlers.'],
    adminPath: 'themes',
  },
  {
    id: 'image-alt',
    title: 'Images without alt text',
    module: 'technical_seo',
    audits: ['image-alt'],
    checks: ['missing_alt', 'owner_media_alt'],
    summary: 'Alt text is needed for accessibility and image search.',
    steps: ['Add alt text in Admin (product media > Add alt text) and output it in the theme: `image_tag: alt: image.alt`.', 'Decorative images should use alt="".'],
    where: 'Admin > Products > Media, snippets/',
    adminPath: 'products',
  },
  // ── URL architecture ─────────────────────────────────────────────────────
  {
    id: 'dual-urls',
    title: 'Internal links to collection-scoped product URLs',
    module: 'url_architecture',
    checks: ['dual_urls'],
    summary: 'Links like /collections/x/products/y create duplicate URLs for every product; Google must crawl many copies.',
    steps: ["Remove `| within: collection` from product links in product cards so every link points to /products/handle."],
    where: 'snippets/card-product.liquid (or product-card.liquid)',
    snippet: `<a href="{{ product.url }}">  {%- comment -%} not {{ product.url | within: collection }} {%- endcomment -%}`,
    adminPath: 'themes',
  },
  {
    id: 'myshopify-leak',
    title: 'Links or canonicals pointing to the .myshopify.com domain',
    module: 'url_architecture',
    checks: ['myshopify_links'],
    summary: 'The internal myshopify domain should never appear in links or canonicals once a custom domain is primary.',
    steps: ['Set the custom domain as primary and redirect all traffic to it (Settings > Domains).', 'Replace hard-coded myshopify URLs in theme settings, menus and rich-text content.'],
    adminPath: 'settings/domains',
  },
  {
    id: 'search-indexable',
    title: 'Internal search result pages may be indexed',
    module: 'url_architecture',
    checks: ['search_indexable'],
    summary: '/search pages create an endless number of thin URLs.',
    steps: ['Keep Shopify’s default `Disallow: /search` in robots.txt and add noindex to the search template.'],
    where: 'templates/robots.txt.liquid, layout/theme.liquid',
    snippet: `{%- if template.name == 'search' -%}<meta name="robots" content="noindex">{%- endif -%}`,
    adminPath: 'themes',
  },
  // ── Structured data ──────────────────────────────────────────────────────
  {
    id: 'product-schema',
    title: 'Product pages missing required Product/Offer schema',
    module: 'structured_data',
    checks: ['product_schema_required'],
    summary: 'Without name, offers.price and offers.priceCurrency, products are not eligible for product rich results.',
    steps: ['Add a Product JSON-LD snippet (below) to the product template, or enable it in your theme/SEO app — but only one source.'],
    where: 'snippets/seo-product-schema.liquid → sections/main-product.liquid',
    snippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": {{ product.title | json }},
  "image": [{{ product.featured_image | image_url: width: 1200 | prepend: 'https:' | json }}],
  "description": {{ product.description | strip_html | truncatewords: 50 | json }},
  "brand": { "@type": "Brand", "name": {{ product.vendor | json }} },
  "sku": {{ product.selected_or_first_available_variant.sku | json }},
  "offers": {
    "@type": "Offer",
    "url": "{{ shop.url }}{{ product.url }}",
    "price": {{ product.selected_or_first_available_variant.price | divided_by: 100.0 | json }},
    "priceCurrency": {{ cart.currency.iso_code | json }},
    "availability": "https://schema.org/{% if product.available %}InStock{% else %}OutOfStock{% endif %}"
  }
}
</script>`,
    docs: 'https://developers.google.com/search/docs/appearance/structured-data/product',
    adminPath: 'themes',
  },
  {
    id: 'product-schema-recommended',
    title: 'Product schema missing merchant-listing fields',
    module: 'structured_data',
    checks: ['product_schema_recommended'],
    summary: 'shippingDetails, hasMerchantReturnPolicy, brand, image and GTIN/SKU make products eligible for richer merchant listings.',
    steps: ['Extend the Offer with shippingDetails and hasMerchantReturnPolicy (or define the return policy once on Organization).', 'Add brand and a GTIN/SKU from variant data.'],
    snippet: `"shippingDetails": { "@type": "OfferShippingDetails", "shippingRate": { "@type": "MonetaryAmount", "value": "0", "currency": {{ cart.currency.iso_code | json }} } },
"hasMerchantReturnPolicy": { "@type": "MerchantReturnPolicy", "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow", "merchantReturnDays": 30 }`,
    docs: 'https://developers.google.com/search/docs/appearance/structured-data/merchant-listing',
    adminPath: 'themes',
  },
  {
    id: 'collection-schema',
    title: 'Collections missing BreadcrumbList / ItemList schema',
    module: 'structured_data',
    checks: ['collection_schema'],
    summary: 'Breadcrumb markup replaces the URL in search results with a readable path.',
    steps: ['Add BreadcrumbList (and optionally CollectionPage/ItemList) JSON-LD to the collection template.'],
    where: 'sections/main-collection-banner.liquid',
    snippet: `<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
  { "@type": "ListItem", "position": 1, "name": "Home", "item": "{{ shop.url }}" },
  { "@type": "ListItem", "position": 2, "name": {{ collection.title | json }}, "item": "{{ shop.url }}{{ collection.url }}" }
] }
</script>`,
    adminPath: 'themes',
  },
  {
    id: 'org-schema',
    title: 'Homepage missing Organization / WebSite schema',
    module: 'structured_data',
    checks: ['home_org_schema', 'website_schema'],
    summary: 'Organization schema (logo, sameAs social profiles) builds the brand entity used by Google and AI assistants.',
    steps: ['Add Organization and WebSite JSON-LD on the homepage with logo, url and sameAs links.'],
    where: 'layout/theme.liquid (index template only)',
    snippet: `{%- if template.name == 'index' -%}
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Organization", "name": {{ shop.name | json }}, "url": "{{ shop.url }}",
  "logo": {{ settings.logo | image_url: width: 600 | prepend: 'https:' | json }},
  "sameAs": ["https://www.instagram.com/yourbrand", "https://www.facebook.com/yourbrand"] }
</script>
{%- endif -%}`,
    adminPath: 'themes',
  },
  {
    id: 'article-schema',
    title: 'Blog articles missing Article schema',
    module: 'structured_data',
    checks: ['article_schema'],
    summary: 'Article/BlogPosting markup helps articles show author, date and image in results.',
    steps: ['Add BlogPosting JSON-LD to the article template using article.title, article.published_at, article.author and article.image.'],
    where: 'sections/main-article.liquid',
    adminPath: 'themes',
  },
  {
    id: 'invalid-jsonld',
    title: 'Invalid JSON-LD blocks',
    module: 'structured_data',
    checks: ['invalid_json_ld'],
    summary: 'Google ignores structured data that is not valid JSON.',
    steps: ['Use the `| json` filter for every Liquid value inside JSON-LD; remove trailing commas.', 'Validate with Google’s Rich Results Test.'],
    docs: 'https://search.google.com/test/rich-results',
    adminPath: 'themes',
  },
  {
    id: 'schema-value-errors',
    title: 'Structured data values Google rejects',
    module: 'structured_data',
    checks: ['schema_value_errors'],
    summary: 'Markup that parses but breaks Google’s rules (wrong formats, missing required properties) is ignored for rich results.',
    steps: [
      'Open the Schema tab: every error lists the item, the property path and what is wrong.',
      'Typical fixes: prices as plain numbers (29.99, no symbol), 3-letter currency codes, schema.org availability URLs, ISO 8601 dates, full https:// URLs, and no rating with 0 reviews.',
      'Re-test the page with the “Test a URL” box on the Schema tab or Google’s Rich Results Test.',
    ],
    docs: 'https://search.google.com/test/rich-results',
    adminPath: 'themes',
  },
  {
    id: 'duplicate-schema',
    title: 'Multiple Product schemas on one page',
    module: 'structured_data',
    checks: ['conflicting_product_schema'],
    summary: 'Theme and apps (reviews, SEO apps) each output Product markup with different data.',
    steps: ['Keep one source. Disable rich-snippet output in the review/SEO app or remove the theme block, and merge aggregateRating into the remaining one.'],
    adminPath: 'apps',
  },
  // ── Product quality ──────────────────────────────────────────────────────
  {
    id: 'thin-product',
    title: 'Thin product content',
    module: 'product_quality',
    checks: ['thin_product_content', 'owner_thin_description'],
    summary: 'Product pages with little unique text rank poorly and give AI assistants nothing to cite.',
    steps: ['Write unique descriptions (materials, sizing, use cases, care) of 150+ words; add FAQs for common questions.'],
    where: 'Admin > Products > Description',
    adminPath: 'products',
  },
  {
    id: 'product-identifiers',
    title: 'Products missing brand or GTIN/SKU in schema',
    module: 'product_quality',
    checks: ['product_missing_identifiers', 'owner_missing_barcode'],
    summary: 'Identifiers connect products to Google Shopping and comparison results.',
    steps: ['Fill Vendor, SKU and Barcode (GTIN) on variants and output them in Product schema.'],
    adminPath: 'products',
  },
  // ── AI readiness ─────────────────────────────────────────────────────────
  {
    id: 'ai-bots',
    title: 'AI crawlers are blocked in robots.txt',
    module: 'ai_readiness',
    checks: ['ai_bots_blocked'],
    summary: 'Blocking AI search crawlers (OAI-SearchBot, PerplexityBot, ChatGPT-User) keeps products out of AI answers. Blocking training bots (GPTBot, CCBot, Google-Extended) is a business choice.',
    steps: ['Decide per bot. To allow AI search, remove their Disallow rules in templates/robots.txt.liquid.'],
    where: 'templates/robots.txt.liquid',
    adminPath: 'themes',
  },
  {
    id: 'llms-txt',
    title: 'No llms.txt file',
    module: 'ai_readiness',
    checks: ['llms_txt_missing'],
    summary: 'llms.txt is an emerging convention that gives AI assistants a curated map of key pages. Optional, low effort.',
    steps: ['Create a page with a plain-text summary and key links, and serve it at /llms.txt via a URL redirect or an app.'],
  },
  {
    id: 'definitions',
    title: 'Collections without a descriptive introduction',
    module: 'ai_readiness',
    checks: ['collection_definitions', 'owner_collection_no_description'],
    summary: 'A 40–60 word factual paragraph near the H1 is what answer engines quote.',
    steps: ['Add a short factual description to each collection (what it is, materials, who it is for).'],
    where: 'Admin > Products > Collections > Description',
    adminPath: 'collections',
  },
  {
    id: 'faq',
    title: 'Little or no FAQ content',
    module: 'ai_readiness',
    checks: ['faq_missing'],
    summary: 'Question-and-answer content matches how people ask AI assistants and search.',
    steps: ['Add FAQ blocks (collapsible content section) to key product and collection templates; mark up with FAQPage only where Google still supports it.'],
    adminPath: 'themes',
  },
  // ── International ────────────────────────────────────────────────────────
  {
    id: 'hreflang',
    title: 'hreflang set incompletely',
    module: 'international',
    audits: ['hreflang'],
    checks: ['hreflang_issues'],
    summary: 'Alternate language/market URLs need a self reference and an x-default.',
    steps: ['Use Shopify Markets with subfolders/domains — Shopify outputs hreflang automatically; remove custom hreflang code or translation-app duplicates.'],
    adminPath: 'settings/markets',
  },
  // ── Conversion & trust ───────────────────────────────────────────────────
  {
    id: 'policies',
    title: 'Store policy pages missing',
    module: 'conversion',
    checks: ['policy_missing'],
    summary: 'Refund, shipping, privacy and terms pages build trust and are required by Google Merchant Center.',
    steps: ['Create them in Settings > Policies and link them in the footer menu.'],
    adminPath: 'settings/legal',
  },
  {
    id: 'add-to-cart',
    title: 'Product pages without a detectable add-to-cart form',
    module: 'conversion',
    checks: ['add_to_cart_missing'],
    summary: 'No /cart/add form or Add to cart button was found in the HTML — buying may depend on JavaScript or be broken.',
    steps: ['Check these pages manually on mobile; make sure the product form renders server-side (Shopify `{% form "product" %}`).'],
    where: 'sections/main-product.liquid',
    adminPath: 'themes',
  },
  {
    id: 'reviews',
    title: 'No reviews or ratings on product pages',
    module: 'conversion',
    checks: ['reviews_missing'],
    summary: 'Reviews are a top conversion factor and enable star ratings in search results.',
    steps: ['Install a reviews app (or Shopify Product Reviews alternative) and output aggregateRating in Product schema.'],
    adminPath: 'apps',
  },
  {
    id: 'cart-flow',
    title: 'Add to cart does not work in a real mobile browser',
    module: 'conversion',
    checks: ['cart_add_failed'],
    summary: 'An automated mobile browser could not add the product to the cart.',
    steps: [
      'Open the product on a phone and try it yourself; check the failing step screenshot in the Browser tab.',
      'Common causes: variant picker JavaScript errors, an app overlay covering the button, sold-out default variant, or a broken cart drawer app.',
      'Check the browser console errors listed for the product page.',
    ],
    where: 'sections/main-product.liquid, cart drawer app',
    adminPath: 'themes',
  },
  {
    id: 'checkout-flow',
    title: 'Checkout could not be reached from the cart',
    module: 'conversion',
    checks: ['checkout_unreachable'],
    summary: 'The product was added, but the cart did not lead to Shopify checkout. This blocks every sale.',
    steps: ['Open the cart on mobile and press Checkout; check for upsell/cart apps intercepting the button or a JavaScript error.', 'Review checkout settings and any checkout extensibility apps.'],
    adminPath: 'settings/checkout',
  },
  {
    id: 'js-schema',
    title: 'Structured data added by JavaScript',
    module: 'structured_data',
    checks: ['js_schema'],
    summary: 'Some schema exists only after JavaScript runs (usually review or SEO apps). Google renders it later; many other crawlers and AI bots never see it.',
    steps: ['Prefer apps/themes that output JSON-LD in Liquid (server-side).', 'Make sure the server-rendered Product schema is complete on its own.'],
    adminPath: 'apps',
  },
  {
    id: 'duplicate-descriptions',
    title: 'Products sharing the same description',
    module: 'product_quality',
    checks: ['owner_duplicate_description'],
    summary: 'Copy-pasted descriptions make products compete with each other and look like thin content.',
    steps: ['Write a unique first paragraph per product (what makes this one different: color, material, fit, use).', 'Variants of one product belong in one product with options, not separate products.'],
    adminPath: 'products',
  },
  {
    id: 'product-images',
    title: 'Active products without images',
    module: 'product_quality',
    checks: ['owner_no_images'],
    summary: 'Products without images convert poorly and are not eligible for image search or Shopping.',
    steps: ['Add at least 3 images per product, including one on a plain background for Google Shopping.'],
    adminPath: 'products',
  },
  {
    id: 'oos-products',
    title: 'Out-of-stock products still published',
    module: 'product_quality',
    checks: ['owner_oos_indexed'],
    summary: 'Sold-out products can stay published if they come back; permanently discontinued ones should redirect.',
    steps: ['Temporary: keep the page, show a back-in-stock form, keep availability OutOfStock in schema.', 'Discontinued: archive the product and create a 301 redirect to the closest alternative or its collection.'],
    adminPath: 'products',
  },
  {
    id: 'empty-collections',
    title: 'Empty collections',
    module: 'url_architecture',
    checks: ['owner_empty_collections'],
    summary: 'Collections with no products are thin pages that waste crawl budget and frustrate visitors.',
    steps: ['Fill them, hide them from navigation and the sitemap, or delete them and redirect to a related collection.'],
    adminPath: 'collections',
  },
  {
    id: 'theme-scripts',
    title: 'Third-party scripts hard-coded in theme.liquid',
    module: 'apps',
    checks: ['theme_hardcoded_scripts'],
    summary: 'Scripts pasted into theme.liquid load on every page and are not removed when an app is uninstalled.',
    steps: ['For each domain listed, confirm the app is still used.', 'Remove unused ones; move the rest to the app’s App embed (Theme editor > App embeds) or Customer events.'],
    where: 'layout/theme.liquid',
    adminPath: 'themes',
  },
  // ── Security ─────────────────────────────────────────────────────────────
  {
    id: 'https',
    title: 'HTTPS or mixed-content problems',
    module: 'security',
    audits: ['is-on-https', 'redirects-http'],
    summary: 'All resources must load over HTTPS.',
    steps: ['Replace http:// asset URLs in theme settings and content; ensure the domain SSL is active (Settings > Domains).'],
    adminPath: 'settings/domains',
  },
  {
    id: 'console-errors',
    title: 'JavaScript errors in the browser console',
    module: 'security',
    audits: ['errors-in-console', 'inspector-issues'],
    summary: 'Script errors often break features silently (variant pickers, add to cart, tracking).',
    steps: ['Open the page with DevTools; errors usually come from an app or a theme customization — disable apps one by one to isolate.'],
    adminPath: 'themes',
  },
  {
    id: 'security-headers',
    title: 'Missing security headers',
    module: 'security',
    checks: ['security_headers'],
    summary: 'Shopify controls most response headers; some can be added via an app or edge proxy.',
    steps: ['Most are platform-managed. If you run a proxy (Cloudflare), add HSTS, X-Content-Type-Options and Referrer-Policy there.'],
  },
  {
    id: 'consent',
    title: 'No cookie consent banner detected',
    module: 'security',
    checks: ['consent_missing'],
    summary: 'Stores selling to the EU/UK need consent before non-essential tracking. Detection is HTML-based and can miss JS-only banners.',
    steps: ['Enable Shopify’s Customer Privacy banner (Settings > Customer privacy) or a consent app.'],
    adminPath: 'settings/customer_privacy',
  },
  // ── Accessibility ────────────────────────────────────────────────────────
  {
    id: 'contrast',
    title: 'Low color contrast',
    module: 'accessibility',
    audits: ['color-contrast'],
    summary: 'Text that does not meet WCAG contrast ratios is hard to read (and an EAA compliance risk).',
    steps: ['Adjust theme color settings (Theme editor > Theme settings > Colors) for the elements listed.'],
    adminPath: 'themes',
  },
  {
    id: 'names-labels',
    title: 'Buttons, links or form fields without accessible names',
    module: 'accessibility',
    audits: ['button-name', 'link-name', 'input-button-name', 'select-name', 'label', 'form-field-multiple-labels', 'input-image-alt', 'frame-title'],
    summary: 'Screen readers announce these controls as “button” or “link” with no purpose.',
    steps: ['Add visible text or aria-label to icon buttons (cart, search, menu, slider arrows); add <label> to form fields (newsletter, quantity).'],
    snippet: `<button type="button" aria-label="{{ 'general.search.search' | t }}">{% render 'icon-search' %}</button>`,
    adminPath: 'themes',
  },
  {
    id: 'tap-targets',
    title: 'Touch targets too small or too close',
    module: 'accessibility',
    audits: ['target-size', 'tap-targets'],
    summary: 'Small controls are hard to tap on mobile.',
    steps: ['Give interactive elements at least 24×24 px (ideally 44×44) and spacing.'],
    adminPath: 'themes',
  },
  {
    id: 'heading-order',
    title: 'Headings skip levels',
    module: 'accessibility',
    audits: ['heading-order'],
    summary: 'Heading levels should be sequential (H1 → H2 → H3).',
    steps: ['Adjust section heading tags in the theme; use CSS for size instead of heading level.'],
    adminPath: 'themes',
  },
  {
    id: 'lang',
    title: 'Missing or invalid page language',
    module: 'accessibility',
    audits: ['html-has-lang', 'html-lang-valid', 'valid-lang'],
    summary: 'The <html> tag should declare the language.',
    steps: ['Use `<html lang="{{ request.locale.iso_code }}">` in layout/theme.liquid.'],
    adminPath: 'themes',
  },
  {
    id: 'aria',
    title: 'ARIA attributes used incorrectly',
    module: 'accessibility',
    auditPattern: /^aria-/,
    summary: 'Invalid ARIA confuses assistive technology more than no ARIA.',
    steps: ['Fix or remove the ARIA attributes on the elements listed; often from sliders, drawers and app widgets.'],
    adminPath: 'themes',
  },
];

const byAudit = new Map<string, FixRule>();
const byCheck = new Map<string, FixRule>();
for (const r of FIX_RULES) {
  r.audits?.forEach((a) => byAudit.set(a, r));
  r.checks?.forEach((c) => byCheck.set(c, r));
}

export function ruleForAudit(id: string): FixRule | undefined {
  return byAudit.get(id) || FIX_RULES.find((r) => r.auditPattern?.test(id));
}

export function ruleForCheck(id: string): FixRule | undefined {
  return byCheck.get(id);
}

export function toGuide(r: FixRule): FixGuide {
  const { title, module, audits, auditPattern, checks, ...guide } = r;
  return guide;
}

/**
 * Platform-neutral wording for rules whose Shopify steps don't apply elsewhere. Used for
 * non-Shopify sites instead of filtering the Shopify steps down to nothing.
 */
export const GENERIC_GUIDES: Record<string, { summary?: string; steps: string[] }> = {
  'server-response': {
    summary: 'The HTML document itself is slow to arrive: slow server rendering, redirect hops or missing caching.',
    steps: [
      'Avoid redirect hops: link to the final URL (https, www/non-www, trailing slash).',
      'Cache rendered HTML at the edge/CDN where content allows it, and check slow database queries or plugins.',
      'Measure TTFB from several regions; a CDN in front of the origin usually helps most.',
    ],
  },
  viewport: { steps: ['Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head> of every page template.', 'Do not disable zoom (avoid maximum-scale=1 / user-scalable=no).'] },
  canonical: {
    steps: [
      'Give every indexable page a <link rel="canonical"> pointing at its own preferred URL.',
      'Point duplicates (tracking parameters, filters, alternate paths) at the preferred URL.',
      'Never canonicalize to a URL that redirects, returns 404 or is noindexed.',
    ],
  },
  'robots-txt': {
    steps: ['Serve a valid /robots.txt with HTTP 200.', 'Add a “Sitemap: https://your-domain/sitemap.xml” line.', 'Check that important sections are not disallowed by mistake.'],
  },
  'ai-bots': {
    steps: [
      'Decide which AI crawlers to allow: search/answer bots (OAI-SearchBot, PerplexityBot, ChatGPT-User) bring visibility; training bots (GPTBot, CCBot, Google-Extended) are a business choice.',
      'Edit robots.txt to allow the bots you want; check CDN/WAF bot rules too, which can block them independently.',
    ],
  },
  hreflang: {
    steps: [
      'On each language/market version, list every alternate with <link rel="alternate" hreflang="…">, including the page itself.',
      'Add an x-default alternate for the fallback version.',
      'Use absolute URLs that return 200 and reference each other both ways.',
    ],
  },
  https: { steps: ['Load every image, script, stylesheet and iframe over https://.', 'Redirect all http:// URLs to https:// and enable HSTS once everything works over HTTPS.'] },
  'security-headers': {
    summary: 'Security headers protect visitors against clickjacking, MIME sniffing and downgrade attacks.',
    steps: [
      'Add Strict-Transport-Security, X-Content-Type-Options: nosniff, Referrer-Policy and a frame-ancestors / X-Frame-Options policy.',
      'Set them in the web server, hosting platform or CDN (e.g. Cloudflare Transform Rules).',
    ],
  },
  consent: {
    steps: [
      'If you serve visitors in the EU/UK, show a consent banner before loading non-essential cookies and tags.',
      'Use a consent management platform that supports Google Consent Mode v2.',
      'Detection is HTML-based: banners injected only by JavaScript may not be detected.',
    ],
  },
  contrast: { steps: ['Use the evidence list to find each low-contrast element.', 'Raise text/background contrast to at least 4.5:1 (3:1 for large text) in your stylesheet or design tokens.'] },
  lang: { steps: ['Set the page language on the root element, e.g. <html lang="en">, in the base template.'] },
};
