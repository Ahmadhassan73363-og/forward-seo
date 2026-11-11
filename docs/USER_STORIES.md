# Shopify Audit Tool — User Stories

Acceptance criteria (AC) are written to be testable. Results of testing the current build against
them are in [USER_STORY_AUDIT.md](USER_STORY_AUDIT.md).

**Personas**

| Persona | Who | Wants |
|---|---|---|
| **Merchant** | Owner or marketer of one Shopify store, not technical | To know what is wrong, how bad it is, and exactly what to change |
| **Agency** | Consultant or agency running audits for many client stores | Repeatable, comparable, shareable reports; monitoring; competitor context |
| **Operator** | Developer who hosts and maintains the tool | A tool that is safe to expose, predictable to run, and keeps secrets safe |

---

## A. Running an audit

**US-01 — Start an audit from a store address** (Merchant)
As a merchant I want to type my store address and start an audit, so that I don't need any setup.
- AC1 Accepts `store.com`, `https://store.com/any/path` and `store.myshopify.com`.
- AC2 An empty or malformed address is rejected immediately with a clear message, and no run is created.
- AC3 A site that is not a Shopify store is identified (with the evidence used), only general web checks run, and Shopify-specific modules, checks and fix steps (theme.liquid, catalog feed, policies, cart, Shopify admin links) are marked “Not applicable” instead of being shown.
- AC4 An unreachable domain fails quickly with a message that says the site could not be reached.
- AC5 Out-of-range options (pages ≤ 0, > 100, non-numeric; unknown strategies) are clamped or rejected, never crash the run.

**US-02 — Watch progress and stop an audit** (Merchant)
As a merchant I want to see what the audit is doing and cancel it, so that I'm not left waiting blind.
- AC1 Progress shows stage, PageSpeed tests done/total and pages crawled done/total.
- AC2 When Shopify makes the crawler wait, the report says so and shows when it resumes.
- AC3 Cancel works for queued and running audits; a cancelled run ends as `cancelled`.
- AC4 An audit finishes in bounded time even when Shopify keeps rate-limiting (no 15-minute hangs).

**US-03 — Cover the whole store, not one page** (Merchant)
As a merchant I want the audit to sample every kind of page, so that template problems on product or collection pages are found.
- AC1 The sample includes homepage, product, collection, content page and blog post when the store has them.
- AC2 The page limit I set is respected (± homepage).
- AC3 I can list my own URLs instead; URLs on another domain are skipped with a warning.
- AC4 The report states how many URLs were discovered and how many were audited.

## B. Results

**US-04 — Real Google speed data** (Merchant)
As a merchant I want the same numbers as pagespeed.web.dev for each page, so that I trust the report.
- AC1 Each audited page gets mobile and desktop Lighthouse scores and lab metrics from the PageSpeed API.
- AC2 Failed tests are shown as failed with the reason; no placeholder or estimated scores appear.
- AC3 Real-user Core Web Vitals (CrUX) are shown, or a clear reason they're unavailable.

**US-05 — Whole-catalog product checks without credentials** (Merchant)
As a merchant I want every product and collection checked, so that problems on unsampled products are found too.
- AC1 All published products and collections are read from the public feed, regardless of crawl rate limits.
- AC2 Checks that need data the feed lacks (alt text, SEO fields, barcodes) are not reported as passing.
- AC3 Catalog findings link to each affected product or collection.

**US-06 — Actionable findings** (Merchant)
As a merchant I want each problem explained with how to fix it, so that I or my developer can act.
- AC1 Every finding has a severity, a plain-language title and description, and fix steps.
- AC2 Every finding lists affected URLs, and affected ≤ checked.
- AC3 The same issue found by several sources (Lighthouse, crawl, browser) appears once.
- AC4 Findings are ordered by severity, then impact.
- AC5 Where a fix is done in Shopify admin, the finding links to the right admin page.

**US-07 — Honest scores** (Merchant)
As a merchant I want scores that reflect only what was measured, so that a missing test doesn't look like a pass.
- AC1 Modules that could not be measured show “Not scored”, not 100.
- AC2 If less than half the weighted modules were measured, the overall grade is “Incomplete”.
- AC3 Warnings explain every gap (blocked pages, failed tests, missing APIs).

**US-08 — See what apps cost me** (Merchant)
As a merchant I want to see which apps and third-party scripts slow my store, so that I know which to remove.
- AC1 Third parties are listed with category, main-thread time, transfer size and pages seen on.
- AC2 Expensive apps raise a finding that lists the pages they were found on.

**US-09 — Real-browser accessibility and rendering checks** (Merchant)
As a merchant I want accessibility tested in a real mobile browser, including the open menu, so that I find issues Lighthouse misses.
- AC1 axe WCAG 2.2 AA runs on representative pages and with the mobile menu open.
- AC2 Schema added only by JavaScript is reported.
- AC3 Console errors caused by the store are reported; errors caused by the audit itself (e.g. 429) are not blamed on the store.
- AC4 If no browser is installed, the report says browser tests were skipped.

**US-10 — Cart and checkout test** (Merchant)
As a merchant I want to know that customers can add to cart and reach checkout.
- AC1 Off by default; opt-in per run.
- AC2 Steps: open product → add to cart (verified) → open cart → reach checkout; stops before customer details.
- AC3 The cart is emptied afterwards.

**US-11 — Full catalog via my Admin API token** (Merchant)
As a merchant I want to connect my store read-only, so that SEO fields, alt text and barcodes are checked for every product.
- AC1 The token is used only if it belongs to the audited store.
- AC2 The token is never written to disk or returned by any API.
- AC3 A bad token produces a clear “owner mode failed” message; the rest of the audit still completes.

## C. Over time and across stores

**US-12 — Compare with my last audit** (Merchant)
- AC1 A completed run shows score changes and new/resolved issues versus the previous run of the same store.

**US-13 — Scheduled monitoring and alerts** (Agency)
- AC1 I can schedule a daily or weekly audit, pause it and delete it.
- AC2 A regression (overall −5, mobile performance −10, new high/critical issue) sends a webhook alert.
- AC3 Webhook URLs must be public https; they're masked when listed.

**US-14 — Competitor benchmark** (Agency)
- AC1 Up to 5 competitor stores are audited with the same checks and shown side by side.
- AC2 Invalid competitor entries are skipped, not fatal.
- AC3 My owner credentials are never used on competitor runs.

**US-15 — Share and export** (Agency)
- AC1 Report can be exported as CSV and JSON, and printed/saved as PDF.
- AC2 The report has a stable URL I can reopen later.

**US-16 — Manage report history** (Agency)
- AC1 Recent audits are listed newest first with grade and status.
- AC2 I can delete a finished audit; a running audit must be cancelled first.

## D. Operating the tool

**US-17 — Keep secrets secret** (Operator)
- AC1 API keys and Admin tokens supplied per run are never written to `.data` or returned by any endpoint.
- AC2 `.env` is git-ignored; `.env.example` contains no real secrets.

**US-18 — Safe to expose on a network** (Operator)
- AC1 Only authorised users can start, cancel or delete audits and schedules.
- AC2 The server refuses to fetch internal addresses (localhost, private ranges, cloud metadata).
- AC3 Run IDs and file names can't be used for path traversal.
- AC4 One user can't exhaust the server or the Google quota (rate/queue limits).

**US-19 — Survive restarts** (Operator)
- AC1 Runs interrupted by a restart are marked failed with a clear message, not left “running” forever.
- AC2 Schedules survive restarts.

**US-20 — Usable interface** (Merchant)
- AC1 The tool works at phone width without horizontal scrolling.
- AC2 Form controls have labels; status isn't conveyed by colour alone.
