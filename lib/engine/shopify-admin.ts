import { KNOWN_APPS, sleep } from '../audit/core';
import type { OwnerProductIssue, OwnerResults } from './types';

/*
 * Owner mode (Phase 4): reads the full catalog through the Shopify Admin GraphQL API with an access
 * token from an app installed on the merchant's own store (custom app / Dev Dashboard app).
 * Required scopes: read_products, read_themes (optional, for theme script checks), read_content.
 * Read-only: this module never sends mutations.
 */

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
const MAX_PRODUCTS = Math.max(25, Number(process.env.OWNER_MAX_PRODUCTS) || 1000);
const MAX_COLLECTIONS = 500;
const MAX_ISSUE_ITEMS = 300;

export interface OwnerCredentials {
  shop: string; // xxx.myshopify.com
  token: string;
}

export function normalizeShopDomain(s: string): string | null {
  const v = s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(v)) return v;
  if (/^[a-z0-9][a-z0-9-]*$/.test(v)) return `${v}.myshopify.com`;
  return null;
}

class AdminError extends Error {}

async function gql<T = any>(cred: OwnerCredentials, query: string, variables: Record<string, any> = {}): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://${cred.shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': cred.token },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 || res.status === 403) throw new AdminError(`Admin API rejected the token (HTTP ${res.status}). Check the token and its scopes.`);
    if (res.status === 404) throw new AdminError(`Shop ${cred.shop} not found or API version ${API_VERSION} unavailable.`);
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    const data = await res.json();
    const throttled = data.errors?.some((e: any) => e.extensions?.code === 'THROTTLED');
    if (throttled) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (data.errors?.length) throw new AdminError(data.errors.map((e: any) => e.message).join('; '));
    // Stay under the leaky-bucket limit: wait if the remaining budget is low.
    const t = data.extensions?.cost?.throttleStatus;
    if (t && t.currentlyAvailable < (data.extensions.cost.requestedQueryCost || 100) * 2) {
      await sleep(Math.ceil(((data.extensions.cost.requestedQueryCost || 100) * 2 - t.currentlyAvailable) / (t.restoreRate || 50)) * 1000);
    }
    return data.data as T;
  }
  throw new AdminError('Admin API kept throttling requests.');
}

export const stripHtml = (h: string) => h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
export const words = (t: string) => (t ? t.split(' ').filter(Boolean).length : 0);

const PRODUCTS_QUERY = `query Products($after: String) {
  products(first: 25, after: $after, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    nodes {
      handle title status onlineStoreUrl totalInventory tracksInventory isGiftCard
      descriptionHtml
      seo { title description }
      media(first: 10) { nodes { alt mediaContentType } }
      variants(first: 10) { nodes { sku barcode inventoryPolicy } }
    }
  }
}`;

const COLLECTIONS_QUERY = `query Collections($after: String) {
  collections(first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { handle title descriptionHtml productsCount { count } }
  }
}`;

export async function runOwnerAudit(cred: OwnerCredentials): Promise<OwnerResults> {
  try {
    const shopData = await gql(cred, `{ shop { name myshopifyDomain primaryDomain { url host } } productsCount { count } collectionsCount { count } }`);
    const primary: string = shopData.shop.primaryDomain.url.replace(/\/$/, '');
    const out: OwnerResults = {
      via: 'admin',
      status: 'ok',
      shop: { name: shopData.shop.name, myshopifyDomain: shopData.shop.myshopifyDomain, primaryDomain: shopData.shop.primaryDomain.host },
      issues: {},
    };
    const add = (check: string, item: OwnerProductIssue) => {
      const list = (out.issues![check] ||= []);
      (out.totals ||= {})[check] = (out.totals[check] || 0) + 1; // real count; the list itself is capped
      if (list.length < MAX_ISSUE_ITEMS) list.push(item);
    };

    // Products
    let after: string | null = null;
    let scanned = 0;
    let active = 0;
    const descIndex = new Map<string, OwnerProductIssue[]>();
    do {
      const d: any = await gql(cred, PRODUCTS_QUERY, { after });
      for (const p of d.products.nodes) {
        scanned++;
        if (p.status !== 'ACTIVE' || p.isGiftCard) continue;
        active++;
        const url = `${primary}/products/${p.handle}`;
        const base = { handle: p.handle, title: p.title, url };
        const text = stripHtml(p.descriptionHtml || '');
        const wc = words(text);
        const images = p.media.nodes.filter((m: any) => m.mediaContentType === 'IMAGE');

        if (!p.seo?.description && text.length < 50) add('owner_missing_meta', { ...base, issue: 'No SEO description and almost no product description to fall back on' });
        const title = p.seo?.title || p.title;
        if (title.length > 70) add('owner_title_long', { ...base, issue: `SEO title is ${title.length} characters` });
        if (wc < 50) add('owner_thin_description', { ...base, issue: `${wc} words of description` });
        if (text.length > 40) {
          const key = text.toLowerCase().slice(0, 400);
          descIndex.set(key, [...(descIndex.get(key) || []), { ...base, issue: '' }]);
        }
        if (!images.length) add('owner_no_images', { ...base, issue: 'No product images' });
        const noAlt = images.filter((m: any) => !m.alt || !String(m.alt).trim()).length;
        if (noAlt) add('owner_media_alt', { ...base, issue: `${noAlt} of ${images.length} images without alt text` });
        if (!p.variants.nodes.some((v: any) => v.barcode)) add('owner_missing_barcode', { ...base, issue: 'No variant has a barcode (GTIN)' });
        const allDeny = p.variants.nodes.every((v: any) => v.inventoryPolicy === 'DENY');
        if (p.tracksInventory && p.totalInventory <= 0 && allDeny && p.onlineStoreUrl) add('owner_oos_indexed', { ...base, issue: `Out of stock (inventory ${p.totalInventory}) but published` });
      }
      after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
    } while (after && scanned < MAX_PRODUCTS);
    out.truncated = !!after;

    for (const group of Array.from(descIndex.values())) {
      if (group.length < 2) continue;
      for (const g of group) add('owner_duplicate_description', { ...g, issue: `Same description as ${group.length - 1} other product(s), e.g. “${group.find((x) => x.handle !== g.handle)?.title}”` });
    }

    // Collections
    let cAfter: string | null = null;
    let cScanned = 0;
    do {
      const d: any = await gql(cred, COLLECTIONS_QUERY, { after: cAfter });
      for (const c of d.collections.nodes) {
        cScanned++;
        const url = `${primary}/collections/${c.handle}`;
        const base = { handle: c.handle, title: c.title, url };
        if ((c.productsCount?.count ?? 0) === 0) add('owner_empty_collections', { ...base, issue: 'Collection has no products' });
        else if (words(stripHtml(c.descriptionHtml || '')) < 40) add('owner_collection_no_description', { ...base, issue: `${words(stripHtml(c.descriptionHtml || ''))} words of description` });
      }
      cAfter = d.collections.pageInfo.hasNextPage ? d.collections.pageInfo.endCursor : null;
    } while (cAfter && cScanned < MAX_COLLECTIONS);

    // Redirect count (field availability varies by API version)
    let redirects: number | null = null;
    try {
      redirects = (await gql(cred, `{ urlRedirectsCount { count } }`)).urlRedirectsCount.count;
    } catch {}

    // Theme: hard-coded third-party scripts in layout/theme.liquid (needs read_themes)
    try {
      const t = await gql(
        cred,
        `{ themes(first: 1, roles: [MAIN]) { nodes { name files(filenames: ["layout/theme.liquid"], first: 1) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } } } } }`
      );
      const theme = t.themes.nodes[0];
      out.themeName = theme?.name;
      const content: string = theme?.files?.nodes?.[0]?.body?.content || '';
      const shopHosts = [new URL(primary).hostname, cred.shop];
      const domains = new Set<string>();
      for (const m of Array.from(content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi))) {
        try {
          const h = new URL(m[1].startsWith('//') ? `https:${m[1]}` : m[1]).hostname;
          if (!h.endsWith('shopify.com') && !h.endsWith('shopifycdn.com') && !shopHosts.includes(h)) domains.add(h);
        } catch {}
      }
      out.themeScripts = Array.from(domains).map((domain) => ({
        file: 'layout/theme.liquid',
        domain,
        app: Object.entries(KNOWN_APPS).find(([, sigs]) => sigs.some((s) => domain.includes(s.split('/')[0])))?.[0],
      }));
    } catch (e: any) {
      out.message = `Theme files not read (${e?.message?.slice(0, 120)}). Add the read_themes scope to check hard-coded scripts.`;
    }

    out.counts = {
      products: shopData.productsCount?.count ?? scanned,
      productsScanned: scanned,
      activeProducts: active,
      collections: shopData.collectionsCount?.count ?? cScanned,
      collectionsScanned: cScanned,
      redirects,
    };
    return out;
  } catch (e: any) {
    return { status: 'failed', message: e instanceof AdminError ? e.message : `Admin API error: ${e?.message}` };
  }
}
