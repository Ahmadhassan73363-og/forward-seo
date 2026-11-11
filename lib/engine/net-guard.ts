import { promises as dns } from 'dns';
import net from 'net';

/*
 * Every audit fetches URLs chosen by the person submitting it. Without a guard the server could
 * be pointed at itself, the local network or cloud metadata (SSRF). All outbound requests to
 * audited sites go through `assertPublicUrl` / `guardedFetch`, which resolve the host and refuse
 * private, loopback, link-local and reserved addresses, including on every redirect hop.
 *
 * Set ALLOW_PRIVATE_TARGETS=1 only for local development against a test site.
 */

const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_TARGETS === '1';
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { ok: boolean; reason?: string; at: number }>();

function ipv4ToInt(ip: string) {
  return ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => (n & (~0 << (32 - bits))) >>> 0 === (ipv4ToInt(base) & (~0 << (32 - bits))) >>> 0);
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::' || l === '::1') return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd)/.test(l) || /^fe[89ab]/.test(l) || /^ff/.test(l); // ULA, link-local, multicast
  }
  return true; // not an IP at all: refuse
}

/** Checks scheme and resolves the host; throws with a user-facing reason if it isn't a public site. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`Only http and https URLs can be audited (got ${u.protocol}).`);
  if (u.username || u.password) throw new Error('URLs with embedded credentials are not allowed.');
  if (ALLOW_PRIVATE) return u;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    if (!hit.ok) throw new Error(hit.reason);
    return u;
  }
  let reason: string | undefined;
  if (net.isIP(host)) {
    if (isPrivateIp(host)) reason = `${host} is a private or local address and cannot be audited.`;
  } else {
    try {
      const addrs = await dns.lookup(host, { all: true, verbatim: true });
      const bad = addrs.find((a) => isPrivateIp(a.address));
      if (!addrs.length) reason = `${host} does not resolve.`;
      else if (bad) reason = `${host} resolves to a private or local address (${bad.address}) and cannot be audited.`;
    } catch (e: any) {
      // DNS failure: let the fetch report "could not be reached" with the usual message.
      cache.set(host, { ok: true, at: Date.now() });
      return u;
    }
  }
  cache.set(host, { ok: !reason, reason, at: Date.now() });
  if (reason) throw new Error(reason);
  return u;
}

/** True when the address can be submitted (scheme + public host). Never throws. */
export async function checkPublicUrl(raw: string): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  try {
    return { ok: true, url: await assertPublicUrl(raw) };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** fetch() that re-checks the target on every redirect hop. Same signature as fetch for our uses. */
export async function guardedFetch(url: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, current).toString();
      try {
        await res.body?.cancel();
      } catch {}
      continue;
    }
    // Response.url is empty/unchanged for manual fetches; expose the final URL to callers.
    Object.defineProperty(res, 'url', { value: current });
    return res;
  }
  throw new Error('Too many redirects');
}

/**
 * Store address typed by a user: adds https:// when no scheme is given and requires a real
 * hostname (a dot, or an IP). Rejects other schemes instead of silently prefixing them.
 */
export function parseStoreUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, error: 'url is required' };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s)) return { ok: false, error: `Only http and https URLs can be audited: ${s}` };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return { ok: false, error: `Invalid URL: ${s}` };
  }
  const h = u.hostname.replace(/^\[|\]$/g, '');
  if (!h.includes('.') && !net.isIP(h)) return { ok: false, error: `“${s}” is not a full domain name (for example your-store.com).` };
  if (u.username || u.password) return { ok: false, error: 'URLs with embedded credentials are not allowed.' };
  return { ok: true, url: u };
}
