# Testing every third-party tab with dummy data

`scripts/mock-apis.mjs` is a local stand-in for these services:
- Ahrefs and Semrush
- Google: Search Console, GA4, Merchant Center
- AI engines: OpenAI, Perplexity, Gemini
- DataForSEO and Otterly.AI

It answers with **dummy data** in each API's documented response format. The app's real request and parsing code runs unchanged; only the answering server is different. Use it to check that every tab and dashboard tile is created and filled without paid keys.

## Run it

Use two terminals in the project folder.

**1. Start the mock server.** Pass the store you'll audit. Google and Otterly grant access to that domain only.

```bash
node scripts/mock-apis.mjs allbirds.com
```

It prints every request it receives. On the first run it also writes a throwaway service account key to `.data/mock/gsc-service-account.json`.

**2. Start the app in development mode, pointed at the mock (Git Bash).**

```bash
MOCK_API_BASE=http://127.0.0.1:4010 AHREFS_PAID_API_KEY=mock-key SEMRUSH_API_KEY=mock-key GOOGLE_SERVICE_ACCOUNT_FILE=.data/mock/gsc-service-account.json GA4_ENABLED=true MERCHANT_ENABLED=true OPENAI_API_KEY=mock-key PERPLEXITY_API_KEY=mock-key GEMINI_API_KEY=mock-key DATAFORSEO_LOGIN=mock DATAFORSEO_PASSWORD=mock-key OTTERLY_API_KEY=mock-key npx next dev -p 3000
```

PowerShell: set each variable with `$env:NAME='value';` before `npx next dev -p 3000`.

**3. Run an audit** of the same store, in the browser or through the API. The mock AI answers mention the dummy competitors "Northwind Shoes" and "contoso.com", so enter those as competitors to see the share of voice.

```bash
curl -X POST http://localhost:3000/api/runs -H "Content-Type: application/json" -d "{\"url\":\"https://www.allbirds.com\",\"pages\":2,\"browserTests\":false,\"ai\":{\"brand\":\"Allbirds\",\"competitors\":\"Northwind Shoes, contoso.com\",\"prompts\":\"best sustainable sneakers for travel\"}}"
```

When it finishes, the report has these extra tabs: **SEO & AI dashboard**, **Search & Authority**, **Semrush**, **Search Console**, **GA4**, **Merchant Center**, **AI search** and **Screaming Frog import**. The run also shows a warning that third-party data is dummy.

## Variations

| Change | What you should see |
|---|---|
| `AHREFS_FREE_API_KEY=mock-key` instead of the paid key | **Authority** tab with Domain Rating only |
| Any key set to `bad-key` (for DataForSEO: `DATAFORSEO_LOGIN=bad-key`) | That source's "wrong key" message, and no data from it |
| Audit a different store than the one passed to the mock | Search Console, GA4, Merchant Center: "no access"; Otterly: "no brand report" |
| Leave a key unset | No tab for that source; dashboard tiles say "Not connected" |
| `GA4_ENABLED` / `MERCHANT_ENABLED` not set | No GA4 / Merchant Center tab |

## Safety

- `MOCK_API_BASE` is **ignored in production builds** (`next build` / `next start`, Vercel), so a real report can never contain the dummy data.
- It only accepts a `localhost` / `127.0.0.1` address, because API keys are sent with these requests.
- Use `127.0.0.1` rather than `localhost` on Windows, where `localhost` can resolve to IPv6 and miss the mock server.
- Delete `.data/mock/` whenever you like; the mock server recreates it.
