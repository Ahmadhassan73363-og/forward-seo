import type { PlatformInfo } from './types';

/*
 * Identifies the site's platform from the homepage HTML and response headers. Only evidence that
 * is actually present is reported; a site with no recognisable markers is "unknown", never guessed.
 * Shopify-specific checks (theme.liquid, catalog feed, policies, cart flow, Shopify fix steps) run
 * only when the platform is Shopify.
 */

type Sig = { id: PlatformInfo['id']; name: string; html?: RegExp[]; headers?: Array<[string, RegExp]> };

const SIGNATURES: Sig[] = [
  {
    id: 'shopify',
    name: 'Shopify',
    html: [/cdn\.shopify\.com\/s\/files/i, /window\.Shopify\s*=/, /Shopify\.theme\s*=/, /class="shopify-section/i, /\/cdn\/shop\/(t|files)\//i],
    headers: [['x-shopid', /.+/], ['x-shopify-stage', /.+/], ['powered-by', /shopify/i]],
  },
  // Asset paths / body classes only: the bare word "WooCommerce" also appears in ordinary page text.
  { id: 'woocommerce', name: 'WooCommerce (WordPress)', html: [/\/wp-content\/plugins\/woocommerce\//i, /<body[^>]+class="[^"]*\bwoocommerce(-page|-js|-no-js)?\b/i, /\bwc-block-components-/i] },
  { id: 'wordpress', name: 'WordPress', html: [/\/wp-content\//i, /\/wp-includes\//i, /<meta name="generator" content="WordPress/i], headers: [['link', /api\.w\.org/i], ['x-powered-by', /wordpress|wp engine/i]] },
  { id: 'wix', name: 'Wix', html: [/static\.wixstatic\.com/i, /<meta name="generator" content="Wix/i], headers: [['x-wix-request-id', /.+/]] },
  { id: 'squarespace', name: 'Squarespace', html: [/static1\.squarespace\.com/i, /<!-- This is Squarespace/i] },
  { id: 'webflow', name: 'Webflow', html: [/data-wf-site=/i, /<meta content="Webflow" name="generator"/i] },
  { id: 'bigcommerce', name: 'BigCommerce', html: [/cdn\d*\.bigcommerce\.com/i, /stencil-utils/i] },
  { id: 'magento', name: 'Magento / Adobe Commerce', html: [/Magento_/, /mage\/cookies/i, /\/static\/version\d+\/frontend\//i] },
  { id: 'nextjs', name: 'Next.js', html: [/<script id="__NEXT_DATA__"/i, /\/_next\/static\//i], headers: [['x-powered-by', /next\.js/i]] },
  { id: 'nuxt', name: 'Nuxt', html: [/window\.__NUXT__/, /\/_nuxt\//i] },
  { id: 'gatsby', name: 'Gatsby', html: [/id="___gatsby"/i, /<meta name="generator" content="Gatsby/i] },
  { id: 'react', name: 'React (single-page app)', html: [/<div id="root"><\/div>/i, /data-reactroot/i] },
];

export function detectPlatform(html: string, headers: Headers | Record<string, string | null>): PlatformInfo {
  const get = (k: string) => (headers instanceof Headers ? headers.get(k) : headers[k]) || '';
  const head = html.slice(0, 400_000);
  const found: PlatformInfo[] = [];
  for (const s of SIGNATURES) {
    const evidence: string[] = [];
    for (const re of s.html || []) {
      const m = head.match(re);
      if (m) evidence.push(`HTML contains “${m[0].slice(0, 60)}”`);
    }
    for (const [h, re] of s.headers || []) {
      const v = get(h);
      if (v && re.test(v)) evidence.push(`${h} header: ${v.slice(0, 60)}`);
    }
    if (evidence.length) found.push({ id: s.id, name: s.name, evidence });
  }
  if (!found.length) return { id: 'unknown', name: 'Unknown platform', evidence: [] };

  const shopify = found.find((f) => f.id === 'shopify');
  // A headless storefront (e.g. Next.js/Hydrogen) can use Shopify's image CDN without running a
  // Shopify theme. Only theme markers or Shopify's own response headers count as a theme store.
  if (shopify) {
    const themeMarkers = shopify.evidence.some((e) => /window\.Shopify|Shopify\.theme|shopify-section|x-shopid|x-shopify-stage|powered-by|\/cdn\/shop\//i.test(e));
    if (themeMarkers) return shopify;
    const framework = found.find((f) => f.id !== 'shopify');
    return { id: 'headless', name: `Headless storefront${framework ? ` (${framework.name})` : ''} using Shopify assets`, evidence: [...shopify.evidence, ...(framework?.evidence || [])] };
  }
  // WooCommerce implies WordPress; prefer the more specific one.
  return found.find((f) => f.id === 'woocommerce') || found[0];
}

/** Shopify's storefront password page (store not open to the public). */
export function isShopifyPasswordPage(html: string, finalUrl: string): boolean {
  return /\/password\/?$/.test(new URL(finalUrl).pathname) || /<form[^>]+action="\/password"/i.test(html) || /template-password/i.test(html);
}
