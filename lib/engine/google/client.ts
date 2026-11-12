import { createSign } from 'crypto';
import type { GoogleCredentials } from './config';
import { apiBase } from '../mock-apis';
import { httpRequest } from '../http';

/*
 * Google service-account sign-in (JWT RS256 → OAuth access token) and one authorised request.
 * Shared by Search Console, GA4 and Merchant Center. Google errors look like
 * { error: { code, message, status } }.
 */

export const SCOPES = {
  searchConsole: 'https://www.googleapis.com/auth/webmasters.readonly',
  analytics: 'https://www.googleapis.com/auth/analytics.readonly',
  merchant: 'https://www.googleapis.com/auth/content',
};

/** Base URL of a Google API host (or the local mock server's path for it in development). */
export const googleBase = (host: string) => apiBase(`https://${host}`, `google/${host}`);

export type GoogleResult<T = any> = { ok: true; data: T } | { ok: false; status?: number; message: string };

const tokens = new Map<string, { token: string; expires: number }>();
const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** An access token for the service account and scope (cached until shortly before it expires). */
export async function googleToken(c: GoogleCredentials, scope: string): Promise<GoogleResult<string>> {
  const cacheKey = `${c.email} ${scope}`;
  const cached = tokens.get(cacheKey);
  if (cached && cached.expires > Date.now() + 60_000) return { ok: true, data: cached.token };
  const tokenUrl = `${googleBase('oauth2.googleapis.com')}/token`;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: c.email, scope, aud: tokenUrl, iat: now, exp: now + 3600 }))}`;
  let signature: string;
  try {
    signature = createSign('RSA-SHA256').update(unsigned).sign(c.privateKey).toString('base64url');
  } catch {
    return { ok: false, message: 'the private key in the service account JSON could not be used' };
  }
  const r = await httpRequest(tokenUrl, { form: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) });
  if (r.ok === false) return { ok: false, message: `Google sign-in ${r.message}` };
  if (!r.res.ok || !r.body?.access_token) {
    const why = r.body?.error_description || r.body?.error || `HTTP ${r.res.status}`;
    return { ok: false, status: r.res.status, message: `Google refused the service account (${why}). The key may have been deleted or disabled in Google Cloud.` };
  }
  tokens.set(cacheKey, { token: r.body.access_token, expires: Date.now() + (Number(r.body.expires_in) || 3600) * 1000 });
  return { ok: true, data: r.body.access_token };
}

/** One authorised Google API request (GET, or POST when a body is given). */
export async function googleRequest<T = any>(url: string, token: string, body?: unknown, apiName = 'API'): Promise<GoogleResult<T>> {
  const r = await httpRequest(url, { headers: { Authorization: `Bearer ${token}` }, json: body });
  if (r.ok === false) return { ok: false, message: r.message };
  if (!r.res.ok) {
    const msg: string = r.body?.error?.message || r.text.slice(0, 200) || 'no details';
    const hint = /has not been used in project|is disabled/i.test(msg) ? ` Enable the "${apiName}" in the service account's Google Cloud project.` : '';
    return { ok: false, status: r.res.status, message: `HTTP ${r.res.status}: ${msg}${hint}` };
  }
  return { ok: true, data: r.body as T };
}

/** True for "this account can't see that resource" answers. */
export const isAccessDenied = (r: GoogleResult) => r.ok === false && (r.status === 403 || r.status === 404);
