import type { SchemaIssue } from './types';

/*
 * Checks schema.org items against Google's structured data requirements (required / recommended
 * properties per search feature) and schema.org value formats.
 *
 * Sources: developers.google.com/search/docs/appearance/structured-data (Product, Merchant listing,
 * Breadcrumb, Organization, Article, FAQ, Video, Review snippet, Event, Recipe, Local business),
 * and schema.org value definitions. Only what those documents state is checked; nothing is guessed.
 */

type Req = string | string[]; // string[] = any one of them

interface Rule {
  required?: Req[];
  recommended?: Req[];
  /** Google feature this type can make the page eligible for, when it has no errors */
  feature?: string | ((e: any, has: (k: string) => boolean) => string | null);
  note?: string;
  check?: (e: any, c: Ctx, path: string) => void;
}

export interface ValidationResult {
  valid: number;
  issues: SchemaIssue[];
  features: string[];
  notes: string[];
  nestedTypes: string[];
}

/** Facts about the whole page that change what an item needs (e.g. a store-wide return policy). */
export interface PageContext {
  resolve: (id: string) => any;
  orgReturnPolicy: boolean;
  orgShipping: boolean;
}

interface Ctx extends PageContext {
  issues: SchemaIssue[];
  valid: number;
  features: Set<string>;
  notes: Set<string>;
  nested: Set<string>;
  depth: number;
  visited: Set<any>;
}

const ORG_RULE: Rule = {
  recommended: ['name', 'url', 'logo', 'sameAs'],
  feature: (e) => (e.logo && e.url ? 'Organization logo' : null),
};

const ARTICLE_RULE: Rule = {
  recommended: ['headline', 'image', 'datePublished', 'dateModified', 'author'],
  feature: 'Article',
  check: (e, c, path) => {
    for (const [i, a] of Array.from(arr(e.author).entries())) {
      const p = join(path, arr(e.author).length > 1 ? `author[${i}]` : 'author');
      if (typeof a === 'string') warn(c, p, 'Author is plain text: use a Person or Organization with a name (and url)');
      else if (a && typeof a === 'object' && !a.name && !onlyId(a)) err(c, p, 'Author has no name');
    }
    if (typeof e.headline === 'string' && e.headline.length > 110) warn(c, join(path, 'headline'), `Headline is ${e.headline.length} characters; Google may cut long headlines`);
  },
};

const LOCAL_RULE: Rule = {
  required: ['name', 'address'],
  recommended: ['url', 'telephone', 'image', 'openingHoursSpecification', 'geo', 'priceRange'],
  feature: 'Local business',
  check: (e, c, path) => {
    if (!e.address) c.notes.add('LocalBusiness / Store types are for physical shops. An online-only store should use OnlineStore or Organization.');
  },
};

const WEBPAGE_RULE: Rule = { recommended: ['name', 'url'] };

const RULES: Record<string, Rule> = {
  Product: {
    required: ['name', ['offers', 'review', 'aggregateRating', 'hasVariant']],
    recommended: ['image', 'description', 'brand', ['sku', 'gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14', 'mpn'], ['aggregateRating', 'review']],
    feature: (e) => {
      const f: string[] = ['Product snippets'];
      if (e.image && (e.offers || e.hasVariant)) f.push('Merchant listings');
      return f.join('|');
    },
  },
  ProductGroup: {
    required: ['name'],
    recommended: ['productGroupID', 'variesBy', 'hasVariant', 'image', 'brand', 'description'],
    feature: 'Product variants',
  },
  Offer: {
    required: [['price', 'priceSpecification'], 'priceCurrency'],
    recommended: ['availability'],
    check: (e, c, path) => {
      if (!e.priceCurrency && e.priceSpecification?.priceCurrency) dropIssue(c, join(path, 'priceCurrency'));
      // Shipping and returns are usually the same for every variant: report them on the first offer only
      if (/\[[1-9]\d*\]$/.test(path)) return;
      if (!e.shippingDetails && !c.orgShipping) warn(c, join(path, 'shippingDetails'), 'Missing recommended property "shippingDetails" (shipping cost and time for Merchant listings)');
      if (!e.hasMerchantReturnPolicy && !c.orgReturnPolicy) warn(c, join(path, 'hasMerchantReturnPolicy'), 'Missing recommended property "hasMerchantReturnPolicy" (or set one on the Organization)');
      const until = typeof e.priceValidUntil === 'string' ? Date.parse(e.priceValidUntil) : NaN;
      if (!isNaN(until) && until < Date.now()) warn(c, join(path, 'priceValidUntil'), `priceValidUntil (${e.priceValidUntil}) has passed; Google may stop showing the price`);
    },
  },
  AggregateOffer: { required: ['lowPrice', 'priceCurrency'], recommended: ['highPrice', 'offerCount'] },
  AggregateRating: {
    required: ['ratingValue', ['ratingCount', 'reviewCount']],
    feature: 'Review snippet',
    check: (e, c, path) => ratingRange(e, c, path),
  },
  Rating: { required: ['ratingValue'], check: (e, c, path) => ratingRange(e, c, path) },
  Review: { required: ['author', 'reviewRating'], recommended: ['datePublished'], feature: 'Review snippet' },
  Brand: { required: ['name'] },
  BreadcrumbList: {
    required: ['itemListElement'],
    feature: 'Breadcrumbs',
    check: (e, c, path) => {
      const list = arr(e.itemListElement).map((x) => (onlyId(x) ? c.resolve(x['@id']) || x : x));
      if (list.length === 1) warn(c, join(path, 'itemListElement'), 'Only one breadcrumb: Google recommends at least two levels');
      list.forEach((li, i) => {
        const p = join(path, `itemListElement[${i}]`);
        if (!li || typeof li !== 'object') return err(c, p, 'Breadcrumb entry is not a ListItem');
        if (li.position === undefined) err(c, join(p, 'position'), 'Missing required property "position"');
        else if (Number(li.position) !== i + 1) warn(c, join(p, 'position'), `Position is ${li.position}; expected ${i + 1} (positions should run 1, 2, 3 …)`);
        const item = li.item;
        const name = li.name ?? (item && typeof item === 'object' ? item.name : undefined);
        if (!name) err(c, join(p, 'name'), 'Missing required property "name"');
        if (!item && i < list.length - 1) err(c, join(p, 'item'), 'Missing required property "item" (the URL); only the last breadcrumb may omit it');
      });
    },
  },
  ListItem: {},
  ItemList: {
    required: ['itemListElement'],
    check: (e, c, path) => {
      if (Array.isArray(e.itemListElement) && e.itemListElement.length === 0) warn(c, join(path, 'itemListElement'), 'The list is empty');
    },
  },
  WebSite: {
    required: ['name', 'url'],
    recommended: ['alternateName'],
    feature: 'Site name',
    check: (e, c, path) => {
      for (const [i, a] of Array.from(arr(e.potentialAction).entries())) {
        if (!a || !typesOf(a).includes('SearchAction')) continue;
        const p = join(path, arr(e.potentialAction).length > 1 ? `potentialAction[${i}]` : 'potentialAction');
        const target = typeof a.target === 'string' ? a.target : a.target?.urlTemplate;
        // query-input is text ("required name=search_term_string") or a PropertyValueSpecification
        const q = a['query-input'] ?? a.queryInput;
        const qi = arr(q).map((x) => (x && typeof x === 'object' ? String(x.valueName ?? '') : String(x ?? ''))).join(' ');
        if (!target) err(c, join(p, 'target'), 'SearchAction has no target URL template');
        else if (!/\{[^}]+\}/.test(target)) err(c, join(p, 'target'), 'Search target has no {placeholder} for the search term');
        else {
          const ph = target.match(/\{([^}]+)\}/)![1];
          if (qi && !qi.includes(ph)) err(c, join(p, 'query-input'), `query-input does not name the placeholder "${ph}"`);
        }
        c.notes.add('Google retired the sitelinks search box in November 2024; the SearchAction is harmless but no longer shown.');
      }
    },
  },
  Organization: ORG_RULE,
  LocalBusiness: LOCAL_RULE,
  PostalAddress: { recommended: ['streetAddress', 'addressLocality', 'addressCountry'] },
  ContactPoint: { recommended: [['telephone', 'email'], 'contactType'] },
  Article: ARTICLE_RULE,
  WebPage: WEBPAGE_RULE,
  FAQPage: {
    required: ['mainEntity'],
    feature: 'FAQ',
    check: (e, c) => {
      c.notes.add('Since August 2023 Google shows FAQ rich results only for well-known government and health sites. The markup still helps AI answers and other search engines.');
    },
  },
  Question: {
    required: ['name', 'acceptedAnswer'],
    check: (e, c, path) => {
      const a = arr(e.acceptedAnswer)[0];
      if (a && typeof a === 'object' && !onlyId(a) && !a.text) err(c, join(path, 'acceptedAnswer.text'), 'Answer has no text');
    },
  },
  Answer: { required: ['text'] },
  VideoObject: { required: ['name', 'thumbnailUrl', 'uploadDate'], recommended: ['description', ['contentUrl', 'embedUrl'], 'duration'], feature: 'Video' },
  ImageObject: { required: [['url', 'contentUrl']] },
  Event: { required: ['name', 'startDate', 'location'], recommended: ['endDate', 'eventStatus', 'image', 'description', 'offers', 'organizer'], feature: 'Event' },
  Recipe: { required: ['name', 'image'], recommended: ['author', 'datePublished', 'description', 'recipeIngredient', 'recipeInstructions', 'totalTime'], feature: 'Recipe' },
  HowTo: { note: 'Google retired HowTo rich results in September 2023.' },
  Person: { recommended: ['name'] },
  MerchantReturnPolicy: { required: [['applicableCountry', 'returnPolicyCountry'], 'returnPolicyCategory'], recommended: ['merchantReturnDays', 'returnFees', 'returnMethod'] },
  OfferShippingDetails: { recommended: ['shippingRate', 'shippingDestination', 'deliveryTime'] },
  SiteNavigationElement: { note: 'SiteNavigationElement is not used by Google; it can be removed.' },
  WPHeader: { note: 'WPHeader is not used by Google; it can be removed.' },
  WPFooter: { note: 'WPFooter is not used by Google; it can be removed.' },
};

const ALIASES: Record<string, string> = {
  OnlineStore: 'Organization', OnlineBusiness: 'Organization', Corporation: 'Organization', NGO: 'Organization', Brand: 'Brand',
  Store: 'LocalBusiness', ClothingStore: 'LocalBusiness', ShoeStore: 'LocalBusiness', JewelryStore: 'LocalBusiness', ElectronicsStore: 'LocalBusiness',
  SportingGoodsStore: 'LocalBusiness', HomeGoodsStore: 'LocalBusiness', FurnitureStore: 'LocalBusiness', BookStore: 'LocalBusiness', PetStore: 'LocalBusiness',
  OutletStore: 'LocalBusiness', DepartmentStore: 'LocalBusiness', GroceryStore: 'LocalBusiness', HardwareStore: 'LocalBusiness', ToyStore: 'LocalBusiness',
  BikeStore: 'LocalBusiness', HealthAndBeautyBusiness: 'LocalBusiness', Restaurant: 'LocalBusiness', CafeOrCoffeeShop: 'LocalBusiness',
  BlogPosting: 'Article', NewsArticle: 'Article', TechArticle: 'Article', Report: 'Article', ScholarlyArticle: 'Article',
  CollectionPage: 'WebPage', ItemPage: 'WebPage', AboutPage: 'WebPage', ContactPage: 'WebPage', SearchResultsPage: 'WebPage', ProfilePage: 'WebPage', CheckoutPage: 'WebPage', QAPage: 'WebPage',
  IndividualProduct: 'Product', ProductModel: 'Product', SomeProducts: 'Product',
  UnitPriceSpecification: 'PriceSpecification',
};

const OTHER_KNOWN = ['Thing', 'Blog', 'SearchAction', 'EntryPoint', 'PriceSpecification', 'GeoCoordinates', 'OpeningHoursSpecification', 'QuantitativeValue', 'DefinedRegion', 'ShippingDeliveryTime', 'MonetaryAmount', 'PropertyValue', 'Place', 'Country', 'ReadAction', 'BuyAction', 'Duration'];

/** Every type name this checker knows, for case-mistake detection. */
const KNOWN_TYPES = new Map<string, string>([...Object.keys(RULES), ...Object.keys(ALIASES), ...OTHER_KNOWN].map((t) => [t.toLowerCase(), t]));

const AVAILABILITY = ['InStock', 'OutOfStock', 'PreOrder', 'BackOrder', 'Discontinued', 'LimitedAvailability', 'OnlineOnly', 'InStoreOnly', 'SoldOut', 'PreSale', 'MadeToOrder', 'Reserved'];
const CONDITION = ['NewCondition', 'UsedCondition', 'RefurbishedCondition', 'DamagedCondition'];
const URL_PROPS = new Set(['url', 'logo', 'image', 'sameAs', 'item', 'contentUrl', 'embedUrl', 'thumbnailUrl', 'mainEntityOfPage', 'hasMap', 'target', 'urlTemplate', 'license', 'acquireLicensePage']);
const DATE_PROPS = new Set(['datePublished', 'dateModified', 'dateCreated', 'uploadDate', 'priceValidUntil', 'startDate', 'endDate', 'validFrom', 'validThrough']);
const NUM_PROPS = new Set(['price', 'lowPrice', 'highPrice', 'ratingValue', 'bestRating', 'worstRating', 'reviewCount', 'ratingCount', 'position', 'offerCount', 'merchantReturnDays']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const NUMERIC = /^-?\d+(\.\d+)?$/;

// ─── helpers ────────────────────────────────────────────────────────────────

export function typesOf(e: any): string[] {
  const t = e?.['@type'];
  if (!t) return [];
  return (Array.isArray(t) ? t : [t]).map((x) => typeName(String(x)));
}

/** "http://schema.org/Product" or "schema:Product" → "Product" */
export function typeName(t: string): string {
  return t.trim().replace(/^.*[/#:]/, '');
}

const arr = (x: any): any[] => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const join = (a: string, b: string) => (a ? `${a}.${b}` : b);
const onlyId = (x: any) => x && typeof x === 'object' && !Array.isArray(x) && x['@id'] && Object.keys(x).every((k) => k === '@id');
const err = (c: Ctx, path: string, message: string) => void c.issues.push({ level: 'error', path, message });
const warn = (c: Ctx, path: string, message: string) => void c.issues.push({ level: 'warning', path, message });
function dropIssue(c: Ctx, path: string) {
  c.issues = c.issues.filter((i) => i.path !== path);
}
const empty = (v: any) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);

function ratingRange(e: any, c: Ctx, path: string) {
  const v = Number(e.ratingValue);
  const best = e.bestRating !== undefined ? Number(e.bestRating) : 5;
  const worst = e.worstRating !== undefined ? Number(e.worstRating) : 1;
  if (!isNaN(v) && !isNaN(best) && !isNaN(worst) && (v > best || v < worst)) err(c, join(path, 'ratingValue'), `ratingValue ${e.ratingValue} is outside ${worst}–${best}${e.bestRating === undefined ? ' (set bestRating if the scale is not 1–5)' : ''}`);
  for (const k of ['ratingCount', 'reviewCount']) {
    if (e[k] !== undefined && Number(e[k]) === 0) err(c, join(path, k), `${k} is 0: Google rejects ratings with no reviews; omit the rating until there are reviews`);
  }
}

function enumName(v: any): string {
  return typeName(String(v ?? ''));
}

function checkUrl(c: Ctx, path: string, v: string) {
  const s = v.trim();
  if (/^\/\//.test(s)) return warn(c, path, 'URL is protocol-relative ("//…"); use a full https:// URL');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return warn(c, path, `URL "${short(s)}" is relative; use a full https:// URL`);
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) warn(c, path, `URL uses ${u.protocol} instead of http(s)`);
    if (/\s/.test(s)) err(c, path, 'URL contains spaces');
  } catch {
    err(c, path, `"${short(s)}" is not a valid URL`);
  }
}

const short = (s: string) => (s.length > 60 ? s.slice(0, 57) + '…' : s);

/** Checks one property value's format. Objects are checked by their own type rules instead. */
function checkValue(c: Ctx, key: string, path: string, v: any, ownerTypes: string[]) {
  if (typeof v === 'object' && v !== null) return;
  if (typeof v === 'string' && !v.trim()) return warn(c, path, `"${key}" is empty`);
  if (typeof v === 'string' && URL_PROPS.has(key) && !(key === 'item' && !/[/.:]/.test(v))) return checkUrl(c, path, v);
  if (DATE_PROPS.has(key) && !ISO_DATE.test(String(v).trim())) return err(c, path, `"${v}" is not an ISO 8601 date (e.g. 2026-11-12 or 2026-11-12T09:30:00+00:00)`);
  if (NUM_PROPS.has(key)) {
    const s = String(v).trim();
    if (!NUMERIC.test(s)) {
      return key === 'price' || key === 'lowPrice' || key === 'highPrice'
        ? err(c, path, `Price "${short(s)}" must be a plain number like 1299.00 (no currency symbol or thousands separator)`)
        : err(c, path, `"${short(s)}" must be a number`);
    }
    if ((key === 'price' || key === 'lowPrice') && Number(s) === 0 && ownerTypes.some((t) => t === 'Offer' || t === 'AggregateOffer')) warn(c, path, 'Price is 0; Google may not show free or zero prices in Merchant listings');
    return;
  }
  if (key === 'priceCurrency' && !/^[A-Z]{3}$/.test(String(v).trim())) return err(c, path, `"${v}" is not a 3-letter ISO 4217 currency code (e.g. USD)`);
  if (key === 'availability' && !AVAILABILITY.includes(enumName(v))) return err(c, path, `"${short(String(v))}" is not a schema.org availability value (e.g. https://schema.org/InStock)`);
  if (key === 'itemCondition' && !CONDITION.includes(enumName(v))) return err(c, path, `"${short(String(v))}" is not a schema.org item condition (e.g. https://schema.org/NewCondition)`);
  if (/^gtin(8|12|13|14)?$/.test(key)) {
    const s = String(v).replace(/\s|-/g, '');
    if (!/^\d+$/.test(s) || ![8, 12, 13, 14].includes(s.length)) return err(c, path, `GTIN "${short(String(v))}" must be 8, 12, 13 or 14 digits`);
    if (key !== 'gtin' && s.length !== Number(key.slice(4))) return err(c, path, `${key} must have ${key.slice(4)} digits; this one has ${s.length}`);
  }
  if ((key === 'description' || key === 'name' || key === 'headline') && typeof v === 'string' && /<\/?(p|div|span|br|strong|ul|li|a)\b[^>]*>/i.test(v)) warn(c, path, `"${key}" contains HTML tags; use plain text`);
}

function featureOf(rule: Rule, e: any): string[] {
  if (!rule.feature) return [];
  const f = typeof rule.feature === 'function' ? rule.feature(e, (k) => !empty(e[k])) : rule.feature;
  return f ? f.split('|') : [];
}

// ─── walk ───────────────────────────────────────────────────────────────────

function ruleFor(t: string): Rule | undefined {
  return RULES[t] || (ALIASES[t] ? RULES[ALIASES[t]] : undefined);
}

function walk(node: any, path: string, c: Ctx, top: boolean): void {
  if (!node || typeof node !== 'object' || c.depth > 12 || c.visited.has(node)) return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, `${path}[${i}]`, c, false));
    return;
  }
  c.visited.add(node);
  c.depth++;
  const types = typesOf(node);
  if (!top) types.forEach((t) => c.nested.add(t));

  // Type-name mistakes
  for (const raw of arr(node['@type'])) {
    const t = typeName(String(raw));
    const known = KNOWN_TYPES.get(t.toLowerCase());
    if (known && known !== t) err(c, join(path, '@type'), `Type names are case-sensitive: "${t}" should be "${known}"`);
  }

  const before = c.issues.length;
  for (const t of types) {
    const rule = ruleFor(t);
    if (!rule) continue;
    const has = (k: string) => !empty(node[k]);
    for (const r of rule.required || []) {
      const keys = Array.isArray(r) ? r : [r];
      if (!keys.some(has)) err(c, join(path, keys[0]), keys.length > 1 ? `Missing required property: one of ${keys.map((k) => `"${k}"`).join(', ')}` : `Missing required property "${keys[0]}"`);
    }
    for (const r of rule.recommended || []) {
      const keys = Array.isArray(r) ? r : [r];
      if (!keys.some(has)) warn(c, join(path, keys[0]), keys.length > 1 ? `Missing recommended property: one of ${keys.map((k) => `"${k}"`).join(', ')}` : `Missing recommended property "${keys[0]}"`);
    }
    rule.check?.(node, c, path);
    if (rule.note) c.notes.add(rule.note);
  }
  const ownErrors = c.issues.slice(before).some((i) => i.level === 'error');

  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('@')) continue;
    const p = join(path, k);
    const n0 = c.issues.length;
    const vals = arr(v);
    vals.forEach((x, i) => {
      const pi = vals.length > 1 ? `${p}[${i}]` : p;
      if (onlyId(x)) return; // a reference to another node, validated where it is defined
      checkValue(c, k, pi, x, types);
      if (x && typeof x === 'object') {
        // A nested entity with no @type where the property expects one
        if (!x['@type'] && ['offers', 'aggregateRating', 'review', 'author', 'brand', 'address', 'reviewRating', 'acceptedAnswer'].includes(k) && !x['@value']) warn(c, pi, `"${k}" has no @type`);
        walk(x, pi, c, false);
      }
    });
    // A property counts as valid when nothing was flagged on it directly.
    if (!c.issues.slice(n0).some((i) => i.path === p || i.path.startsWith(p + '[') && !i.path.slice(p.length).includes('.'))) c.valid++;
  }
  c.depth--;

  if (!ownErrors) for (const t of types) for (const f of featureOf(ruleFor(t) || {}, node)) c.features.add(f);
}

/** Validates one top-level item. `fromJsonLd` adds the @context check. */
export function validateItem(item: any, page: PageContext, opts: { jsonLdContext?: 'ok' | 'missing' | 'other' } = {}): ValidationResult {
  const c: Ctx = { ...page, issues: [], valid: 0, features: new Set(), notes: new Set(), nested: new Set(), depth: 0, visited: new Set() };
  if (opts.jsonLdContext === 'missing') err(c, '@context', 'Missing "@context": "https://schema.org" (search engines ignore the block without it)');
  if (!typesOf(item).length) err(c, '@type', 'Missing @type');
  walk(item, '', c, true);
  // Features only when the whole item has no errors
  const hasErrors = c.issues.some((i) => i.level === 'error');
  return {
    valid: c.valid,
    issues: dedupe(c.issues),
    features: hasErrors ? [] : Array.from(c.features),
    notes: Array.from(c.notes),
    nestedTypes: Array.from(c.nested),
  };
}

function dedupe(issues: SchemaIssue[]): SchemaIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = i.level + i.path + i.message;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Store-wide facts used by item checks (return policy / shipping set once on the Organization). */
export function pageContext(entities: any[], resolve: (id: string) => any): PageContext {
  const orgs = entities.filter((e) => typesOf(e).some((t) => t === 'Organization' || ALIASES[t] === 'Organization' || ALIASES[t] === 'LocalBusiness'));
  return {
    resolve,
    orgReturnPolicy: orgs.some((o) => o.hasMerchantReturnPolicy),
    orgShipping: orgs.some((o) => o.hasShippingService || o.shippingDetails),
  };
}
