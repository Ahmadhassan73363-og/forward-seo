# Forward Shopify — Master Audit Tool Plan

An all-round audit tool for Shopify stores: speed, Core Web Vitals, SEO, Shopify URL architecture, structured data, product content, app cost, accessibility, AI-search readiness, international, conversion and security — every issue with the exact failing elements and a Shopify-specific fix.

Status legend: ✅ built · 🟡 partly built · ⬜ planned

---

## 1. Why this tool exists — gaps in existing tools

| Tool | Strong at | Missing for Shopify |
|---|---|---|
| PageSpeed Insights / Lighthouse | Lab speed, basic SEO/a11y | One URL at a time, no Shopify app attribution, generic advice, no history |
| GTmetrix / WebPageTest | Waterfalls, filmstrips | No SEO/schema, no Shopify fixes |
| Screaming Frog / Sitebulb | Crawling, duplicates | Get rate-limited by Shopify (HTTP 429), don't understand variant/filter/collection-scoped URLs |
| Ahrefs / Semrush site audit | Generic SEO | Generic advice, no Liquid snippets, no product-data checks |
| Rich Results Test / Schema validator | Schema per page | No API, no bulk, no price/stock consistency |
| Shopify speed report | Real-user score | One number, no diagnosis |
| Wappalyzer / BuiltWith | App detection | No cost per app, no leftover-code detection |
| Shopify SEO apps | Meta fields | Shallow, no CWV, no conversion checks |

**What this tool adds**

1. Real Google numbers on many pages at once (PSI + CrUX) — the same data as pagespeed.web.dev. ✅
2. App-level cost: “Sentry uses 5.8 s main thread on 100% of pages”. ✅
3. Shopify URL intelligence: collection-scoped product links, myshopify leaks, search-page indexing, broken sitemap URLs. ✅
4. A fix for every issue: theme file, Liquid snippet, Shopify admin deep link. ✅ (≈50 rules)
5. AI-search readiness: AI crawler access, llms.txt, entity schema, FAQ/definition content, Lighthouse 13 agentic-browsing audits. ✅
6. Owner mode via Shopify Admin API: the full catalog without crawling or rate limits. ✅ (access-token based; public OAuth app ⬜)
7. Real-browser user flows (add to cart → checkout), axe accessibility on rendered pages incl. open menus, JS-injected schema, console errors. ✅
8. Monitoring: scheduled runs, regression alerts (Slack/Discord/Teams webhooks), run-to-run comparison, competitor benchmark, print/PDF. ✅

---

## 2. Operating modes

| Mode | Scope | Data sources | Status |
|---|---|---|---|
| **Public** | Any store (own, client, competitor) | PSI, CrUX, polite HTML crawl, site checks | ✅ |
| **Owner** | Your store (Admin API token) | + Shopify Admin API ✅ · Search Console ⬜ · Merchant Center ⬜ | 🟡 |

---

## 3. Data sources

| Source | Used for | Status | Notes |
|---|---|---|---|
| PageSpeed Insights API v5 | Lighthouse scores, lab metrics, ~160 audits with failing elements, screenshots, third-party cost | ✅ `lib/engine/psi.ts` | Google runs Lighthouse — not affected by Shopify rate limits. Needs `PSI_API_KEY`. Handles Lighthouse 12/13 “insight” audits. |
| Chrome UX Report API + History API | Real-user p75 LCP/INP/CLS/FCP/TTFB for the origin (phone + desktop), ~25-week trend | ✅ `lib/engine/crux.ts` | Same key, “Chrome UX Report API” enabled. Falls back to PSI origin data. |
| Polite HTML crawler | Titles, meta, H1, canonicals, noindex, JSON-LD, links, images, intent signals | ✅ `lib/audit/core.ts` | Adaptive rate limiter, honours `Retry-After`, exponential backoff. |
| Site checks | robots.txt (+ AI bots), llms.txt, security headers, policy pages, /search, consent banner, hreflang | ✅ `lib/engine/site-checks.ts` | Non-catalog routes; not rate-limited. |
| Shopify Admin API (GraphQL) | Every product's SEO fields, description, media alt, barcodes, inventory; collections; redirect count; `layout/theme.liquid` scripts | ✅ `lib/engine/shopify-admin.ts` | Owner mode, read-only scopes `read_products, read_content, read_themes`. Cost-throttle aware. Menus, markets, policies via API ⬜ |
| Playwright browser worker | axe-core (WCAG 2.2 AA) after load and with the mobile menu open, rendered vs server JSON-LD, console errors, screenshots, add-to-cart → checkout flow | ✅ `lib/engine/browser.ts` | `playwright-core` + installed Chrome/Edge/Chromium (`CHROME_PATH` or auto-detect). Network waterfall ⬜ |
| Google Search Console API | Index coverage, URL Inspection (~2,000/day/property), queries | ⬜ | Owner OAuth. |
| Merchant Center API | Disapprovals, price/stock mismatches | ⬜ | Optional. |

---

## 4. Audit modules and checks

Each module produces **findings** in one shared format (section 6). Weights are the share of the overall score.

### 4.1 Speed & Core Web Vitals — 18% ✅
- Median Lighthouse performance per strategy; lab LCP, TBT, CLS, FCP, Speed Index per page.
- Real-user Core Web Vitals (CrUX, p75, 28 days) + trend; finding when the store fails on mobile.
- Lighthouse opportunities/insights grouped into Shopify fixes: render-blocking, unused/legacy JS, unused CSS, images, LCP element, layout shifts, fonts, server response, main-thread work, DOM size, caching, facades, request chains, page weight.
- Severity from estimated savings; LCP/CLS rules escalate using the page's actual metric (Lighthouse 13 often reports 0 ms savings).
- Score = median Lighthouse performance (mobile, else desktop).

### 4.2 App & Script Cost — 8% ✅
- Per third party: pages present, average main-thread ms, blocking ms, transfer KB (Lighthouse `third-party-summary` / `third-parties-insight`).
- Categorised: Analytics, Ads & pixels, Email & SMS, Reviews, Support, Subscriptions, Loyalty, Search, Payments, Video, Monitoring, Consent, Personalization, CDN, Platform.
- Merged with HTML fingerprint detection (`KNOWN_APPS`).
- ✅ Owner mode: third-party scripts hard-coded in `layout/theme.liquid` (survive app uninstalls). ⬜ Snippets/sections scan and script-tag API.

### 4.3 Technical SEO — 14% ✅
- Lighthouse SEO audits + crawl: status codes, unreachable pages, noindex in sitemap, canonicals (missing / mismatch / cross-domain), meta descriptions, H1 count, title length, image alt, link text, robots.txt and sitemap reference, viewport.
- Score = average of median Lighthouse SEO score and crawl-check score.

### 4.4 Shopify URL Architecture — 8% ✅
- Sitemap URLs returning 4xx/5xx; failing child sitemaps.
- Links to `/collections/*/products/*` duplicates.
- `.myshopify.com` links/canonicals when a custom domain is primary.
- `/search` indexable (not disallowed and not noindex).
- ⬜ `?variant=` / filter / `/collections/*/tag` URL indexation, redirect chains, menu links to 404 (Admin API menus).

### 4.5 Structured Data — 12% ✅
- Product / ProductGroup: required (name, offers, price, priceCurrency) vs recommended (availability, shippingDetails, hasMerchantReturnPolicy — also accepted at Organization level, image, brand, GTIN/SKU/MPN).
- `@graph` flattening, offers as object/array/AggregateOffer/variants.
- Duplicate Product entities (theme + apps), invalid JSON-LD.
- Collections: BreadcrumbList, ItemList/CollectionPage. Homepage: Organization, WebSite. Articles: Article/BlogPosting.
- ⬜ Schema price/stock vs page vs catalog vs Merchant Center (data consistency).

### 4.6 Product Content Quality — 8% ✅
- ✅ Public mode (crawled sample): thin product content (< 250 words of main content), missing brand/identifiers.
- ✅ Owner mode (full catalog, up to `OWNER_MAX_PRODUCTS`): no SEO description, SEO title > 70 chars, thin descriptions (< 50 words), duplicate descriptions, products without images, images without alt, no barcode (GTIN), out-of-stock but published, empty collections, collections without description.

### 4.7 AI Search Readiness — 6% ✅
- robots.txt access for GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot (search bots blocked = medium, training bots only = info).
- llms.txt presence, collection definition paragraphs (40+ words), FAQ coverage, Organization entity schema.
- Lighthouse 13 `agentic-browsing` audits (accessibility tree quality for AI agents).

### 4.8 International — 4% 🟡
- ✅ hreflang count, x-default, self-reference (homepage).
- ⬜ Return links across locales, locale sitemaps, Markets configuration, unwanted geo-redirects.

### 4.9 Accessibility — 10% ✅
- All Lighthouse accessibility audits (axe-core rules) with element selectors; Shopify fixes for contrast, accessible names, tap targets, heading order, lang, ARIA.
- ✅ Browser worker: axe-core WCAG 2.2 AA on home/product/collection/content pages after load, and on the homepage with the mobile menu open (drawers are a common failure Lighthouse never sees). axe and Lighthouse findings for the same rule merge.
- Score = median Lighthouse accessibility, averaged with the axe check score when browser tests ran (axe-only when PSI is unavailable).
- ⬜ Cart drawer and variant-picker states. Context: the European Accessibility Act applies to online stores since June 2025.

### 4.10 Conversion & Trust — 6% ✅
- ✅ Add-to-cart form present in server HTML, reviews/ratings present, Shopify policy pages (privacy, refund, shipping, terms).
- ✅ Real mobile flow (opt-in): open product → add to cart (verified via `/cart.js`) → cart → checkout reached; stops before customer details and clears the cart. Step timings and screenshots.
- ⬜ Sticky ATC visibility, trust badges, 404 page quality.

### 4.11 Security & Best Practices — 6% ✅
- Lighthouse best-practices audits (HTTPS, console errors, deprecated APIs, third-party cookies…).
- Security headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy), consent banner detection (HTML-based).

### 4.12 Indexing (owner mode) ⬜
- Search Console: indexed vs submitted, URL Inspection on key pages, crawl errors, top queries per template.

### 4.13 Theme Code (owner mode) 🟡
- ✅ Hard-coded third-party scripts in `layout/theme.liquid`.
- ⬜ Theme Check rules on all theme files, deprecated tags, images without sizes in Liquid, leftover app snippets.

### 4.14 Competitor Benchmark ✅
- Up to 5 competitors per run get the same public checks (≤ 10 pages, never owner credentials or cart flow); `/benchmark/[group]` shows overall/module/Lighthouse scores, real-user Core Web Vitals, serious issues and app counts side by side.

### 4.15 Monitoring ✅
- Every completed run is compared with the previous run of the same store: overall and module deltas, mobile performance delta, new and resolved issues.
- Regression = overall −5 or more, mobile performance −10 or more, or new high/critical issues → webhook alert (Slack `text` + Discord `content`; Teams incoming webhooks accept `text`).
- Scheduled audits (daily/weekly) with per-schedule webhook; scheduler starts with the server (`instrumentation.ts`).
- Print / Save as PDF from the report.

---

## 5. Architecture

```
Browser UI (Next.js)
  /                 new audit + recent runs
  /runs/[id]        live progress → Overview · Issues · Pages · Apps · Site checks
        │  REST
        ▼
API routes
  POST /api/runs              start a run
  GET  /api/runs              list runs (+ whether a server key exists)
  GET  /api/runs/:id          full run document (poll every 3 s)
  POST /api/runs/:id          { action: "cancel" }
  DELETE /api/runs/:id        delete a finished run
  GET  /api/runs/:id/screenshot?f=…
  GET  /api/runs?group=<id>   runs of one competitor benchmark
  GET/POST /api/schedules     list / create scheduled audits (webhook masked in responses)
  PATCH/DELETE /api/schedules/:id   pause-resume / delete
        │
        ▼
Job runner (lib/engine/runner.ts) — in-process queue, MAX_CONCURRENT_RUNS
        │
        ▼
Pipeline (lib/engine/pipeline.ts)
  1. discover    homepage (follows redirects) + sitemaps → targets (or custom URL list)
  2. in parallel
     ├─ PSI worker     targets × strategies, PSI_CONCURRENCY at a time, retries 429/5xx, saves screenshots
     ├─ crawl worker   polite crawlBatch loop, waits out Retry-After, gives up after 15 min stalled
     │    └─ browser worker (after the crawl, same Shopify budget): axe, rendered schema, console, cart flow
     ├─ site worker    site checks + CrUX
     └─ owner worker   Admin API catalog + theme scan (only if the token's shop matches the audited store)
  3. analyse     apps → findings (Lighthouse + crawl + site + CrUX + apps + browser + owner) → merge by fix rule → scores
  4. after run   compare with previous run of the same store → webhook alert on regression
Scheduler (runner.ts, started by instrumentation.ts) — checks schedules every 60 s and queues due runs
        │
        ▼
Store (lib/engine/store.ts) — .data/runs/<id>/run.json + shots/*.jpeg  (swap for Postgres later)
```

**File map**

| File | Responsibility |
|---|---|
| `lib/engine/types.ts` | Shared types, module definitions and weights (browser-safe) |
| `lib/engine/psi.ts` | PSI client + Lighthouse normalizer (`normalizePsi`, `extractItems`) |
| `lib/engine/crux.ts` | CrUX snapshot + history |
| `lib/engine/site-checks.ts` | robots/AI bots, llms.txt, headers, policies, search page, consent, hreflang |
| `lib/engine/apps.ts` | Third-party cost aggregation + categories |
| `lib/engine/fixes.ts` | Shopify fix library (rules keyed by Lighthouse audit IDs and check IDs) |
| `lib/engine/findings.ts` | Builds and merges findings from every source |
| `lib/engine/scoring.ts` | Module scores, overall score, grade, Google medians |
| `lib/engine/pipeline.ts` | Orchestrates one run |
| `lib/engine/runner.ts` | Queue, cancellation, restart recovery, comparison + alert after each run, scheduler |
| `lib/engine/browser.ts` | Playwright worker: axe, rendered schema, console errors, cart → checkout flow |
| `lib/engine/shopify-admin.ts` | Owner mode: Admin GraphQL catalog + theme audit |
| `lib/engine/compare.ts` | Run comparison, regression rules, webhook alerts |
| `lib/engine/schedules.ts` | Scheduled audits storage and due-time logic |
| `instrumentation.ts` | Starts the scheduler when the server boots |
| `app/benchmark/[group]/page.tsx` | Competitor benchmark view |
| `app/components/report-extra.tsx` | Browser tests and Catalog tabs |
| `lib/engine/store.ts` | Persistence |
| `lib/audit/core.ts` | HTML parser, polite crawler, rate limiter, sitemap discovery |
| `lib/audit/discover.ts` | Homepage + target selection |

---

## 6. Data model

**Finding** (one format for every source)

```ts
{
  id: 'rule:render-blocking',          // merged across sources that map to the same fix
  module: 'speed',
  checkId: 'render-blocking-resources,render-blocking-insight',
  title, description,
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info',
  source: 'lighthouse' | 'crawl' | 'site' | 'crux' | 'apps',
  pagesAffected: string[], pagesChecked: number,
  impact?: { savingsMs?, savingsBytes?, note? },
  evidence: [{ page, url, selector, snippet, label, value, wastedMs, wastedBytes }],  // ≤ 40
  fix?: { summary, steps[], where?, snippet?, adminPath?, docs? },
  learnMore?: string
}
```

**Run**: input (url, pages ≤ 100, strategies, customUrls) · store (host, handle) · progress · discovery counts · targets · psiTests (normalized Lighthouse per page/strategy) · crux · crawl pages · site checks · apps · findings · scores · warnings.

---

## 7. Scoring

- **Severity penalties** (modules without a Google category score): critical 30, high 18, medium 9, low 4, info 0 — each scaled by `0.4 + 0.6 × pagesAffected / pagesChecked`. Module score = `max(0, 100 − Σ penalties)`.
- **Google-backed modules**: Speed = median Lighthouse performance; Accessibility = median Lighthouse accessibility; Technical SEO = avg(median Lighthouse SEO, crawl score); Security = avg(median best-practices, header score).
- **Not measured ≠ zero**: a module without enough data is “Not scored” and excluded; weights are re-normalized over measured modules.
- **Grade**: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 55, else F; **Incomplete** when measured modules carry < 50% of the weight (the partial score is shown as such, never as the store's score).
- Google's four Lighthouse scores are always shown unmodified next to our score.

---

## 8. Fix engine

`lib/engine/fixes.ts` holds ≈50 rules. A rule has `audits` (Lighthouse IDs, classic + Lighthouse 12/13 insight IDs), optional `auditPattern`, and/or `checks` (engine check IDs), plus `summary`, `steps`, `where`, `snippet`, `adminPath`, `docs`. Findings that resolve to the same rule are merged (e.g. Lighthouse `image-alt` + crawl `missing_alt`). Unmapped failing audits are still reported with Lighthouse's own description and “Learn more” link, so nothing is dropped.

Adding a rule: append to `FIX_RULES`; no other code changes needed.

---

## 9. Operating the tool

**Environment**

| Variable | Default | Purpose |
|---|---|---|
| `PSI_API_KEY` | — | Google Cloud API key with *PageSpeed Insights API* and *Chrome UX Report API* enabled. Strongly recommended — the anonymous quota almost always returns 429. Can also be entered per run (memory only). |
| `PSI_CONCURRENCY` | 8 | Parallel PSI calls (Google quota ≈ 400 / 100 s, 25,000 / day per project). |
| `APP_PASSWORD` / `APP_USER` | — | Sign-in for the whole app. Without `APP_PASSWORD` the tool only answers on localhost. Required before exposing it on a network. |
| `RUNS_PER_HOUR` / `MAX_PENDING_RUNS` | 30 / 12 | Per-client hourly audit budget and server-wide queue limit (HTTP 429 beyond). |
| `ALLOW_PRIVATE_TARGETS` | — | `1` allows auditing localhost/private addresses (development only). |
| `CRAWL_MAX_WAIT_MS` | 120000 | How long to wait out Shopify's per-IP 429 on product/collection pages before finishing without them. |
| `CRAWL_CACHE_HOURS` | 72 | Pages still blocked reuse a successful crawl of the same URL from a recent run (marked “cached”). 0 = off. |
| `FEED_MAX_PRODUCTS` | 5000 | Products read from the public `/products.json` feed (250 per request). |
| `MAX_CONCURRENT_RUNS` | 2 | Runs processed at once. |
| `DATA_DIR` | `./.data` | Where runs, screenshots and schedules are stored. |
| `SHOPIFY_SHOP` / `SHOPIFY_ADMIN_TOKEN` | — | Owner mode for your store (also enterable per run). Used only when the audited store matches. |
| `SHOPIFY_API_VERSION` | `2025-10` | Admin GraphQL API version. |
| `OWNER_MAX_PRODUCTS` | 1000 | Products read per run in owner mode. |
| `CHROME_PATH` | auto-detect | Chrome/Edge/Chromium binary for browser tests. |
| `ALERT_WEBHOOK_URL` | — | Default Slack/Discord/Teams webhook for regression alerts. |
| `PUBLIC_BASE_URL` | — | Base URL used for report links inside alerts. |

**Hosting**: the runner does background work after the HTTP response, so it needs a long-running Node process: `npm run build && npm start` on a VPS, Railway, Render, Fly or Docker. On Vercel the tool switches to **live mode** automatically: each audit runs inside one streaming request (`POST /api/audit`, up to 300 s) and the report lives only in the browser tab; nothing is stored, and history, comparison, schedules, competitors and browser tests are unavailable. See [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).

**Cost & time**: PSI and CrUX are free. 20 pages × 2 strategies = 40 PSI calls ≈ 4–6 min at concurrency 4.

---

## 10. Phases

| Phase | Scope | Status |
|---|---|---|
| 1. Foundation | Run store, job runner, PSI + CrUX workers, Lighthouse normalizer, findings format, report UI with progress | ✅ |
| 2. Shopify layer | Fix library, app cost, URL architecture, schema validator, site checks, AI readiness, scoring | ✅ |
| 3. Browser worker | Playwright: axe after load + menu open, rendered vs server schema, console errors, screenshots, add-to-cart → checkout flow | ✅ (network waterfall, cart-drawer/variant states ⬜) |
| 4. Owner mode | Admin API token: full catalog quality, collections, redirects count, theme.liquid scripts | 🟡 (public OAuth app, Bulk Operations for > 1,000 products, Search Console, Merchant Center ⬜) |
| 5. Monitoring & scale | Run comparison, regression webhook alerts, daily/weekly schedules, competitor benchmark, print/PDF | 🟡 (email alerts, Postgres + external queue for serverless hosting ⬜) |

### Remaining work (next)
- **Search Console** (Google OAuth): Search Analytics queries per template, URL Inspection for top pages → Indexing module.
- **Public Shopify app** (Partner dashboard, OAuth) so merchants connect without creating tokens; Bulk Operations for very large catalogs; menus (`read_online_store_navigation`), markets, policies.
- **Theme Check** over all theme files; leftover app snippets in `snippets/`.
- **Browser**: cart drawer and variant-picker axe states, network waterfall, INP interaction timing.
- **Scale**: Postgres store + external queue (QStash/Inngest) to run on serverless; email alerts.

---

## 11. Verification status

| Area | How it was verified | Result |
|---|---|---|
| Lighthouse normalizer, findings, apps, scoring | Real Lighthouse 13.6 report (local Chrome) fed through the engine | ✅ scores, metrics, LCP element, 22 failed audits → 18 issues, 47 third parties |
| End-to-end run, crawl, site checks | Live runs against a public Shopify store | ✅ |
| PageSpeed Insights API success path | Needs `PSI_API_KEY` | ✅ live audit of allbirds.com (5 pages × mobile + desktop): 10/10 tests, real Lighthouse 13 scores, 22 merged findings with fixes |
| Public catalog feed | `/products.json` + `/collections.json` | ✅ allbirds.com: 333 products + 1,349 collections in ~5 s while `/products/*` HTML returned 429 from the same IP; 5 catalog findings |
| CrUX API | Needs `PSI_API_KEY` + *Chrome UX Report API* enabled on the key's project | ⏳ key works for PSI; CrUX returned 403 “API not enabled” (shown as an honest “unavailable” message in the report) |
| Browser worker (axe, menu-open, rendered schema, console) | Live store + local page with planted violations | ✅ 6/6 planted violations found, 7th found only with menu open; JS-only schema and console errors detected |
| Cart → checkout flow | Needs a store you own | ⏳ not run (would create a cart on a third-party store) |
| Owner mode | Needs an Admin API token | ⏳ findings/merging unit-tested with synthetic data; live API not yet run |
| Comparison, regression rules, webhook URL safety | Unit checks + live consecutive runs | ✅ |
| Scheduler | Live: schedule created → run queued by the tick → cancelled | ✅ |

## 12. Risks and limits

- **Shopify rate limits (public mode)**: catalog routes return `429 local_rate_limited` with `Retry-After: 60` per IP. The crawler respects it and backs off; heavy repeated testing from one IP can keep it blocked for a while. Owner mode avoids this.
- **No evasion**: the tool does not rotate IPs/proxies or solve Cloudflare/CAPTCHA challenges. Challenged pages are reported, not forced.
- **Lab vs field**: Lighthouse numbers vary run to run (±5–10 points). CrUX is the ranking data; lab data explains why.
- **HTML-only checks**: collection descriptions, consent banners and add-to-cart detection depend on server-rendered HTML; JS-only features need phase 3.
- **Quotas**: PSI ≈ 25,000/day/project; Search Console URL Inspection ≈ 2,000/day/property; Admin API cost limits.
