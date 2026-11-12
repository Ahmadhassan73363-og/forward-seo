# Google Search Console integration

Search Console is **free**, but Google only shares a site's data with accounts the site owner has added. The app therefore uses a **Google Cloud service account**, which acts as a robot Google user:

1. You create the service account once.
2. Each store owner adds the service account's email to their Search Console property.
3. After that, every audit of that store gets a **Search Console** tab.

For a store that hasn't added the service account, the tab tells you which email to add. There's no way to read Search Console data for sites you don't have access to.

## Setup (once, about 10 minutes)

1. **Create a project.** In [Google Cloud Console](https://console.cloud.google.com/), create a project or pick one. You can use the same project as `PSI_API_KEY`.
2. **Enable the API.** Go to **APIs & Services → Library → "Google Search Console API" → Enable**.
3. **Create the service account.** Go to **IAM & Admin → Service accounts → Create service account**. Any name works, e.g. `shopify-audit`. It needs no roles; skip that step.
4. **Download its key.** Open the service account, then **Keys → Add key → Create new key → JSON**. A `.json` file downloads. Treat it like a password.
5. **Give the app the key.** Choose one:
   - **Vercel:** set `GOOGLE_SERVICE_ACCOUNT_JSON` to the file's whole content, or to its base64 (`base64 -w0 key.json`). Then redeploy.
   - **Local or self-hosted:** set `GOOGLE_SERVICE_ACCOUNT_FILE=C:\keys\gsc-key.json`. Keep the file **outside the project folder**. Names matching `*service-account*.json` and `gsc-key*.json` are git-ignored as a safety net.
6. **Grant access to each store.** Restart the app. The home page then shows *"Search Console connected … for stores that gave `xxx@yyy.iam.gserviceaccount.com` access"*. In [Search Console](https://search.google.com/search-console), the owner of each store opens **Settings → Users and permissions → Add user**, pastes that email, and chooses **Restricted** permission (read-only).

| Setting | Effect |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_SERVICE_ACCOUNT_FILE` (the older `GSC_SERVICE_ACCOUNT_*` names still work) | Adds a **Search Console** tab to every new audit. When neither is set, no requests are made and there's no tab. |
| `GSC_DAYS` | Days of search data (default 28). The previous period of the same length is fetched for comparison. |
| `GSC_ROWS` | Top queries and pages to fetch (default 25). |
| `GSC_INSPECT_URLS` | URLs run through URL Inspection: the homepage plus the pages with the most clicks (default 5, `0` = off). |

The key is read on the server only and is never stored or sent to the browser. The browser only receives the service account's email, because the store owner needs it for step 6.

## What the tab shows

| Section | Source |
|---|---|
| Clicks, impressions, average CTR and average position, with the change vs the previous period | Search Analytics |
| Clicks per day | Search Analytics, by date |
| **Index status** of the homepage and top pages: indexed or not, Google's coverage state ("Crawled – currently not indexed" and so on), last crawl, robots.txt block, a Google-chosen canonical that differs from the page's own, detected rich results and their issues, and a link to open the inspection in Search Console | URL Inspection API |
| Submitted sitemaps: when Google last read them, URLs submitted, errors, warnings. If none are submitted, the tab says so | Sitemaps API |
| Top queries and top pages | Search Analytics |
| Devices and countries | Search Analytics |

The data uses Google's *final* figures, so the period ends 3 days before the audit. Every request is free. URL Inspection is limited by Google to 2,000 URLs per property per day.

## Behaviour

- **Values:** exactly what Google returned. A missing value shows as "—". When Google returns no rows for the whole site, that is a real zero, and the tab shows 0 clicks.
- **Not scored:** Search Console data doesn't change the audit score.
- **Choosing the property:**
  1. A Domain property (`sc-domain:example.com`) is used first.
  2. Otherwise, a URL-prefix property for the exact host, with `https` preferred.
  3. Otherwise, the `www` / non-`www` variant.
- **No access to this store:** the tab names the email to add. This isn't a run warning, because it's expected for stores you don't manage.
- **Bad key** (invalid JSON, not a service account, key deleted in Google Cloud): the tab and the home page say what's wrong. The key's content is never echoed.
- **API not enabled:** Google's message is shown, along with how to enable the API.
- **One request fails:** the other data is still shown, along with the failed request and its reason.

## Code structure

```
lib/engine/gsc/
  config.ts   reads the service account key and limits
  client.ts   service-account sign-in (JWT → access token), one API request, Google error messages
  index.ts    fetchSearchConsole(host, homeUrl): find the property, then search data, sitemaps, URL Inspection
app/components/gsc/index.tsx   the Search Console tab
```

The pipeline runs it in parallel with the other checks (`lib/engine/pipeline.ts`, "2h") and stores the result as `run.searchConsole`.

## Tested

- **Real Google sign-in with a made-up service account:** Google answered "Invalid grant: account not found". The tab and the run warning show this, and the key is not echoed.
- **Key problems:** invalid JSON, a non-service-account JSON, base64 input and a missing key file each give a clear message. The JSON parser's text, which can quote the key, is never shown.
- **Mocked responses**, using the shapes in Google's API docs:
  - full data (12 requests)
  - no access to the property
  - API not enabled (shown once, with the fix)
  - one URL Inspection request failing while the rest of the data is kept
- **Property choice:** the Domain property is preferred, then `https`, then the `www` / non-`www` variant. Properties where the account is an unverified user are ignored.
- **Report tab:** checked in the browser, both with full data and with no access.
- **Not tested with a real service account that has access to a property.** Add yours and run one audit of a store it can read to confirm.
