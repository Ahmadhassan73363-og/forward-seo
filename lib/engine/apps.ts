import type { AppCost, CrawledPage, PageSpeedTest } from './types';

// Lighthouse entity names (third-party-web) and HTML-detected app names → category.
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/google analytics|google tag manager|gtag|hotjar|clarity|segment|triple whale|elevar|heap|mixpanel|amplitude|contentsquare|fullstory|quantum metric|glassbox|lucky orange/i, 'Analytics'],
  [/sentry|datadog|new relic|bugsnag|raygun|logrocket|dynatrace|speedcurve|mpulse/i, 'Monitoring'],
  [/optanon|onetrust|cookiebot|consentmo|pandectes|cookieyes|usercentrics|trustarc|termly|osano/i, 'Consent'],
  [/dynamic yield|optimizely|vwo|ab tasty|convert|kameleoon|monetate|intelligems|shoplift/i, 'Personalization & A/B'],
  [/yottaa|nostra|edgemesh/i, 'Performance tooling'],
  [/facebook|meta pixel|tiktok|pinterest|snapchat|twitter|reddit|linkedin|bing ads|doubleclick|google\/doubleclick|criteo|taboola|outbrain|google ads/i, 'Ads & pixels'],
  [/klaviyo|omnisend|attentive|postscript|mailchimp|privy|justuno|sms ?bump|drip/i, 'Email & SMS'],
  [/judge\.?me|yotpo|loox|okendo|stamped|junip|trustpilot|reviews\.io|bazaarvoice|power ?reviews/i, 'Reviews'],
  [/gorgias|zendesk|tidio|intercom|livechat|drift|hubspot|re:amaze|chat/i, 'Support & chat'],
  [/recharge|bold|appstle|skio|loop subscriptions/i, 'Subscriptions'],
  [/smile|loyaltylion|yotpo loyalty|rise\.ai/i, 'Loyalty'],
  [/algolia|searchanise|boost|klevu|searchspring|nosto|rebuy|limespot|wiser/i, 'Search & merchandising'],
  [/afterpay|klarna|affirm|sezzle|paypal|shop pay|stripe|zip/i, 'Payments & BNPL'],
  [/youtube|vimeo|wistia|tolstoy|videowise/i, 'Video'],
  [/shopify/i, 'Platform'],
  [/google fonts|typekit|adobe fonts|fonts/i, 'Fonts'],
  [/cloudflare|jsdelivr|unpkg|cdnjs|fastly|akamai/i, 'CDN'],
];

// HTML-detection names (lib/audit/core KNOWN_APPS) → Lighthouse entity names, for de-duplication.
const ALIASES: Record<string, string> = {
  'meta pixel (facebook)': 'facebook',
  'google analytics (ga4)': 'google analytics',
  'yotpo reviews': 'yotpo',
  'loox reviews': 'loox',
  'shopify core': 'shopify',
  'stamped.io': 'stamped',
};

export function categorize(name: string): string {
  return CATEGORY_RULES.find(([re]) => re.test(name))?.[1] || 'Other';
}

const key = (n: string) => (ALIASES[n.toLowerCase()] || n.toLowerCase()).replace(/[^a-z0-9]/g, '');

/** Per-app cost across tested pages. Prefers mobile tests (what Google ranks on). */
export function aggregateApps(tests: PageSpeedTest[], crawl: CrawledPage[]): AppCost[] {
  const done = tests.filter((t) => t.status === 'done' && t.result);
  const mobile = done.filter((t) => t.strategy === 'mobile');
  const basis = mobile.length ? mobile : done;
  const map = new Map<string, AppCost & { _mt: number; _bt: number; _tx: number }>();

  for (const t of basis) {
    const seen = new Set<string>();
    for (const tp of t.result!.thirdParties) {
      const k = key(tp.entity);
      if (seen.has(k)) continue;
      seen.add(k);
      const cur = map.get(k) || {
        name: tp.entity,
        category: categorize(tp.entity),
        pages: 0,
        pagesTested: basis.length,
        pageUrls: [] as string[],
        avgMainThreadMs: 0,
        avgBlockingMs: 0,
        avgTransferKb: 0,
        detectedBy: ['lighthouse'] as AppCost['detectedBy'],
        _mt: 0,
        _bt: 0,
        _tx: 0,
      };
      cur.pages++;
      cur.pageUrls!.push(t.url);
      cur._mt += tp.mainThreadMs;
      cur._bt += tp.blockingMs;
      cur._tx += tp.transferBytes;
      map.set(k, cur);
    }
  }

  // Apps seen in HTML but not attributed by Lighthouse (or no PSI data at all)
  const okCrawl = crawl.filter((p) => !p.error);
  for (const p of okCrawl) {
    for (const app of p.detectedApps) {
      const k = key(app);
      const cur = map.get(k);
      if (cur) {
        if (!cur.detectedBy.includes('html')) cur.detectedBy.push('html');
        continue;
      }
      map.set(k, {
        name: app,
        category: categorize(app),
        pages: okCrawl.filter((x) => x.detectedApps.includes(app)).length,
        pagesTested: okCrawl.length,
        pageUrls: okCrawl.filter((x) => x.detectedApps.includes(app)).map((x) => x.url),
        avgMainThreadMs: 0,
        avgBlockingMs: 0,
        avgTransferKb: 0,
        detectedBy: ['html'],
        _mt: 0,
        _bt: 0,
        _tx: 0,
      });
    }
  }

  return Array.from(map.values())
    .map(({ _mt, _bt, _tx, ...a }) => ({
      ...a,
      avgMainThreadMs: a.detectedBy.includes('lighthouse') && a.pages ? Math.round(_mt / a.pages) : 0,
      avgBlockingMs: a.detectedBy.includes('lighthouse') && a.pages ? Math.round(_bt / a.pages) : 0,
      avgTransferKb: a.detectedBy.includes('lighthouse') && a.pages ? Math.round(_tx / a.pages / 1024) : 0,
    }))
    .sort((a, b) => b.avgMainThreadMs + b.avgBlockingMs * 2 - (a.avgMainThreadMs + a.avgBlockingMs * 2) || b.pages - a.pages);
}
