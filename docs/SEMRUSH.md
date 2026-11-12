# Semrush integration

**Semrush has no free API.** You need the SEO Toolkit **Business** plan, plus API units, which are bought separately under Subscription info → API units. So there is a single key, unlike Ahrefs, which has a free tier.

| Setting | Effect |
|---|---|
| `SEMRUSH_API_KEY` | Adds a **Semrush** tab to every new audit. When it isn't set, no Semrush requests are made and there's no tab. Get the key at semrush.com → Subscription info → API (`/accounts/api-keys/active`). |
| `SEMRUSH_DATABASE` | The country whose Google results the keyword data comes from, e.g. `us`, `uk`, `de`, `pk`. When empty, it's taken from the domain (`.de` → de, `.co.uk` → uk, `.com.au` → au), otherwise `us`. The report says which database was used and why. |
| `SEMRUSH_KEYWORDS` / `SEMRUSH_PAGES` | Rows to fetch (default 20 / 10). |

The key is read on the server only, and never stored or sent to the browser. When it's set, the home page shows that Semrush data will be added.

## What each audit fetches

| Request | Data | Units |
|---|---|---|
| `domain_rank` (SEO API v3) | Organic keywords, organic traffic, traffic value, Semrush rank | 10 |
| `domain_organic` | Keywords bringing the most traffic: position, volume, traffic share, ranking page | 10 per row |
| `domain_organic_unique` | Top pages by organic traffic | 10 per row |
| Backlinks overview (API v4, Early Access) | Authority Score, backlinks, referring domains | 45 |
| Units balance | API units left, shown in the report | free |

With the defaults that's about **355 units per audit**.

## Behaviour

- **Values:** shown exactly as Semrush returned them, with the date fetched. A missing value shows as "—", never 0.
- **Not scored:** Semrush data doesn't change the audit score.
- **Wrong key** (`ERROR 120`), **empty units balance** (`ERROR 132`) or other key-level errors: the first request fails, the rest are skipped, and the tab shows Semrush's message.
- **Domain not in Semrush's database** (`ERROR 50 :: NOTHING FOUND`): the tab says so and suggests `SEMRUSH_DATABASE`. The keyword and page requests are skipped, so no units are spent on them.
- **One request fails** (e.g. backlinks, which is Early Access): the other data is still shown, along with the failed request and its reason.

## Code structure

```
lib/engine/semrush/
  config.ts   key, database choice, row limits, units estimate
  client.ts   v3 CSV reports, v4 JSON requests, units balance, Semrush error codes
  index.ts    fetchSemrush(host): overview first, then keywords, pages and backlinks in parallel
app/components/semrush/index.tsx   the Semrush tab
```

The pipeline runs it in parallel with the other checks (`lib/engine/pipeline.ts`, "2g") and stores the result as `run.semrush`.

## Tested

- **Real Semrush API, invalid key:** gave `ERROR 120 :: WRONG KEY - ID PAIR` → "Check SEMRUSH_API_KEY", with no further requests.
- **Mocked responses**, in the formats from Semrush's docs:
  - full data
  - units balance zero (stops after 1 request)
  - nothing found
  - database choice from the domain
- **Report tab:** checked in the browser for partial data and for the zero-balance case.
- **Not tested with a real paid key.** Run one audit after adding yours to confirm.
