/*
 * One JSON-over-HTTP request with a timeout, shared by every third-party connector.
 * Never throws: network failures and timeouts come back as { ok: false, message }.
 */

export type HttpResult = { ok: true; res: Response; body: any; text: string } | { ok: false; message: string };

export async function httpRequest(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; json?: unknown; form?: URLSearchParams; timeoutMs?: number } = {},
): Promise<HttpResult> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = opts.form;
  }
  try {
    const res = await fetch(url, { method: opts.method || (body ? 'POST' : 'GET'), headers, body, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {}
    return { ok: true, res, body: parsed, text };
  } catch (e: any) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return { ok: false, message: timeout ? `no answer within ${Math.round(timeoutMs / 1000)}s` : `request failed: ${e?.message || e}` };
  }
}

/** A number from an API response (number or numeric string), or undefined — never 0 for a missing value. */
export const toNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined;

/** Run async jobs with at most `limit` in flight; results keep the input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/** "a.com=1, b.com=2" → Map(a.com → 1). Used for per-store overrides such as GA4_PROPERTIES. */
export function parseDomainMap(v: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of (v || '').split(',')) {
    const [d, id] = part.split('=').map((s) => s?.trim());
    if (d && id) m.set(d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''), id);
  }
  return m;
}

/** Same site? Compares hosts ignoring "www." (a.com ≈ www.a.com). */
export function sameSite(hostOrUrl: string, host: string): boolean {
  const h = (s: string) => {
    try {
      return (s.includes('://') ? new URL(s).hostname : s.replace(/\/.*$/, '')).toLowerCase().replace(/^www\./, '');
    } catch {
      return '';
    }
  };
  const a = h(hostOrUrl);
  return !!a && a === h(host);
}
