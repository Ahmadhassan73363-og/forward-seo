# SEO + AI SEO Dashboard: integration scope

**Status (12 Nov 2026):** built **without storage**, as requested. Every source runs inside the audit, and its results live only in that report.
- The **SEO & AI dashboard** tab shows all KPIs.
- **KPIs CSV** exports them for Sheets / Looker Studio.
- Setup: [SEO_AI_INTEGRATIONS.md](SEO_AI_INTEGRATIONS.md).

**Built:**
- GA4 (4.2) and Merchant Center (4.3)
- Search Console page-type and brand split (4.1)
- AI visibility probes (4.8) and AI Overviews through DataForSEO (4.9)
- Otterly (4.10)
- Screaming Frog CSV import in the browser (4.11)
- Looker Studio through CSV (4.12)

**Not built yet, because these need storage or more verification:**
- trend KPIs from our own snapshots (3.1, backlink growth)
- the daily collector and a separate dashboard route
- sitemap-wide URL Inspection rotation
- Semrush and Ahrefs history and competitor additions (4.4, 4.5)
- per-type Schema requirement checks (4.7)
**Goal:** one dashboard per store that shows classic SEO KPIs and AI-search KPIs side by side. Every number comes from a named source, with its date and how it was measured.

Related: [MASTER_PLAN.md](MASTER_PLAN.md) · [SEARCH_CONSOLE.md](SEARCH_CONSOLE.md) · [AHREFS.md](AHREFS.md) · [SEMRUSH.md](SEMRUSH.md) · [TESTING_INTEGRATIONS.md](TESTING_INTEGRATIONS.md)

---

## 1. Principles (apply to every integration)

1. **No made-up numbers.** A KPI is shown only when its source returned it. A missing value is "—", never 0. When a source isn't connected, the tile says "Not connected", with the setup link.
2. **Every value is labelled** with its source, the date range, and one of these kinds:
   - **Measured:** counted by the source. Examples: GSC clicks, GA4 sessions.
   - **Estimated:** modelled by a vendor. Examples: Semrush or Ahrefs traffic.
   - **Sampled:** from a fixed set of prompts or URLs we test. Examples: AI mentions, URL Inspection.
3. **AI visibility is a sample, not a census.** "ChatGPT mentioned the brand in 7 of 40 prompts on 12 Nov 2026 (model X)" is honest. "ChatGPT brand mentions: 7" is not. The UI always shows the denominator.
4. **Same structure as the existing integrations** (`config.ts` / `client.ts` / `index.ts`):
   - keys stay on the server and are never sent to the browser;
   - when a key is missing, there are no requests and no tile;
   - a failed request shows its reason, and the rest of the data is kept;
   - the mock server lets each integration be tested ([TESTING_INTEGRATIONS.md](TESTING_INTEGRATIONS.md)).
5. **Not scored.** Third-party KPIs don't change the audit score. The score stays based on what the audit itself checks.

---

## 2. What already exists

| Tool | In the project | Where |
|---|---|---|
| PageSpeed Insights + CrUX | ✅ Lighthouse per page, real-user Core Web Vitals, ~25-week CrUX history | `lib/engine/psi.ts`, `lib/engine/crux.ts` |
| Schema.org / JSON-LD | ✅ Parsed and validated in the crawl (Product/Offer, Breadcrumb, Organization …); rendered vs server JSON-LD | `lib/audit/core.ts`, `lib/engine/browser.ts`, `findings.ts` |
| Google Search Console | ✅ Clicks, impressions, CTR, position, queries, pages, devices, countries, sitemaps, URL Inspection (sample) | `lib/engine/gsc/` |
| Semrush | ✅ Authority Score, backlinks, organic traffic/keywords (estimated), top pages, keywords | `lib/engine/semrush/` |
| Ahrefs | ✅ Domain Rating (free), plus backlinks, organic traffic, top pages and keywords (paid) | `lib/engine/ahrefs/` |
| AI-crawler readiness | ✅ robots.txt for GPTBot/PerplexityBot/…, llms.txt, entity schema | `lib/engine/site-checks.ts` |
| Competitor runs | ✅ Up to 5 competitors through the public checks | `/benchmark/[group]` |
| GA4, Merchant Center, Otterly.AI, LLM probes, AI Overviews, Screaming Frog import, Looker Studio export | ⬜ | This document |
| **History over time** (needed for "growth" KPIs) | 🟡 File store only. On Vercel live mode nothing is kept | Section 3.1 |

---

## 3. Decisions needed before building

### 3.1 Storage for trends (blocking)

KPIs such as *backlink growth*, *AI-referred sessions over time* and *competitor AI visibility trend* need daily or weekly snapshots. Today, Vercel runs in live mode and keeps nothing, and the file store works only on a server with a disk.

| Option | Fits | Notes |
|---|---|---|
| **Postgres (Neon / Supabase / Vercel Postgres)**, recommended | Vercel and self-hosted | One `metric_snapshots` table (section 6). Free tiers cover one store's daily data. |
| BigQuery | When Looker Studio is the main dashboard | Pay per query; natural Looker Studio source. |
| Keep the file store | Self-hosted only (Railway/Render with a disk) | No new service; doesn't work on Vercel. |

### 3.2 Collection schedule

- A **daily collector** (Vercel Cron, or the existing scheduler on a server) pulls GSC, GA4, Merchant Center, Ahrefs, Semrush and the AI probes into snapshots.
- The audit stays on-demand.
- AI probes are the slowest and most expensive part, so they run weekly by default.

### 3.3 Store profile

Each store needs a profile: domain, brand name and aliases, competitors, GA4 property, Merchant Center account, and the AI prompt set.

- GA4 and Merchant Center IDs can be **auto-matched**, the same way Search Console is: list what the service account can access, then match by website URL. A manual override stays possible.
- Brand names, competitors and prompts need human input.

### 3.4 One Google service account

The service account already used for Search Console can also be given access to GA4 (Viewer) and Merchant Center (standard/read access). That way there is one credential for all three Google sources (`GSC_SERVICE_ACCOUNT_*`, renamed to `GOOGLE_SERVICE_ACCOUNT_*` with the old names kept as aliases).

---

## 4. Integrations

Rough size: **S** ≈ 1–2 days, **M** ≈ 3–5 days, **L** ≈ 1–2 weeks. All sizes include tests against the mock server and docs.

### 4.1 Google Search Console ✅ (extend)

**KPIs:** organic clicks, organic impressions, average position, indexed pages, product/collection traffic.

Done: see [SEARCH_CONSOLE.md](SEARCH_CONSOLE.md).

**Extensions:**

| Item | How | Size |
|---|---|---|
| **Product vs collection traffic** | Search Analytics with `dimensions: ['page']` and page filters `includingRegex` `/products/` and `/collections/`. Gives clicks and impressions per template, plus top products. | S |
| **Indexed pages** | The API does **not** expose the "Page indexing" report counts. Instead, run URL Inspection over the sitemap URLs (from the crawl's sitemap discovery). Use up to ~1,800 URLs/day per property, under Google's 2,000 limit, rotating so large catalogues are covered over several days. Show it as "X of Y inspected URLs indexed (sampled, last 30 days)", never as an exact total. | M |
| Daily snapshot of totals | Collector (section 3.2) | S |
| Brand vs non-brand clicks | Query filter on the brand names from the store profile | S |

**Note:** Search Console mixes AI Overview and AI Mode data into the normal web totals, with no separate filter. So it can't measure AI Overview visibility (see 4.9).

### 4.2 Google Analytics 4 ⬜ (new)

**KPIs:** organic conversion rate, AI-referred sessions, product/collection traffic (sessions and revenue).

- **API:** GA4 Data API v1 `properties/{id}:runReport`. Auto-matching uses the Admin API (`accountSummaries.list` and `properties.dataStreams.list`, matching `webStreamData.defaultUri` to the store).
- **Auth:** the shared Google service account, added as **Viewer** on the GA4 property. Scope `analytics.readonly`.
- **Cost:** free, within GA4 API quotas (token-based per property).

**Reports:**

| Report | Dimensions / metrics |
|---|---|
| Organic overview | Filter `sessionDefaultChannelGroup = "Organic Search"`. Metrics: `sessions`, `engagedSessions`, `keyEvents`, `sessionKeyEventRate`, `ecommercePurchases`, `purchaseRevenue` |
| **Organic conversion rate** | `ecommercePurchases / sessions` for Organic Search, plus GA4's own `sessionKeyEventRate` (both shown, both labelled) |
| **AI-referred sessions** | `sessionSource` matching the list below. Metrics: sessions, engaged sessions, purchases, revenue, by day |
| Landing pages | `landingPagePlusQueryString` for organic sessions, grouped into product/collection/other |

AI referral sources (kept as a config list, so it's easy to update): `chatgpt.com`, `chat.openai.com`, `perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com`, `claude.ai`, `you.com`, `meta.ai`, `deepseek.com`.

**Limits:**
- AI apps often send no referrer, so AI-referred sessions are a **lower bound**. The tile says so.
- GA4 thresholding and sampling can hide small numbers. The tile shows when GA4 flags this (`metadata.dataLossFromOtherRow` / `subjectToThresholding`).

**Files:**
- `lib/engine/ga4/` with `config.ts`, `client.ts` (shares the Google JWT code with `gsc/client.ts`, moved to `lib/engine/google/auth.ts`), and `index.ts`
- `app/components/ga4/`

**Size:** M

### 4.3 Google Merchant Center ⬜ (new)

**KPIs:** product visibility (free listings impressions and clicks), disapproved products, price competitiveness.

- **API:** **Merchant API** only. The Content API for Shopping reached its sunset on **18 Aug 2026** and must not be used.
- **Reports:** Reports sub-API `accounts.reports.search` (Merchant Reports Query Language).
- **Auto-matching:** Accounts sub-API, matching the account's homepage to the store.
- **Auth:** the shared service account, added as a user in Merchant Center. Scope `content`.
- **Cost:** free.

| Data | Source table / call |
|---|---|
| Free listings performance (impressions, clicks, CTR, conversions) | `product_performance_view`, filtered on organic (free listings) |
| Product status: approved / limited / disapproved, and the top item issues | `product_view` (status and item issues) |
| Price competitiveness vs benchmark | `price_competitiveness_product_view` (needs eligibility) |
| Best sellers in the store's categories | `best_sellers_product_cluster_view` |

**Verify before building:** the exact field names per table, and which tables need extra eligibility. Confirm against the Merchant API reference.

**Files:** `lib/engine/merchant/`, `app/components/merchant/`
**Size:** M

### 4.4 Semrush ✅ (extend)

**KPIs:** backlink growth, competitor organic visibility.

| Item | How | Size |
|---|---|---|
| Organic competitors | v3 report `domain_organic_organic` (competitors by common keywords) | S |
| Backlink growth | Daily snapshot of Authority Score, backlinks and referring domains (section 6). Optional: Semrush backlinks history reports (*verify which report type and unit cost*) | S |
| Units budget guard | Skip Semrush when `unitsLeft` is below a set threshold | S |

### 4.5 Ahrefs ✅ (extend)

**KPIs:** backlink growth, competitor visibility.

| Item | How | Size |
|---|---|---|
| Referring domains history | Site Explorer `refdomains-history` (paid). This gives growth without waiting for our own snapshots. *Verify the endpoint name and units.* | S |
| Organic competitors | Site Explorer organic competitors endpoint (paid) | S |
| Free plan | DR snapshot only; growth comes from our own snapshots | — |

### 4.6 PageSpeed Insights + CrUX ✅ (dashboard tile only)

**KPI:** Core Web Vitals.

- Use the existing data: CrUX p75 LCP/INP/CLS for phone and desktop with pass/fail, and the CrUX History trend.
- Dashboard work only: snapshot the latest CrUX values daily.
- **Size:** S

### 4.7 Schema.org / JSON-LD ✅ (extend)

**KPI:** structured data health. It also feeds AI readiness, because AI answers favour clear entities.

| Item | How | Size |
|---|---|---|
| Google requirements per type | Check Product / Offer / MerchantReturnPolicy / OfferShippingDetails / AggregateRating / BreadcrumbList / Organization against Google's required and recommended fields | M |
| Cross-check with Google | Compare our findings with the rich-result issues from GSC URL Inspection (4.1) | S |
| Merchant listing fields | Price, availability, GTIN/brand consistency between JSON-LD and Merchant Center (4.3) | S |

### 4.8 AI visibility probes ⬜ (new, core of the AI SEO side)

**KPIs:** ChatGPT brand mentions, Perplexity citations, Gemini brand mentions, competitor AI visibility, product recommendation frequency, cited website URLs.

**How it works:**
1. Each store profile has a **prompt set**: 20–100 questions buyers ask, in groups. Examples:
   - *"best merino running shoes"* (category)
   - *"allbirds vs on running"* (comparison)
   - *"is allbirds worth it"* (brand)
   - *"sustainable sneakers under $150"* (shopping)
2. A weekly job sends each prompt to each engine's API, **with web search enabled**, and stores the full answer and its cited URLs.
3. A parser finds the brand and its aliases, competitor names, store product names (from the crawl or the Admin API), and cited domains and URLs.

| Engine | API | Citations from |
|---|---|---|
| ChatGPT | OpenAI Responses API with the `web_search` tool | `url_citation` annotations |
| Perplexity | Perplexity Sonar API | `citations` / `search_results` |
| Gemini | Gemini API with Google Search grounding | `groundingMetadata` (grounding chunks) |
| Claude (optional) | Anthropic Messages API with the web search tool | citation blocks |

**KPI definitions (always "x of n prompts"):**

| KPI | Definition |
|---|---|
| Brand mentions (per engine) | Prompts where the answer names the brand or an alias ÷ prompts sent |
| Citations (per engine) | Prompts where at least one cited URL is on the store's domain ÷ prompts sent |
| Competitor AI visibility | The same two numbers for each competitor; share of voice = brand mentions ÷ all tracked brand mentions |
| Product recommendation frequency | Shopping prompts where a store product is named ÷ shopping prompts |
| Cited website URLs | All cited URLs, grouped by domain, with counts. Store URLs are listed separately |

**Honesty rules:**
- API answers are **not** identical to the consumer apps. Those are personalised, use different models and settings, and change between runs. The dashboard says "measured via API, model X, date Y".
- Run each prompt once per week. Optionally run 3 times and report the share of runs, to smooth randomness.
- Store the raw answers so any number can be traced back to the exact text.

**Cost:** pay-per-use API tokens, plus search fees where the engine charges them. Rough guide: 50 prompts × 3 engines weekly ≈ 600 calls a month, typically a few dollars to tens of dollars. *Check current prices before launch.* Each engine's cost guard is env-configurable.

**Files:**
- `lib/engine/ai-visibility/` with `prompts.ts`, `engines/openai.ts`, `perplexity.ts`, `gemini.ts`, `parse.ts` (mentions, products, citations) and `index.ts`
- `app/components/ai-visibility/`

**Size:** L

### 4.9 Google AI Overviews visibility ⬜ (new)

**KPI:** Google AI Overviews visibility.

- Google has no official API, and Search Console doesn't separate AI Overviews (4.1).
- Use a **SERP data API** that returns AI Overview blocks with their cited references:
  - **DataForSEO**: `ai_overview` item with `references`. Its Labs "ranked keywords" can also filter on `ai_overview`.
  - **SerpApi**: AI Overview data.
- Run the same prompt set (as keywords) plus the store's top GSC queries.

| KPI | Definition |
|---|---|
| AIO presence | Tracked keywords that show an AI Overview ÷ tracked keywords |
| AIO citation share | Keywords where the AI Overview cites the store's domain ÷ keywords with an AI Overview |
| Competitor AIO citations | The same, per competitor |

- **Cost:** per SERP request; pay as you go.
- **Files:** `lib/engine/serp/` (provider chosen by env, DataForSEO first)
- **Size:** M

### 4.10 Otterly.AI ⬜ (optional; alternative or complement to 4.8 and 4.9)

**Use when:** the store already pays for Otterly, or we'd rather not run our own probes.

- **API:** public API at `https://data.otterly.ai/v1`, bearer key from the Otterly dashboard. It offers brand reports, prompts, citations, and AI crawler traffic on your own domains.
- **Plan:** import Otterly's brand-mention and citation data into the same AI-visibility KPIs, with the source shown as "Otterly.AI". Don't mix it with our own probe numbers in one figure.
- **Verify before building:** the exact endpoints and fields, which plans include API access, and the rate limits ([docs.otterly.ai](https://docs.otterly.ai/)).
- **Files:** `lib/engine/otterly/`
- **Size:** S–M

### 4.11 Screaming Frog ⬜ (import, not live)

Screaming Frog is a desktop (Java) crawler. It can't run inside Vercel functions, and the project already has its own crawler. So the scope is **import**:
- Upload a Screaming Frog CSV export (Internal: All / Response Codes / Directives / Structured Data) on the store page.
- Map its columns onto our page model, and show "Screaming Frog crawl, uploaded on date X" next to our crawl. This is useful for full-site crawls beyond our page limit.

Licensing: the free version is limited to 500 URLs, and features such as scheduling and saving crawls need a licence. Running it headless on a server is possible with a licence. That would be a later, self-hosted option.

**Files:** `lib/engine/import/screaming-frog.ts`, with an upload route
**Size:** M

### 4.12 Looker Studio ⬜ (export, not a data source)

Looker Studio has no native connector for a JSON API. We provide data in one of these ways:

| Option | When | Size |
|---|---|---|
| **BigQuery tables** from the daily collector (same rows as section 6); Looker's free BigQuery connector | Storage option BigQuery (3.1), or many stores | M |
| **Google Sheets** append from the collector; Looker's Sheets connector | One or a few stores, simplest | S |
| Community connector (Apps Script) reading `/api/metrics` with a per-store read token | When the in-app storage is Postgres and no copy is wanted | M |

A ready-made Looker Studio report template comes with the chosen option. The in-app dashboard (section 5) stays the primary view.

---

## 5. Dashboard

Route `/dashboard/[store]`, linked from the home page and from each report.

**Header:**
- store and date range picker (7 / 28 / 90 days)
- last collection time per source
- connected and not-connected sources

**SEO section:**

| Tile | Source | Kind |
|---|---|---|
| Organic clicks · impressions · avg position (with sparkline and change vs previous period) | GSC | Measured |
| Indexed pages | GSC URL Inspection | Sampled |
| Organic sessions · conversion rate · revenue | GA4 | Measured |
| Product vs collection traffic | GSC + GA4 | Measured |
| Backlinks / referring domains growth | Ahrefs / Semrush snapshots | Estimated |
| Core Web Vitals (phone, desktop) | CrUX | Measured (real users) |
| Free listings impressions · clicks · disapproved products | Merchant Center | Measured |
| Structured data health | Our crawl + GSC rich results | Measured |

**AI SEO section:**

| Tile | Source | Kind |
|---|---|---|
| Brand mentions: ChatGPT · Perplexity · Gemini (x / n prompts, trend) | AI probes / Otterly | Sampled |
| Citations of the store's domain per engine | AI probes / Otterly | Sampled |
| Google AI Overviews: presence and citation share | SERP API | Sampled |
| AI-referred sessions (and revenue) | GA4 | Measured, lower bound |
| Competitor AI visibility (share of voice chart) | AI probes | Sampled |
| Product recommendation frequency | AI probes | Sampled |
| Cited URLs table (domain, count, engines) with a drill-down to the prompt and answer text | AI probes | Sampled |

**Every tile:**
- has a source badge, kind badge, date range and info tooltip;
- says "Not connected" with a setup link when it has no data;
- shows "Last run failed: reason" when the latest pull failed, along with the previous value and its date.

---

## 6. Data model (for 3.1 storage)

```ts
// One row per store / source / metric / day. Dimensions hold breakdowns (engine, competitor, template …).
interface MetricSnapshot {
  storeId: string;
  source: 'gsc' | 'ga4' | 'merchant' | 'ahrefs' | 'semrush' | 'crux' | 'ai_probe' | 'serp' | 'otterly' | 'crawl';
  metric: string;            // 'clicks', 'ai_brand_mention_rate', 'refdomains', …
  date: string;              // YYYY-MM-DD
  value: number | null;      // null = source answered but had no value (shown as "—")
  numerator?: number;        // for sampled KPIs: x
  denominator?: number;      // for sampled KPIs: n
  dimensions?: Record<string, string>;   // { engine: 'perplexity' } | { competitor: 'on.com' } | { template: 'product' }
  kind: 'measured' | 'estimated' | 'sampled';
  fetchedAt: string;
}

interface AiProbeResult {     // raw evidence behind every AI number
  storeId: string; runId: string; engine: string; model: string; prompt: string; promptGroup: string;
  answer: string; citedUrls: string[]; brandsFound: string[]; productsFound: string[]; askedAt: string;
}

interface StoreProfile {
  storeId: string; domain: string; brand: string; aliases: string[]; competitors: { name: string; domain: string; aliases: string[] }[];
  ga4PropertyId?: string; merchantAccountId?: string; gscProperty?: string;   // auto-matched, overridable
  prompts: { text: string; group: 'category' | 'comparison' | 'brand' | 'shopping' }[];
}
```

---

## 7. Architecture

```
lib/engine/
  google/auth.ts          shared service-account JWT → token (from gsc/client.ts)
  gsc/ ✅  ga4/  merchant/  ahrefs/ ✅  semrush/ ✅  crux.ts ✅
  ai-visibility/          prompts, engines/*, parse, index
  serp/                   AI Overviews (DataForSEO / SerpApi)
  otterly/                optional import
  import/screaming-frog.ts
  metrics/
    store.ts              MetricSnapshot read/write (Postgres | BigQuery | file)
    collect.ts            daily/weekly collector: calls each connector, writes snapshots
    export.ts             Sheets / BigQuery export for Looker Studio
app/
  dashboard/[store]/page.tsx
  api/metrics/route.ts    dashboard data (and optional Looker community connector)
  api/cron/collect/route.ts   Vercel Cron entry (secret-protected)
scripts/mock-apis.mjs     extended with GA4, Merchant, AI engines, SERP mocks
```

The audit pipeline keeps calling the connectors for its report tabs, and the collector calls the same functions for the dashboard. There is one implementation per source.

---

## 8. Phases

| Phase | Deliverables | Done when |
|---|---|---|
| **0. Foundations** | Storage (3.1), StoreProfile UI, `google/auth.ts`, collector + cron, `/dashboard/[store]` with GSC / Ahrefs / Semrush / CrUX tiles from existing connectors | Dashboard shows 28-day trends for an existing store, after a week of daily snapshots |
| **1. Google first-party** | GA4 (4.2), Merchant Center (4.3), GSC extensions (4.1) | Organic conversion rate, AI-referred sessions, product/collection traffic, free listings and indexed pages shown with mock and real data |
| **2. AI visibility** | AI probes (4.8), AI Overviews (4.9), prompt-set editor, evidence drill-down | Each AI KPI shows x/n with drill-down to the stored answers; competitor share of voice chart |
| **3. Extensions** | Semrush/Ahrefs history and competitors (4.4, 4.5), Schema requirements (4.7) | Backlink growth from day one via vendor history |
| **4. Reporting** | Looker Studio export and template (4.12), Otterly import (4.10), Screaming Frog import (4.11) | A Looker Studio report fed by the export refreshes daily |

Each phase: mock-server scenarios for every new source (ok, wrong key, no access, partial failure); docs page per source; `next build` passes.

---

## 9. Environment variables (planned)

```
# Storage (3.1)
DATABASE_URL=                     # Postgres; or BIGQUERY_DATASET=…
CRON_SECRET=                      # protects /api/cron/collect

# Google (one service account for GSC, GA4, Merchant Center)
GOOGLE_SERVICE_ACCOUNT_JSON=      # alias of GSC_SERVICE_ACCOUNT_JSON (kept working)
GA4_ENABLED=true                  # GA4 properties auto-matched; override per store profile
MERCHANT_ENABLED=true

# AI visibility (4.8)
OPENAI_API_KEY=
PERPLEXITY_API_KEY=
GEMINI_API_KEY=
AI_PROBE_SCHEDULE=weekly          # weekly | daily | off
AI_PROBE_RUNS_PER_PROMPT=1
AI_PROBE_MAX_PROMPTS=50           # cost guard

# AI Overviews (4.9)
SERP_PROVIDER=dataforseo          # dataforseo | serpapi
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
SERPAPI_KEY=

# Optional
OTTERLY_API_KEY=
LOOKER_EXPORT=sheets              # sheets | bigquery | off
LOOKER_SHEET_ID=
```

---

## 10. Cost summary

| Source | Cost |
|---|---|
| Search Console, GA4, Merchant Center, CrUX/PSI, Looker Studio, Sheets | Free (quota-limited) |
| Ahrefs | Free DR; Site Explorer needs a paid plan with API units |
| Semrush | Business plan + API units (≈355 units per audit with current defaults) |
| AI probes | Per-token API cost per engine (plus search fees where charged) |
| AI Overviews | Per SERP request (DataForSEO / SerpApi) |
| Otterly.AI | Otterly subscription |
| Screaming Frog | Free ≤ 500 URLs; licence for larger or scheduled crawls |
| Postgres / BigQuery | Free tiers are usually enough for a few stores |

---

## 11. Risks and open questions

- **Storage choice** (3.1) blocks every trend KPI. Decide first.
- **AI answers vary** between runs, models and countries. That's why we use fixed prompt sets, store the evidence, and always show x/n.
- **AI referral undercount:** many AI visits arrive without a referrer, so GA4 numbers are a lower bound.
- **"Indexed pages"** has no exact API. It's sampled through URL Inspection, within 2,000 URLs/day per property.
- **Vendor API changes:** endpoints marked *verify* must be checked against current docs when building.
- **Access:** GSC, GA4 and Merchant Center need the store owner to add the service account. Client onboarding needs a checklist page that shows which sources are connected per store.
- **Terms of use:** use official APIs only, with no scraping of ChatGPT, Gemini or Google results pages. The SERP data comes from a provider.

Sources used for the API facts in this document:
- [Otterly.AI API docs](https://docs.otterly.ai/)
- [Content API for Shopping sunset](https://developers.google.com/shopping-content/guides/sunset)
- [DataForSEO AI Overview](https://dataforseo.com/serp-feature/ai-overview)
- [Looker Studio connectors](https://docs.cloud.google.com/looker/docs/studio/available-connectors)
