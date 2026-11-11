import { checkPublicUrl, parseStoreUrl } from './net-guard';

/* Input vetting and per-client rate limiting shared by the audit-starting API routes. */

const RUNS_PER_HOUR = Math.max(1, Number(process.env.RUNS_PER_HOUR) || 30); // per client IP, competitors included

const g = globalThis as unknown as { __runRate?: Map<string, number[]> };
const rate = (g.__runRate ||= new Map<string, number[]>());

export function clientIp(req: Request) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}

/** Store address → trimmed input, or a user-facing error. Refuses other schemes and private/local targets. */
export async function vetUrl(raw: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const p = parseStoreUrl(raw);
  if (p.ok === false) return p;
  const pub = await checkPublicUrl(p.url.toString());
  if (pub.ok === false) return pub;
  return { ok: true, url: String(raw).trim() };
}

/**
 * Reserves `needed` audits from the client's hourly budget; returns an error message when exhausted.
 * The budget is held in this server instance's memory (per instance on serverless hosts).
 */
export function takeRunBudget(req: Request, needed: number): string | null {
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (rate.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length + needed > RUNS_PER_HOUR) return `Hourly limit reached (${RUNS_PER_HOUR} audits per hour). Try again later.`;
  rate.set(ip, [...recent, ...Array<number>(needed).fill(now)]);
  return null;
}
