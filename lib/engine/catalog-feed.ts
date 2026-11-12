import { CRAWLER_HEADERS, parseRetryAfterMs, sleep } from '../audit/core';
import { guardedFetch } from './net-guard';
import { stripHtml, words } from './shopify-admin';
import type { OwnerProductIssue, OwnerResults } from './types';

/*
 * Whole-catalog checks from Shopify's public storefront feeds:
 *   /products.json?limit=250&page=N     every product published to the Online Store
 *   /collections.json?limit=250&page=N  every published collection with its product count
 *
 * Shopify rate-limits product and collection *HTML* pages per IP (429, Retry-After 60), but in
 * testing these feeds kept answering while the HTML routes were blocked. 250 products per request
 * means a 2,000-product store needs about 8 requests instead of 2,000 page loads.
 *
 * The feed has no SEO fields, image alt text or barcodes, so those checks need owner mode.
 */

const PAGE_SIZE = 250;
const MAX_PRODUCTS = Math.max(250, Number(process.env.FEED_MAX_PRODUCTS) || 5000);
const MAX_COLLECTIONS = 5000;
const GAP_MS = 400;
const MAX_ISSUE_ITEMS = 300;

type FeedPage<T> = { ok: true; items: T[] } | { ok: false; status: number; message: string };

async function getPage<T>(url: string, key: 'products' | 'collections', isCancelled: () => boolean): Promise<FeedPage<T>> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res: Response;
    try {
      res = await guardedFetch(url, { headers: { ...CRAWLER_HEADERS, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    } catch (e: any) {
      return { ok: false, status: 0, message: e?.name === 'TimeoutError' ? 'timeout' : e?.message || 'fetch failed' };
    }
    if (res.status === 429 && attempt === 1) {
      // One polite retry after Retry-After (capped), then give up and keep what we have.
      const wait = Math.min(65_000, parseRetryAfterMs(res.headers.get('retry-after')));
      const until = Date.now() + wait;
      while (Date.now() < until && !isCancelled()) await sleep(1000);
      continue;
    }
    if (!res.ok) return { ok: false, status: res.status, message: `HTTP ${res.status}` };
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data[key])) return { ok: false, status: res.status, message: 'Not a Shopify JSON feed' };
    return { ok: true, items: data[key] };
  }
  return { ok: false, status: 429, message: 'HTTP 429 (rate limited)' };
}

export async function fetchCatalogFeed(baseUrl: string, isCancelled: () => boolean = () => false): Promise<OwnerResults> {
  const out: OwnerResults = { status: 'ok', via: 'feed', issues: {} };
  const add = (check: string, item: OwnerProductIssue) => {
    const list = (out.issues![check] ||= []);
    (out.totals ||= {})[check] = (out.totals[check] || 0) + 1; // real count; the list itself is capped
    if (list.length < MAX_ISSUE_ITEMS) list.push(item);
  };
  const notes: string[] = [];

  // Products
  let scanned = 0;
  let active = 0;
  let truncated = false;
  const descIndex = new Map<string, OwnerProductIssue[]>();
  const seenProducts = new Set<number>();
  for (let page = 1; !isCancelled(); page++) {
    if (scanned >= MAX_PRODUCTS) {
      truncated = true;
      break;
    }
    const r = await getPage<any>(`${baseUrl}/products.json?limit=${PAGE_SIZE}&page=${page}`, 'products', isCancelled);
    if (r.ok === false) {
      if (page === 1) return { status: 'failed', via: 'feed', message: `The public product feed is not available (${r.message}).` };
      notes.push(`Product feed stopped at page ${page} (${r.message}); ${scanned} products were checked.`);
      truncated = true;
      break;
    }
    if (!r.items.length || seenProducts.has(r.items[0].id)) break;
    for (const p of r.items) {
      seenProducts.add(p.id);
      scanned++;
      if (/gift.?card/i.test(`${p.product_type} ${p.handle}`)) continue;
      active++;
      const base = { handle: p.handle, title: p.title, url: `${baseUrl}/products/${p.handle}` };
      const text = stripHtml(p.body_html || '');
      const wc = words(text);
      if (wc < 50) add('owner_thin_description', { ...base, issue: `${wc} words of description` });
      if (text.length > 40) {
        const key = text.toLowerCase().slice(0, 400);
        descIndex.set(key, [...(descIndex.get(key) || []), { ...base, issue: '' }]);
      }
      if (!(p.images || []).length) add('owner_no_images', { ...base, issue: 'No product images' });
      const variants: any[] = p.variants || [];
      if (variants.length && variants.every((v) => v.available === false)) add('owner_oos_indexed', { ...base, issue: `All ${variants.length} variant(s) sold out but the product is still published` });
    }
    if (r.items.length < PAGE_SIZE) break;
    await sleep(GAP_MS);
  }
  for (const group of Array.from(descIndex.values())) {
    if (group.length < 2) continue;
    for (const g of group) add('owner_duplicate_description', { ...g, issue: `Same description as ${group.length - 1} other product(s), e.g. “${group.find((x) => x.handle !== g.handle)?.title}”` });
  }

  // Collections
  let cScanned = 0;
  const seenCollections = new Set<number>();
  for (let page = 1; !isCancelled() && cScanned < MAX_COLLECTIONS; page++) {
    await sleep(GAP_MS);
    const r = await getPage<any>(`${baseUrl}/collections.json?limit=${PAGE_SIZE}&page=${page}`, 'collections', isCancelled);
    if (r.ok === false) {
      notes.push(`Collection feed unavailable (${r.message}).`);
      break;
    }
    if (!r.items.length || seenCollections.has(r.items[0].id)) break;
    for (const c of r.items) {
      seenCollections.add(c.id);
      if (c.handle === 'frontpage') continue;
      cScanned++;
      const base = { handle: c.handle, title: c.title, url: `${baseUrl}/collections/${c.handle}` };
      const descWords = words(stripHtml(c.description || ''));
      if (c.products_count === 0) add('owner_empty_collections', { ...base, issue: 'Collection has no published products' });
      else if (descWords < 40) add('owner_collection_no_description', { ...base, issue: `${descWords} words of description` });
    }
    if (r.items.length < PAGE_SIZE) break;
  }

  out.counts = { products: scanned, productsScanned: scanned, activeProducts: active, collections: cScanned, collectionsScanned: cScanned, redirects: null };
  out.truncated = truncated;
  if (notes.length) out.message = notes.join(' ');
  return out;
}

/**
 * Product titles and collection titles from the first page of each public feed (one request each).
 * Used to spot the store's products in AI answers and to phrase shopping prompts.
 * Empty lists when the feed isn't available (not a Shopify store, or blocked).
 */
export async function fetchCatalogNames(baseUrl: string): Promise<{ products: string[]; collections: Array<{ title: string; count?: number }> }> {
  const never = () => false;
  const [p, c] = await Promise.all([
    getPage<any>(`${baseUrl}/products.json?limit=${PAGE_SIZE}&page=1`, 'products', never),
    getPage<any>(`${baseUrl}/collections.json?limit=${PAGE_SIZE}&page=1`, 'collections', never),
  ]);
  return {
    products: p.ok ? p.items.map((x: any) => String(x?.title || '').trim()).filter(Boolean) : [],
    collections: c.ok
      ? c.items
          .filter((x: any) => x?.handle !== 'frontpage' && x?.title)
          .map((x: any) => ({ title: String(x.title).trim(), count: typeof x.products_count === 'number' ? x.products_count : undefined }))
      : [],
  };
}
