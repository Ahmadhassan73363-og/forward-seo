import { envFlag, envInt, googleAccount, type GoogleCredentials } from '../google/config';

/*
 * Google Search Console. Uses the shared Google service account (lib/engine/google/config.ts):
 *
 *   GOOGLE_SERVICE_ACCOUNT_JSON / _FILE   the key (GSC_SERVICE_ACCOUNT_* still work)
 *   GSC_ENABLED                           default true when a key is set
 *   GSC_DAYS                              days of search data (default 28)
 *   GSC_ROWS                              top queries / pages to fetch (default 25)
 *   GSC_INSPECT_URLS                      URLs to run through URL Inspection (default 5, 0 = off)
 *
 * Search Console only returns data for properties the service account was added to.
 */

export type GscCredentials = GoogleCredentials;

export type GscConfig =
  | { enabled: false }
  | { enabled: true; credentials?: GscCredentials; error?: string; email?: string; days: number; rows: number; inspect: number };

export function gscConfig(): GscConfig {
  const acct = googleAccount();
  if (acct.configured === false || !envFlag('GSC_ENABLED', true)) return { enabled: false };
  return {
    enabled: true,
    credentials: acct.credentials,
    error: acct.error,
    email: acct.email,
    days: envInt('GSC_DAYS', 28, 7, 480),
    rows: envInt('GSC_ROWS', 25, 1, 1000),
    inspect: envInt('GSC_INSPECT_URLS', 5, 0, 50),
  };
}
