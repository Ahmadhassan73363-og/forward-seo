# User Story Audit

The build tested against [USER_STORIES.md](USER_STORIES.md).

- **First audit (2026-11-11):** 16 flaws found.
- **Re-test after fixes (same day):** all 16 fixed and verified. Two further honesty problems were found and fixed during the re-test.

## Re-test result

| Story | Before | After | Evidence (re-test) |
|---|---|---|---|
| US-01 Start an audit | ⚠️ | ✅ | `ftp://store.com` → 400 “Only http and https…”. `store` → 400 “not a full domain name”. example.com → identified as “Unknown platform”, Shopify modules marked Not applicable. |
| US-02 Progress & cancel | ⚠️ | ✅ | Simulated stalled PageSpeed body → test fails with a retryable error instead of crashing the run. Each pipeline part is isolated, so an error becomes a warning and results are kept. |
| US-03 Coverage | ✅ | ✅ | Generic sitemap discovery added for other platforms (`sitemap_index.xml`, `wp-sitemap.xml`). Non-HTML URLs are excluded, not scored. |
| US-04 Real Google data | ✅ | ✅ | A Lighthouse report with no scores is now a failed test, not an empty “success”. |
| US-05 Catalog without credentials | ⚠️ | ✅ | Real totals shown: 331 thin descriptions, 399 empty collections, 856 collections without description (was “300+”). |
| US-06 Actionable findings | ✅ | ✅ | 0 findings with duplicated text on allbirds, nextjs.org and wordpress.org (previously 17 on allbirds). |
| US-07 Honest scores | ⚠️ | ✅ | “Not applicable” vs “Not scored” with reasons. List shows “Incomplete” without a number. International is no longer a free 100 on single-language sites. |
| US-08 App cost | ✅ | ✅ | — |
| US-09 Browser checks | ✅ | ✅ | Browser requests to private addresses are blocked too. |
| US-10 Cart & checkout | ⏸️ | ⏸️ | Still needs a store you own. Now skipped with a message on non-Shopify sites. |
| US-11 Owner mode | ⏸️ | ⏸️ | Bad token → clear message ✅. Skipped on non-Shopify sites. Real token still untested. |
| US-12 Compare | ⚠️ | ✅ | The allbirds pair that gave a false alert → `regression: false`, with the note “New data sources this run (crux, catalog): their issues are not counted as new.” |
| US-13 Monitoring | ⚠️ | ✅ | `https://localhost.attacker.example` accepted (public host); private IP/http rejected; webhook hosts resolved before sending. First-run timing explained in the UI. |
| US-14 Benchmark | ✅ | ✅ | Invalid competitors now reported back (`skippedCompetitors`). |
| US-15 Export | ✅ | ✅ | CSV has UTF-8 BOM, CRLF and formula-injection guard. |
| US-16 History | ✅ | ✅ | Platform shown per run. |
| US-17 Secrets | ✅ | ✅ | Fake key/token still absent from every API response and from `.data`. |
| US-18 Safe to expose | ❌ | ✅ | See F1, F2 and F8 below. |
| US-19 Restarts | ⚠️ | ✅ | Interrupted run without per-run secrets → re-queued and completed. Run with a per-run key → failed with the reason. |
| US-20 Usable UI | ✅ | ✅ | — |

**Automated story tests:** 25 pass, 2 flagged. Both flags were test-expectation issues, not product flaws, and were verified separately:
- **Anonymous list on localhost:** allowed by design. A non-localhost `Host` gets 401 until `APP_PASSWORD` is set.
- **example.com:** the "Shopify words" check matched “Referrer-**Policy**”. That check did expose the broken-summary bug (N1 below), which is now fixed.

## Flaws and how each was fixed

| # | Flaw | Fix | Verified by |
|---|---|---|---|
| F1 | SSRF: audits fetched internal addresses | `lib/engine/net-guard.ts`: DNS-resolve and refuse loopback, private, CGNAT, link-local/metadata, ULA and multicast. Checked on submit, on every crawler/feed request, on **every redirect hop**, and for every request the browser makes. Ports kept. | `127.0.0.1`, `[::1]`, `169.254.169.254`, `localtest.me` (resolves to 127.0.0.1) → 400. Public URL redirecting to the metadata IP refused before the request (1 request made). 10/10 IP classification cases. |
| F2 | No login; cross-site requests accepted | `middleware.ts`: Basic auth when `APP_PASSWORD` is set, otherwise localhost only. State-changing API calls must be `application/json` from the same origin. | `text/plain` POST → 415. Foreign `Origin` → 403. Non-localhost Host → 401. |
| F3 | One stalled PageSpeed reply failed the whole audit | Body read and normalisation inside try/catch. Every pipeline part wrapped so errors become warnings. CrUX errors caught. | Unit test with a stalled body → `ok:false, retryable`. Malformed report → failed test. |
| F4 | Non-Shopify sites graded as Shopify stores | `lib/engine/platform.ts` detects Shopify, headless Shopify, WordPress, WooCommerce, Wix, Squarespace, Webflow, BigCommerce, Magento, Next.js, Nuxt, Gatsby, React, from evidence only. Non-Shopify sites skip the catalog feed, theme/owner mode, policies, `/search`, cart flow and Shopify URL rules. Shopify modules → “Not applicable”. Fix guides use platform-neutral steps (no theme.liquid, Liquid or admin links). Password-protected Shopify stores stop with a clear message. | 9 real sites detected correctly (incl. gymshark.com as headless Next.js + Shopify assets). nextjs.org and wordpress.org audits: 0 Shopify-worded findings, Shopify modules Not applicable. |
| F5 | False regression alerts | A finding counts as new/resolved only if all its sources ran in both audits. Overall drop counts only when the same modules were scored. Notes explain what was excluded. | The original false-alert pair → no regression. |
| F6 | Pages tab hid crawl results and blocked pages | URLs matched by normalised form. Pages still blocked are recorded as 429 rows (excluded from checks). | allbirds homepage HTML column shows 200. |
| F7 | Restart lost audits | Interrupted runs without per-run secrets are restarted once. Runs with per-run secrets fail with an explicit reason. | Isolated recovery test, both cases. |
| F8 | Unlimited queueing | `MAX_PENDING_RUNS` (default 12, server-wide) and `RUNS_PER_HOUR` (default 30 per client, competitors included) → HTTP 429 with a message. | Code path; competitor cap of 5 still enforced. |
| F9 | Catalog counts capped at 300 | Real totals stored separately from the capped lists, used in findings, scoring and the Catalog tab. | allbirds: 331 / 399 / 856. |
| F10 | `ftp://` and bare words accepted | `parseStoreUrl`: http(s) only, real hostname, no embedded credentials. | 400 for both. |
| F11 | List showed a number for incomplete runs | Shows “Incomplete” only. | Home page list. |
| F12 | “N/A” next to an issue count | Module shows “Not scored: <reason>. Issues found on other pages are still listed” or “Not applicable: <reason>”. | Report modules. |
| F13 | Webhook check rejected `localhost.`-prefixed public hosts | Exact host and IP checks, plus DNS resolution before sending. | 201 for the public look-alike, 400 for private. |
| F14 | CSV garbled in Excel | UTF-8 BOM, CRLF line endings, formula-injection prefix. | Code review (Excel not opened). |
| F15 | Anonymous callers saw server config | Covered by F2: no anonymous access off localhost. | Non-localhost Host → 401. |
| F16 | Schedule starts a run immediately, unexplained | Form says “The first audit starts within a minute…”. | UI text. |

## Problems found while re-testing (also fixed)

| # | Problem | Fix |
|---|---|---|
| N1 | Platform-neutral fix summaries could become broken fragments (“controls most response headers…”) | Hand-written neutral guides for the 11 rules that can fire on any site. Shopify-worded summaries are dropped, not edited. 0 rules left with Shopify wording or placeholder steps among those that can fire on non-Shopify sites. |
| N2 | wordpress.org detected as WooCommerce (the word appears in page text) | WooCommerce now requires its plugin asset path or body class. |
| N3 | A Lighthouse report without scores counted as a successful test | Now a failed, retryable test. |
| N4 | Duplicated text: description = fix summary (17 findings), evidence labels repeating the selector, merged findings repeating sentences, catalog descriptions repeating the title | Description = what was measured (Lighthouse's own text, axe rule, real counts). Fix summary hidden if identical. Evidence fields that repeat another field removed. Merges keep one description and add only new sentences. |
| N5 | “International 100” on single-language sites, where nothing was checked | Marked Not applicable unless the site has hreflang tags. |

## Not verified

- **`next build`:** not run, because your `next dev` server is using the same `.next` folder and a build would break it. `tsc --noEmit` passes, and every changed page and route was exercised on the dev server.
- **Cart flow and owner mode with a real token:** still need your own store and token.
- **CSV in Excel:** not opened; verified from code only.
