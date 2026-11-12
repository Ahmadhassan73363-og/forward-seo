# SEO + AI SEO integrations: setup

Every source is optional. Without its key, the app makes no requests to it and shows no tab for it; the **SEO & AI dashboard** tab then marks its tiles "Not connected".

Nothing is stored. Each audit fetches fresh data, and the results live only in that audit's report. Every value comes from the source named on its tile and doesn't change the audit score.

| Source | Tab | Key(s) | Cost |
|---|---|---|---|
| Search Console | Search Console | Google service account ([SEARCH_CONSOLE.md](SEARCH_CONSOLE.md)) | Free |
| [GA4](#ga4) | GA4 | Same service account + `GA4_ENABLED=true` | Free |
| [Merchant Center](#merchant-center) | Merchant Center | Same service account + `MERCHANT_ENABLED=true` | Free |
| Ahrefs / Semrush | Search & Authority / Semrush | [AHREFS.md](AHREFS.md), [SEMRUSH.md](SEMRUSH.md) | Free DR / paid |
| [AI answers](#ai-visibility) (ChatGPT, Perplexity, Gemini) | AI search | `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `GEMINI_API_KEY` (any of them) | Pay per use |
| [Google AI Overviews](#ai-overviews) | AI search | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` | Pay per request |
| [Otterly.AI](#otterly) | AI search | `OTTERLY_API_KEY` | Otterly plan |
| [Screaming Frog](#screaming-frog) | Screaming Frog import | none (CSV upload in the browser) | Free ≤ 500 URLs |
| [Looker Studio](#looker-studio) | SEO & AI dashboard → KPIs CSV | none | Free |
| PageSpeed / CrUX, Schema.org | Overview, Pages, Issues | `PSI_API_KEY` (already set up) | Free |

## One Google service account for Search Console, GA4 and Merchant Center

1. Set up the service account as described in [SEARCH_CONSOLE.md](SEARCH_CONSOLE.md).
2. In Google Cloud, also enable the **Google Analytics Data API**, the **Google Analytics Admin API** and the **Merchant API**.
3. Set `GOOGLE_SERVICE_ACCOUNT_JSON` (or `GOOGLE_SERVICE_ACCOUNT_FILE`). The older `GSC_SERVICE_ACCOUNT_*` names still work.
4. Each store owner adds the account's email (shown on the home page) to:
   - **Search Console:** Settings → Users and permissions → Restricted.
   - **GA4:** Admin → Property access management → Viewer.
   - **Merchant Center:** Settings → People and access → add the email.

## GA4

| Setting | Effect |
|---|---|
| `GA4_ENABLED=true` | Turns GA4 on. It's off by default because not every store gives GA4 access. |
| `GA4_PROPERTIES` | Optional per-store property IDs: `store.com=123456789, other.com=987654321`. Without it, the property whose **web stream URL** matches the store is used. |
| `GA4_DAYS` | Period length (default 28). The previous period of the same length is used for comparison. |
| `GA4_AI_SOURCES` | Session sources counted as AI referrals. Default: chatgpt.com, chat.openai.com, perplexity.ai, gemini.google.com, bard.google.com, copilot.microsoft.com, claude.ai, you.com, meta.ai, deepseek.com, grok.com |

**What it shows:**
- Organic sessions, and organic conversion rate (purchases ÷ sessions, with GA4's own key event rate shown too).
- Organic revenue, compared with the previous period.
- AI-referred sessions and revenue, by source and by day.
- Organic landing pages grouped into home, product, collection and other.

**Limits:**
- AI apps often send no referrer, so AI-referred sessions are a **lower bound**.
- When GA4 applies thresholds or sampling, the tab says so.

## Merchant Center

| Setting | Effect |
|---|---|
| `MERCHANT_ENABLED=true` | Turns Merchant Center on (off by default). |
| `MERCHANT_ACCOUNTS` | Optional `store.com=<account id>`. Without it, the account whose homepage matches the store is used. |
| `MERCHANT_DAYS` | Free listings period (default 28). |
| `MERCHANT_MAX_PRODUCTS` | Products read for the status counts (default 5000). |

- **API:** the **Merchant API v1**, because the Content API for Shopping shut down on 18 Aug 2026.
- **What it shows:**
  - free listings (ORGANIC) clicks, impressions, CTR and conversions, against the previous period
  - top products
  - product status counts: eligible, limited, pending and disapproved
  - the most common item issues
  - disapproved products

## AI visibility

Buyer questions are sent to each engine's API with **web search on**. The answers are then checked for:
- your brand,
- your competitors,
- your products,
- your site among the cited URLs.

Questions come from, in this order:
1. Your own prompts (audit form).
2. A brand question and a comparison question.
3. Your top **non-brand** Search Console queries.
4. Your largest collections.

| Setting | Effect |
|---|---|
| `OPENAI_API_KEY`, `OPENAI_MODEL` | ChatGPT through the OpenAI Responses API with the `web_search` tool (default model `gpt-6-astra`) |
| `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL` | Perplexity Agent API with `web_search`. Without a model, Perplexity's `fast` preset is used. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini `generateContent` with Google Search grounding (default `gemini-3.8-flash`) |
| `AI_PROBE_MAX_PROMPTS` | Questions per audit (default 8). API calls = questions × engines. |
| `AI_PROBE_CONCURRENCY` | Calls in flight at once (default 6) |

**Brand and competitors:** enter them in the audit form, under "Brand and AI search". Without a brand name, it's guessed from the domain, and the report says so.

**How the tab reads:**
- Every rate is shown as **x of n** answered questions.
- The full answers and their sources are kept in the report as evidence.
- API answers can differ from what people see in the consumer apps. They also vary between runs.

**Product recommendation frequency:** the share of shopping questions where an answer names one of the store's products (from its public product feed) or cites a product page.

**Time:** on Vercel live mode, questions that can't finish before the audit's time limit are marked "not sent". Lower `AI_PROBE_MAX_PROMPTS` if that happens.

## AI Overviews

Google has no AI Overview API, and Search Console mixes AI Overview data into normal web totals. So a SERP data provider fetches the results pages instead.

| Setting | Effect |
|---|---|
| `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | DataForSEO API credentials (dashboard → API Access) |
| `AIO_MAX_KEYWORDS` | Keywords per audit (default 10) |
| `AIO_LOCATION_CODE` | Google location (default: from the domain's country, otherwise 2840 = United States) |
| `AIO_LANGUAGE`, `AIO_DEVICE` | Default `en` and `desktop` |

- **Keywords:** your top non-brand Search Console queries first, then collection names.
- **Per keyword:**
  - whether an AI Overview appears
  - whether it cites your site
  - which of your competitor domains it cites
  - your best organic position on the same page

## Otterly

Reads an **existing** Otterly brand report. It doesn't create prompts or reports.

| Setting | Effect |
|---|---|
| `OTTERLY_API_KEY` | Key from app.otterly.ai → API keys |
| `OTTERLY_REPORTS` | Optional `store.com=<report id>`. Without it, the report whose brand domain matches the store is used. |
| `OTTERLY_COUNTRY`, `OTTERLY_DAYS` | Default `us` and 28 |

Shows Otterly's share of voice, brand coverage, mentions, competitor brands and most cited URLs, exactly as Otterly reports them. These are never mixed with our own AI checks.

## Screaming Frog

The **Screaming Frog import** tab reads an `Internal → All` CSV export **in your browser**; nothing is uploaded or saved.

**It summarises:**
- status codes
- non-indexable pages and the reasons
- missing or duplicate titles and meta descriptions, and long titles
- missing or multiple H1s
- canonicals that point elsewhere
- thin content and slow responses

## Looker Studio

1. In the **SEO & AI dashboard** tab, click **KPIs CSV**. You get one row per KPI, with its value, x/n, previous value, source, kind, date range and status.
2. Import it into a Google Sheet. Append each audit's CSV to keep a history, since the app itself stores nothing.
3. In Looker Studio, add the Sheet with the **Google Sheets** connector.

## Adding another source

1. `lib/engine/<source>/index.ts`: a config function (on when its key is set) and a `fetch…(host)` that returns typed data, or `undefined` when the source is off.
2. A field on `Run` in `lib/engine/integration-types.ts`.
3. A call in `lib/engine/integrations.ts` (stage 1, or stage 2 if it needs Search Console queries or catalog names) and an entry in `integrationsConfig()`.
4. A tab under `app/components/<source>/` and its line in `run-report.tsx`. Add KPI tiles in `lib/engine/kpis.ts`.
5. Mock answers in `scripts/mock-apis.mjs` (map the API host through `apiBase()` in `lib/engine/mock-apis.ts`).
