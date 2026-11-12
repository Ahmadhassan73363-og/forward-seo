import { readFileSync } from 'fs';

/*
 * One Google Cloud service account for every Google source (Search Console, GA4, Merchant Center).
 *
 *   GOOGLE_SERVICE_ACCOUNT_JSON   the JSON key itself, or base64 of it   (alias: GSC_SERVICE_ACCOUNT_JSON)
 *   GOOGLE_SERVICE_ACCOUNT_FILE   or a path to the JSON key file          (alias: GSC_SERVICE_ACCOUNT_FILE)
 *
 * Each store owner adds the account's email to the products they want audited:
 * Search Console (Users and permissions), GA4 (Viewer), Merchant Center (read access).
 * The key never leaves the server; only the email is shown (it's needed for that step).
 */

export type GoogleCredentials = { email: string; privateKey: string };
export type GoogleAccount = { configured: false } | { configured: true; credentials?: GoogleCredentials; email?: string; error?: string };

function readKeyText(): { text?: string; error?: string } | null {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GSC_SERVICE_ACCOUNT_JSON)?.trim();
  const file = (process.env.GOOGLE_SERVICE_ACCOUNT_FILE || process.env.GSC_SERVICE_ACCOUNT_FILE)?.trim();
  if (raw) {
    if (raw.startsWith('{')) return { text: raw };
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    return decoded.trim().startsWith('{') ? { text: decoded } : { error: 'GOOGLE_SERVICE_ACCOUNT_JSON is neither JSON nor base64 of JSON' };
  }
  if (file) {
    try {
      return { text: readFileSync(file, 'utf8') };
    } catch (e: any) {
      return { error: `GOOGLE_SERVICE_ACCOUNT_FILE could not be read (${e?.code || 'error'})` };
    }
  }
  return null;
}

export function googleAccount(): GoogleAccount {
  const key = readKeyText();
  if (!key) return { configured: false };
  if (key.error) return { configured: true, error: key.error };
  let json: any;
  try {
    json = JSON.parse(key.text!);
  } catch {
    // Don't echo the parser message: it can quote part of the key.
    return { configured: true, error: 'the service account key is not valid JSON' };
  }
  const email = typeof json?.client_email === 'string' ? json.client_email : undefined;
  const privateKey = typeof json?.private_key === 'string' ? json.private_key.replace(/\\n/g, '\n') : undefined;
  if (json?.type !== 'service_account' || !email || !privateKey) {
    return { configured: true, email, error: 'the key is not a service account JSON key (it needs "type": "service_account", "client_email" and "private_key")' };
  }
  return { configured: true, credentials: { email, privateKey }, email };
}

/** A whole number from the environment, clamped. */
export const envInt = (name: string, def: number, min: number, max: number) => {
  const v = process.env[name];
  const n = v === undefined || v.trim() === '' ? def : Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : def;
};

/** true unless the variable is "false" / "0" / "off". */
export const envFlag = (name: string, def: boolean) => {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return def;
  return !['false', '0', 'off', 'no'].includes(v);
};
