/*
 * Low-level Semrush requests (https://developer.semrush.com/api/).
 *   SEO API v3 reports: GET https://api.semrush.com/?type=…&key=…  → semicolon-separated CSV with a
 *     header row; errors are plain text "ERROR <code> :: <message>".
 *   Backlinks API v4:   GET https://api.semrush.com/apis/v4/backlinks/v1/… with "Authorization: Apikey"
 *     → JSON { meta, data } or { meta, error }.
 */

import { apiBase } from '../mock-apis';

const TIMEOUT_MS = 25_000;

export type CsvResult = { ok: true; rows: Record<string, string>[] } | { ok: false; code?: number; message: string; fatal: boolean };

/** Errors that mean the key can't be used at all, so further requests are pointless. */
const FATAL_CODES = new Set([120, 131, 132, 133, 134, 135]); // wrong key, limits, zero balance, report type disabled

async function get(url: string, headers: Record<string, string> = {}): Promise<{ ok: true; res: Response; text: string } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { ok: true, res, text: await res.text() };
  } catch (e: any) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return { ok: false, message: timeout ? `no answer within ${TIMEOUT_MS / 1000}s` : `request failed: ${e?.message || e}` };
  }
}

/**
 * One SEO API v3 report. Rows are keyed by the requested export column codes (Ph, Po, …), in the
 * order requested. "Nothing found" is an empty result, not an error.
 */
export async function semrushReport(params: Record<string, string>, columns: string[], key: string): Promise<CsvResult> {
  const url = `${apiBase('https://api.semrush.com', 'semrush')}/?${new URLSearchParams({ ...params, export_columns: columns.join(','), key })}`;
  const r = await get(url);
  if (r.ok === false) return { ok: false, message: r.message, fatal: false };
  const text = r.text.trim();
  const err = text.match(/^ERROR\s+(\d+)\s*::\s*(.*)$/m);
  if (err) {
    const code = Number(err[1]);
    if (code === 50) return { ok: true, rows: [] }; // NOTHING FOUND
    return { ok: false, code, message: `Semrush error ${code}: ${err[2].trim()}`, fatal: FATAL_CODES.has(code) };
  }
  if (!r.res.ok) return { ok: false, message: `HTTP ${r.res.status}: ${text.slice(0, 160)}`, fatal: r.res.status === 401 || r.res.status === 403 };
  const lines = text.split(/\r?\n/).filter(Boolean);
  const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, '$1');
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(';');
    const row: Record<string, string> = {};
    columns.forEach((c, i) => (row[c] = unquote(cells[i] ?? '')));
    return row;
  });
  return { ok: true, rows };
}

/** One Backlinks API v4 request (JSON). */
export async function semrushV4(path: string, params: Record<string, string>, key: string): Promise<{ ok: true; data: any } | { ok: false; message: string; fatal: boolean }> {
  const r = await get(`${apiBase('https://api.semrush.com', 'semrush')}/apis/v4${path}?${new URLSearchParams(params)}`, { Authorization: `Apikey ${key}`, Accept: 'application/json' });
  if (r.ok === false) return { ok: false, message: r.message, fatal: false };
  let body: any = null;
  try {
    body = JSON.parse(r.text);
  } catch {}
  if (!r.res.ok || body?.meta?.success === false || body?.error) {
    const status = body?.meta?.status_code || body?.error?.code || r.res.status;
    return { ok: false, message: `HTTP ${status}: ${body?.error?.message || r.text.slice(0, 160)}`, fatal: status === 401 || status === 403 };
  }
  return body?.data ? { ok: true, data: body.data } : { ok: false, message: 'unreadable response', fatal: false };
}

/** Remaining API units (free request). Undefined when Semrush doesn't answer with a number. */
export async function semrushUnitsLeft(key: string): Promise<number | undefined> {
  const r = await get(`${apiBase('https://www.semrush.com', 'semrush-www')}/users/countapiunits.html?${new URLSearchParams({ key })}`);
  if (r.ok === false || !r.res.ok) return undefined;
  const n = Number(r.text.trim().replace(/,/g, ''));
  return Number.isFinite(n) && /^\s*[\d,]+\s*$/.test(r.text) ? n : undefined;
}

/** A number from a CSV cell, or undefined (never 0 for a missing value). */
export const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
