import type { AiInput } from './integration-types';

/*
 * Brand and competitor names for the brand-related checks (Search Console brand split, AI
 * visibility, AI Overviews). Taken from the audit inputs; without them, the brand comes from the
 * domain ("rdxsports.co.uk" → "Rdxsports"), which is a guess the report says it made.
 */

const SUFFIXES = /\.(co|com|net|org|gov|ac|edu)?\.?[a-z]{2,}$/;

/** "www.rdxsports.co.uk" → "rdxsports" */
export function domainLabel(host: string): string {
  let h = host.toLowerCase().replace(/^www\./, '');
  h = h.replace(/\.(co|com|net|org)\.[a-z]{2}$/, '').replace(/\.[a-z]{2,}$/, '');
  return h.split('.').pop() || h.replace(SUFFIXES, '');
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface BrandInfo {
  brand: string;
  /** Lower-case terms that count as the brand (name, name without spaces, domain label, domain). */
  terms: string[];
  /** True when the brand name was guessed from the domain. */
  guessed: boolean;
}

export function brandInfo(host: string, input?: AiInput): BrandInfo {
  const label = domainLabel(host);
  const bare = host.toLowerCase().replace(/^www\./, '');
  const name = input?.brand?.trim() || titleCase(label);
  const terms = new Set([name.toLowerCase(), name.toLowerCase().replace(/\s+/g, ''), label, bare].filter((t) => t.length >= 3));
  return { brand: name, terms: Array.from(terms), guessed: !input?.brand?.trim() };
}

/** Competitors from inputs: "On Running", "hoka.com", "https://www.nike.com" → name + match terms + domain. */
export function competitorList(input?: AiInput): Array<{ name: string; terms: string[]; domain?: string }> {
  const out: Array<{ name: string; terms: string[]; domain?: string }> = [];
  for (const raw of input?.competitors || []) {
    const v = raw.trim();
    if (!v) continue;
    const looksLikeDomain = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(v) && !/\s/.test(v);
    if (looksLikeDomain) {
      const domain = v.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase().replace(/^www\./, '');
      const label = domainLabel(domain);
      out.push({ name: titleCase(label), terms: Array.from(new Set([label, domain].filter((t) => t.length >= 3))), domain });
    } else {
      const lower = v.toLowerCase();
      out.push({ name: v, terms: Array.from(new Set([lower, lower.replace(/\s+/g, '')].filter((t) => t.length >= 2))) });
    }
  }
  return out.slice(0, 10);
}

/** Whole-word, case-insensitive: does the text mention any of these terms? */
export function mentions(text: string, terms: string[]): boolean {
  const t = text.toLowerCase();
  return terms.some((term) => {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c);
    return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(t);
  });
}

/** Validates the optional AI inputs from a request body (lengths and counts are capped). */
export function parseAiInput(v: any): AiInput | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const list = (x: unknown, split: RegExp, max: number, len: number) =>
    (Array.isArray(x) ? x : typeof x === 'string' ? x.split(split) : [])
      .map((s) => String(s).trim().slice(0, len))
      .filter(Boolean)
      .slice(0, max);
  const brand = typeof v.brand === 'string' ? v.brand.trim().slice(0, 80) : '';
  const competitors = list(v.competitors, /[\n,]/, 10, 120);
  const prompts = list(v.prompts, /\n/, 50, 400); // questions may contain commas
  if (!brand && !competitors.length && !prompts.length) return undefined;
  return { ...(brand ? { brand } : {}), ...(competitors.length ? { competitors } : {}), ...(prompts.length ? { prompts } : {}) };
}
