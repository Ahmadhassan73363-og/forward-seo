# Deploying on Vercel (live mode)

On Vercel the tool runs in **live mode** (detected from Vercel's `VERCEL=1` variable, or forced locally with `STORAGE=none`):

- "Run audit" opens `/live`, which streams the audit from `POST /api/audit` while the tab is open.
- **Nothing is saved.** The report exists only in that tab. Reloading or closing it discards the report, and the page asks before you leave a running audit. Use **JSON** or **Print / PDF** to keep a copy.
- Closing the tab stops the audit on the server.

## Settings

Under **Vercel → Project → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `APP_PASSWORD` | Required. Without it every request gets "only answers on localhost". |
| `APP_USER` | Optional sign-in name. |
| `PSI_API_KEY` | Google key with the PageSpeed Insights API and Chrome UX Report API enabled. |
| `AHREFS_FREE_API_KEY` or `AHREFS_PAID_API_KEY` | Optional. Adds Ahrefs data to the report ([AHREFS.md](AHREFS.md)). |
| `AUDIT_TIME_BUDGET_SECONDS` | Optional, default 230. Must stay below the function limit. |
| `LIVE_MAX_PAGES` | Optional, default 30. |

**Function duration:** `/api/audit` asks for 300 s (`maxDuration`). This needs **Fluid compute**, which is on by default for new projects: **Settings → Functions**. Without it, Hobby functions stop at 60 s. In that case set `AUDIT_TIME_BUDGET_SECONDS=45` and audit only a few pages.

**Redeploy** after changing variables.

## What to expect

- Each PageSpeed test takes 15–60 s at Google, and 8 run at a time. About 10 pages on mobile and desktop fit in the time budget.
- Tests that hadn't started at the time limit are listed as "Not run". Tests still running at Google are listed as "Not finished". The report says so at the top, and these are never counted as passes.
- Browser tests and the cart flow need Chrome, which Vercel doesn't have, so the report says they were skipped.
- Not available in live mode, because they need stored audits:
  - audit history
  - comparison with the last audit
  - scheduled monitoring and alerts
  - competitor benchmarks

For those features, host on a long-running Node server with a disk (Railway, Render, Fly, a VPS) and run `npm run build && npm start`.

## Verified

Tested locally with `STORAGE=none` and the production build:
- allbirds.com streamed to completion (80 progress updates, then the full report, about 1.5 MB).
- Nothing was written to `.data`.
- Screenshots arrive inline.
- The time-limit labels are correct.
- Reloading `/live` shows "No audit is running" and doesn't start a second audit.

Not yet tested on Vercel itself.
