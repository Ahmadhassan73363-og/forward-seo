/* Low-level Ahrefs API v3 request (https://docs.ahrefs.com/en/api). */

import { apiBase } from '../mock-apis';

const API = () => apiBase('https://api.ahrefs.com/v3', 'ahrefs/v3');
const TIMEOUT_MS = 25_000;

export type AhrefsResponse = { ok: true; data: any } | { ok: false; status: number; message: string };

export async function ahrefsGet(path: string, params: Record<string, string>, key: string): Promise<AhrefsResponse> {
  const url = `${API()}${path}?${new URLSearchParams({ output: 'json', ...params })}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e: any) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return { ok: false, status: 0, message: timeout ? `no answer within ${TIMEOUT_MS / 1000}s` : `request failed: ${e?.message || e}` };
  }
  const text = await res.text().catch(() => '');
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    // Ahrefs errors come as {"error": "..."} or as ["Error", "<reason>"].
    const detail =
      (typeof data?.error === 'string' && data.error) ||
      (typeof data?.message === 'string' && data.message) ||
      (Array.isArray(data) && data.filter((x) => typeof x === 'string' && x !== 'Error').join(': ')) ||
      text.slice(0, 200) ||
      res.statusText;
    return { ok: false, status: res.status, message: `HTTP ${res.status}: ${String(detail).slice(0, 200)}` };
  }
  if (!data) return { ok: false, status: res.status, message: 'unreadable response' };
  return { ok: true, data };
}

/** A finite number from the response, or undefined. Missing values are never replaced with 0. */
export const num = (v: any): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** The key or plan can't use the endpoint, as opposed to a temporary failure. */
export const isRefused = (r: AhrefsResponse) => r.ok === false && [401, 402, 403].includes(r.status);
