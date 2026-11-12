# Ahrefs integration

Set **one** Ahrefs key in `.env`, or in Vercel's environment variables. What the audit fetches and what the report shows depend on which key you set:

| Setting | Ahrefs account | Report shows | Cost |
|---|---|---|---|
| `AHREFS_FREE_API_KEY` | Free | **Authority** tab with Domain Rating | Free |
| `AHREFS_PAID_API_KEY` | Plan with API access (Lite or higher) | **Search & Authority** tab: Domain Rating, live backlinks and referring domains, organic traffic and keywords, top 10 pages, top 20 keywords | 4 requests per audit, at least 50 API units each |
| neither | — | No Ahrefs tab, and no Ahrefs requests are made | — |

If both keys are set, the paid key is used. When an Ahrefs key is configured, the home page shows which data will be added. Create keys in your Ahrefs account under **Account settings → API keys**.

## Code structure

```
lib/engine/ahrefs/
  config.ts   which key is set → plan 'off' | 'free' | 'paid'
  client.ts   one Ahrefs API v3 request: auth, timeout, error messages
  free.ts     Domain Rating (/v3/public/domain-rating-free)
  paid.ts     Site Explorer: backlinks-stats, metrics, top-pages, organic-keywords
  index.ts    fetchAhrefs(host): runs free.ts, plus paid.ts on the paid plan
app/components/ahrefs/
  index.tsx          the tab; picks its sections by the plan the audit ran with
  domain-rating.tsx  free section
  site-explorer.tsx  paid section
  shared.tsx         stat card and number formatting
```

The pipeline calls `fetchAhrefs` in parallel with the other checks (`lib/engine/pipeline.ts`, "2f"). The result is stored as `run.ahrefs`, together with the plan it ran with.

## Behaviour

- **Values:** shown exactly as Ahrefs returned them, with the date fetched. A missing value shows as "—", never 0.
- **Credit:** the report credits "Domain Rating by Ahrefs", as Ahrefs requires.
- **Not scored:** Ahrefs data doesn't change the audit score.
- **Keys stay private:** read on the server only, never stored, never sent to the browser. The browser only learns the plan name.
- **Rejected key** (HTTP 401): the report says so, and paid requests are skipped.
- **Paid key without API access** (HTTP 401, 402 or 403 on the first Site Explorer request): the report shows Ahrefs' reason, and the other 3 requests are skipped.

## Tested

- **Real Ahrefs API, invalid key:** HTTP 401 → "Ahrefs rejected the API key".
- **Mocked responses**, using the shapes in Ahrefs' docs: free plan, paid plan, and a paid key without API access.
- **Not tested with a real valid key.** Run one audit after adding yours to confirm.
