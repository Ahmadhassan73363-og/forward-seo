import type { ChecklistRule, PageSchema, SchemaFormat, SchemaIssue } from './types';

/*
 * Site-wide structured data summary, built from the per-page scans. Runs in the browser (Schema tab)
 * so the checklist can be edited without re-running the audit.
 */

/**
 * What each page template should carry. Based on Google's ecommerce structured data guidance:
 * Organization + WebSite on the homepage, Product (with Offer) + BreadcrumbList on products,
 * BreadcrumbList + a list on collections, Article on blog posts.
 */
export const DEFAULT_CHECKLIST: ChecklistRule[] = [
  { id: 'home-org', template: 'home', anyOf: ['Organization', 'OnlineStore', 'OnlineBusiness', 'Corporation', 'LocalBusiness', 'Store'], level: 'required', why: 'Brand name, logo and social profiles for the knowledge panel and AI answers.' },
  { id: 'home-website', template: 'home', anyOf: ['WebSite'], level: 'required', why: 'Gives Google the site name shown in results.' },
  { id: 'product-product', template: 'product', anyOf: ['Product', 'ProductGroup'], level: 'required', why: 'Price, stock and rating in results; needed for free Merchant listings.' },
  { id: 'product-offer', template: 'product', anyOf: ['Offer', 'AggregateOffer'], level: 'required', why: 'Price and availability. Without an Offer there is no price in results.' },
  { id: 'product-breadcrumb', template: 'product', anyOf: ['BreadcrumbList'], level: 'recommended', why: 'Shows the category path instead of a raw URL.' },
  { id: 'product-rating', template: 'product', anyOf: ['AggregateRating', 'Review'], level: 'recommended', why: 'Star ratings in results (needs real reviews on the page).' },
  { id: 'product-return', template: 'product', anyOf: ['MerchantReturnPolicy'], level: 'recommended', siteWide: true, why: 'Return policy in Merchant listings (or set it once on the Organization).' },
  { id: 'product-shipping', template: 'product', anyOf: ['OfferShippingDetails', 'ShippingService'], level: 'recommended', siteWide: true, why: 'Shipping cost and delivery time in Merchant listings.' },
  { id: 'collection-breadcrumb', template: 'collection', anyOf: ['BreadcrumbList'], level: 'recommended', why: 'Shows the category path instead of a raw URL.' },
  { id: 'collection-list', template: 'collection', anyOf: ['CollectionPage', 'ItemList'], level: 'recommended', why: 'Tells search and AI engines this page lists products.' },
  { id: 'article-article', template: 'article', anyOf: ['Article', 'BlogPosting', 'NewsArticle'], level: 'required', why: 'Headline, image, author and dates for article results.' },
  { id: 'article-breadcrumb', template: 'article', anyOf: ['BreadcrumbList'], level: 'recommended', why: 'Shows the blog path instead of a raw URL.' },
  { id: 'faq', template: '*', anyOf: ['FAQPage'], level: 'recommended', when: 'hasFaq', why: 'The page has FAQ content. FAQPage markup helps AI answers (Google shows FAQ rich results only for government and health sites).' },
];

export const TEMPLATES: Array<{ id: string; label: string }> = [
  { id: '*', label: 'All pages' },
  { id: 'home', label: 'Homepage' },
  { id: 'product', label: 'Product' },
  { id: 'collection', label: 'Collection' },
  { id: 'article', label: 'Blog post' },
  { id: 'blog', label: 'Blog' },
  { id: 'page', label: 'Page' },
  { id: 'other', label: 'Other' },
];

export interface ScanPage {
  url: string;
  type: string;
  hasFaq?: boolean;
  schema?: PageSchema;
}

export interface TypeSummary {
  type: string;
  items: number;
  pages: number;
  formats: SchemaFormat[];
  valid: number;
  errors: number;
  warnings: number;
}

export interface IssueGroup {
  level: SchemaIssue['level'];
  type: string;
  path: string;
  message: string;
  pages: string[];
  items: number;
}

export interface ChecklistRow {
  rule: ChecklistRule;
  /** Pages of this template that were scanned */
  pages: number;
  passing: number;
  missing: string[];
  status: 'pass' | 'partial' | 'fail' | 'na';
}

export interface SchemaReport {
  scanned: number;
  withSchema: number;
  items: number;
  formats: Record<SchemaFormat, number>;
  invalidBlocks: number;
  valid: number;
  errors: number;
  warnings: number;
  types: TypeSummary[];
  features: Array<{ feature: string; pages: number }>;
  issues: IssueGroup[];
  notes: string[];
  checklist: ChecklistRow[];
}

/** All types on a page, top-level and nested. */
export function pageTypes(s?: PageSchema): Set<string> {
  const out = new Set<string>();
  for (const i of s?.items || []) {
    i.types.forEach((t) => out.add(t));
    i.nestedTypes.forEach((t) => out.add(t));
  }
  return out;
}

const normPath = (p: string) => p.replace(/\[\d+\]/g, '[]');

const ORG_TYPES = new Set(['Organization', 'OnlineStore', 'OnlineBusiness', 'Corporation', 'LocalBusiness', 'Store']);

export function evaluateChecklist(pages: ScanPage[], rules: ChecklistRule[]): ChecklistRow[] {
  // Types declared once for the whole store (e.g. a return policy on the Organization)
  const siteTypes = new Set<string>();
  for (const p of pages) for (const i of p.schema?.items || []) if (i.types.some((t) => ORG_TYPES.has(t))) i.nestedTypes.forEach((t) => siteTypes.add(t));
  return rules.map((rule) => {
    const siteWide = !!rule.siteWide && rule.anyOf.some((t) => siteTypes.has(t));
    const scope = pages.filter((p) => (rule.template === '*' || p.type === rule.template) && (!rule.when || p[rule.when]));
    const missing = scope.filter((p) => {
      const types = pageTypes(p.schema);
      return !siteWide && !rule.anyOf.some((t) => types.has(t));
    });
    const passing = scope.length - missing.length;
    const status = !scope.length ? 'na' : !missing.length ? 'pass' : passing ? 'partial' : 'fail';
    return { rule, pages: scope.length, passing, missing: missing.map((p) => p.url), status };
  });
}

export function buildSchemaReport(pages: ScanPage[], rules: ChecklistRule[] = DEFAULT_CHECKLIST): SchemaReport {
  const scanned = pages.filter((p) => p.schema);
  const formats: Record<SchemaFormat, number> = { 'json-ld': 0, microdata: 0, rdfa: 0 };
  const types = new Map<string, TypeSummary & { pageSet: Set<string>; formatSet: Set<SchemaFormat> }>();
  const features = new Map<string, Set<string>>();
  const issues = new Map<string, IssueGroup & { pageSet: Set<string> }>();
  const notes = new Set<string>();
  let items = 0, valid = 0, errors = 0, warnings = 0, invalidBlocks = 0;

  for (const p of scanned) {
    const s = p.schema!;
    invalidBlocks += s.invalid.length;
    errors += s.invalid.length;
    for (const b of s.invalid) {
      const k = `error|json|${b.error}`;
      const g = issues.get(k) || { level: 'error' as const, type: 'JSON-LD', path: '', message: `Invalid JSON-LD block: ${b.error}`, pages: [], items: 0, pageSet: new Set<string>() };
      g.items++;
      g.pageSet.add(p.url);
      issues.set(k, g);
    }
    for (const it of s.items) {
      items++;
      formats[it.format]++;
      valid += it.valid;
      const e = it.issues.filter((i) => i.level === 'error').length;
      const w = it.issues.length - e;
      errors += e;
      warnings += w;
      const t = types.get(it.type) || { type: it.type, items: 0, pages: 0, formats: [], valid: 0, errors: 0, warnings: 0, pageSet: new Set<string>(), formatSet: new Set<SchemaFormat>() };
      t.items++;
      t.valid += it.valid;
      t.errors += e;
      t.warnings += w;
      t.pageSet.add(p.url);
      t.formatSet.add(it.format);
      types.set(it.type, t);
      for (const f of it.features) (features.get(f) || features.set(f, new Set()).get(f)!).add(p.url);
      it.notes.forEach((n) => notes.add(n));
      for (const i of it.issues) {
        const path = normPath(i.path);
        const k = `${i.level}|${it.type}|${path}|${i.message.replace(/"[^"]{20,}"/g, '"…"')}`;
        const g = issues.get(k) || { level: i.level, type: it.type, path, message: i.message, pages: [], items: 0, pageSet: new Set<string>() };
        g.items++;
        g.pageSet.add(p.url);
        issues.set(k, g);
      }
    }
  }

  return {
    scanned: scanned.length,
    withSchema: scanned.filter((p) => p.schema!.items.length || p.schema!.invalid.length).length,
    items,
    formats,
    invalidBlocks,
    valid,
    errors,
    warnings,
    types: Array.from(types.values())
      .map(({ pageSet, formatSet, ...t }) => ({ ...t, pages: pageSet.size, formats: Array.from(formatSet) }))
      .sort((a, b) => b.pages - a.pages || b.items - a.items),
    features: Array.from(features.entries()).map(([feature, s]) => ({ feature, pages: s.size })).sort((a, b) => b.pages - a.pages),
    issues: Array.from(issues.values())
      .map(({ pageSet, ...g }) => ({ ...g, pages: Array.from(pageSet) }))
      .sort((a, b) => (a.level === b.level ? b.pages.length - a.pages.length : a.level === 'error' ? -1 : 1)),
    notes: Array.from(notes),
    checklist: evaluateChecklist(scanned, rules),
  };
}

/** Parses a user checklist line like "product: Product, BreadcrumbList" or "home! Organization". */
export function parseChecklistLine(line: string): ChecklistRule | null {
  const m = line.trim().match(/^([*a-z]+)\s*([:!])\s*(.+)$/i);
  if (!m) return null;
  const template = m[1].toLowerCase();
  if (!TEMPLATES.some((t) => t.id === template)) return null;
  const anyOf = m[3].split(/[,|]/).map((s) => s.trim()).filter((s) => /^[A-Za-z][A-Za-z0-9]*$/.test(s));
  if (!anyOf.length) return null;
  return { id: `custom-${template}-${anyOf.join('-')}`, template, anyOf, level: m[2] === '!' ? 'required' : 'recommended', custom: true };
}
