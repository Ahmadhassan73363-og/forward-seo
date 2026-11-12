import { load } from 'cheerio';
import { errMsg, fetchWithTimeout, isBotChallenge } from '@/lib/audit/core';
import { typeForPath } from '@/lib/audit/discover';
import { clientIp } from '@/lib/engine/request-guard';
import { checkPublicUrl, parseStoreUrl } from '@/lib/engine/net-guard';
import { scanSchema } from '@/lib/engine/schema/extract';

/*
 * Structured data test for one URL (the "Test a URL" box on the Schema tab).
 *   POST { url } → { url, finalUrl, status, type, schema } or { error }
 * Fetches the server HTML once, like the audit crawler. Nothing is stored.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PER_HOUR = Math.max(1, Number(process.env.SCHEMA_TESTS_PER_HOUR) || 120);
const MAX_BYTES = 6 * 1024 * 1024;
const g = globalThis as unknown as { __schemaRate?: Map<string, number[]> };
const rate = (g.__schemaRate ||= new Map<string, number[]>());

const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const p = parseStoreUrl(String(body?.url || ''));
  if (p.ok === false) return json({ error: p.error }, 400);
  const pub = await checkPublicUrl(p.url.toString());
  if (pub.ok === false) return json({ error: pub.error }, 400);

  const ip = clientIp(req);
  const now = Date.now();
  const recent = (rate.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= PER_HOUR) return json({ error: `Hourly limit reached (${PER_HOUR} URL tests per hour).` }, 429);
  rate.set(ip, [...recent, now]);

  const url = p.url.toString();
  try {
    const res = await fetchWithTimeout(url, 15_000);
    const buf = await res.arrayBuffer();
    const html = new TextDecoder().decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf);
    if (res.status === 429) return json({ error: `The site rate-limited this server (HTTP 429${res.headers.get('retry-after') ? `, retry after ${res.headers.get('retry-after')} s` : ''}). Try again later.` }, 502);
    if (isBotChallenge(res.status, html)) return json({ error: `The site answered with a bot check (HTTP ${res.status}); its HTML could not be read.` }, 502);
    if (res.status >= 400) return json({ error: `The page returned HTTP ${res.status}.` }, 502);
    const finalUrl = res.url || url;
    return json({ url, finalUrl, status: res.status, type: typeForPath(finalUrl), schema: scanSchema(load(html)), truncated: buf.byteLength > MAX_BYTES || undefined });
  } catch (e: any) {
    return json({ error: `Could not fetch the page: ${errMsg(e)}` }, 502);
  }
}
