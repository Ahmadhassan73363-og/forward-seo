import type { AiPrompt } from '../integration-types';
import { mentions } from '../brand';

/*
 * The question set sent to every AI engine. Real buyer language first:
 *   1. your own prompts (audit form)
 *   2. one brand question and one comparison question
 *   3. the store's top non-brand Search Console queries, asked as shopping questions
 *   4. the store's largest collections, asked as shopping questions
 * Capped by AI_PROBE_MAX_PROMPTS. Every prompt records where it came from.
 */

const GENERIC_COLLECTIONS = /^(all|all products|products|sale|sales|new|new arrivals|home ?page|frontpage|best ?sellers?|featured|shop|shop all|gift ?cards?|clearance|outlet|latest|trending|community favorites|staff picks)$/i;
// Merchandising / internal collections that buyers would never search for.
const INTERNAL_COLLECTIONS =
  /\b(eligible|exclud\w*|includ\w*|msrp|tier|markdown|final sale|full price|hidden|test|internal|do not|don't|gwp|bogo\w*|bfcm|black friday|cyber monday|promo\w*|discount\w*|all products|feed|google|facebook|meta|tiktok|klaviyo|bundle builder|upsell|cross.?sell|search|friends and family|vip|wholesale|employee|staff|archive\w*|draft|copy|collection|q[1-4]|20\d\d|cart|checkout|season|birthday|anniversary|launch|drop)\b|\d+\s*-\s*\d+|[()[\]{}#!]/i;

/** Collection titles that make sense as shopping questions or search keywords (heuristic). */
export function buyerCollections(collections: Array<{ title: string; count?: number }>, brandTerms: string[]): Array<{ title: string; count?: number }> {
  const seen = new Set<string>();
  return collections
    .map((c) => ({ ...c, title: c.title.trim().replace(/^all\s+/i, '') })) // "All Shoes" → "Shoes"
    .filter((c) => {
      const t = c.title;
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return t.length >= 4 && t.split(/\s+/).length <= 4 && !GENERIC_COLLECTIONS.test(t) && !INTERNAL_COLLECTIONS.test(t) && !mentions(t, brandTerms);
    })
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
}

export function buildPrompts(args: {
  brand: string;
  brandTerms: string[];
  domain: string;
  competitors: Array<{ name: string }>;
  custom: string[];
  queries: string[];
  collections: Array<{ title: string; count?: number }>;
  max: number;
}): AiPrompt[] {
  const out: AiPrompt[] = [];
  const seen = new Set<string>();
  const add = (p: AiPrompt) => {
    const key = p.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key) || out.length >= args.max) return;
    seen.add(key);
    out.push(p);
  };

  for (const c of args.custom) add({ text: c.trim(), group: mentions(c, args.brandTerms) ? 'brand' : 'shopping', source: 'your prompt' });

  add({ text: `What is ${args.brand} (${args.domain})? Is it a good place to buy from?`, group: 'brand', source: 'brand question' });
  if (args.competitors[0]) add({ text: `${args.brand} or ${args.competitors[0].name}: which is better to buy from, and why?`, group: 'comparison', source: 'comparison with your first competitor' });
  else add({ text: `What are the best alternatives to ${args.brand}?`, group: 'comparison', source: 'alternatives question' });

  const queries = args.queries.filter((q) => q.length >= 3 && !mentions(q, args.brandTerms));
  const collections = buyerCollections(args.collections, args.brandTerms);
  // Alternate Search Console queries and collections so both kinds are covered.
  for (let i = 0; out.length < args.max && (i < queries.length || i < collections.length); i++) {
    if (queries[i]) add({ text: `What are the best options for "${queries[i]}"? Recommend specific brands, products and stores.`, group: 'shopping', source: `Search Console query "${queries[i]}"` });
    if (collections[i]) add({ text: `Where should I buy ${collections[i].title.toLowerCase()} online? Recommend specific brands, products and stores.`, group: 'shopping', source: `collection "${collections[i].title}"` });
  }
  return out;
}

/** Product names worth matching in answers: the part before " - " / " | ", at least 2 words or 8 characters. */
export function productMatchNames(titles: string[]): string[] {
  const names = new Set<string>();
  for (const t of titles) {
    const core = t.split(/\s[-|–—]\s/)[0].trim().toLowerCase();
    if (core.length >= 8 || (core.split(/\s+/).length >= 2 && core.length >= 6)) names.add(core);
  }
  return Array.from(names).slice(0, 300);
}
