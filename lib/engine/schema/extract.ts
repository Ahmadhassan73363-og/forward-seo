import type { CheerioAPI } from 'cheerio';
import type { InvalidBlock, PageSchema, SchemaFormat, SchemaItem } from './types';
import { pageContext, typeName, typesOf, validateItem } from './validate';

/*
 * Finds every schema.org item on a page, in all three formats Google reads:
 * JSON-LD (<script type="application/ld+json">), Microdata (itemscope/itemprop) and RDFa (typeof/property).
 * Each top-level item (including each @graph member) is validated on its own.
 */

const MAX_ITEMS = 40;

type Raw = { format: SchemaFormat; data: any; context?: 'ok' | 'missing' | 'other' };

// ─── JSON-LD ────────────────────────────────────────────────────────────────

function contextOf(node: any, inherited?: 'ok' | 'missing' | 'other'): 'ok' | 'missing' | 'other' {
  const ctx = node?.['@context'];
  if (ctx === undefined) return inherited || 'missing';
  const s = JSON.stringify(ctx).toLowerCase();
  return s.includes('schema.org') ? 'ok' : 'other';
}

function jsonLd($: CheerioAPI, invalid: InvalidBlock[]): { items: Raw[]; other: number } {
  const items: Raw[] = [];
  let other = 0;
  $('script[type="application/ld+json" i]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e: any) {
      // Common theme mistakes Google also rejects: trailing commas, unescaped quotes, Liquid left in.
      invalid.push({ format: 'json-ld', error: String(e?.message || 'Invalid JSON').replace(/^JSON\.parse: /, '').slice(0, 160), snippet: raw.slice(0, 160) });
      return;
    }
    const push = (node: any, ctx?: 'ok' | 'missing' | 'other') => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach((n) => push(n, ctx));
      const c = contextOf(node, ctx);
      if (c === 'other') {
        other++;
        return;
      }
      if (node['@graph']) {
        push(node['@graph'], c);
        // A @graph wrapper may also carry its own @type
        if (!node['@type']) return;
      }
      // Bare references ({"@id": …}) are not items
      const keys = Object.keys(node).filter((k) => k !== '@context');
      if (keys.length === 1 && keys[0] === '@id') return;
      items.push({ format: 'json-ld', data: stripContext(node), context: c });
    };
    push(parsed);
  });
  return { items, other };
}

function stripContext(node: any) {
  if (!node || typeof node !== 'object' || !('@context' in node)) return node;
  const { ['@context']: _, ...rest } = node;
  return rest;
}

// ─── Microdata ──────────────────────────────────────────────────────────────

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function propValue($: CheerioAPI, el: any, read: (el: any) => any, scopeAttr: string): any {
  const $el = $(el);
  if ($el.is(`[${scopeAttr}]`)) return read(el);
  const content = $el.attr('content');
  if (content !== undefined) return content.trim();
  const tag = (el.tagName || el.name || '').toLowerCase();
  if (['a', 'link', 'area'].includes(tag)) return $el.attr('href') ?? '';
  if (['img', 'audio', 'embed', 'iframe', 'source', 'track', 'video'].includes(tag)) return $el.attr('src') ?? '';
  if (tag === 'object') return $el.attr('data') ?? '';
  if (tag === 'data' || tag === 'meter') return $el.attr('value') ?? '';
  if (tag === 'time') return $el.attr('datetime') ?? clean($el.text());
  return clean($el.text()).slice(0, 2000);
}

function addProp(obj: any, name: string, value: any) {
  if (obj[name] === undefined) obj[name] = value;
  else if (Array.isArray(obj[name])) obj[name].push(value);
  else obj[name] = [obj[name], value];
}

function microdata($: CheerioAPI): Raw[] {
  const read = (el: any, depth = 0): any => {
    const $el = $(el);
    const obj: any = {};
    const t = ($el.attr('itemtype') || '').trim().split(/\s+/).filter(Boolean).map(typeName);
    if (t.length) obj['@type'] = t.length === 1 ? t[0] : t;
    const id = $el.attr('itemid');
    if (id) obj['@id'] = id;
    if (depth > 10) return obj;
    const visit = (parent: any) => {
      $(parent)
        .children()
        .each((_, child) => {
          const $c = $(child);
          const props = ($c.attr('itemprop') || '').trim().split(/\s+/).filter(Boolean);
          if (props.length) {
            const v = $c.is('[itemscope]') ? read(child, depth + 1) : propValue($, child, read, 'itemscope');
            props.forEach((p) => addProp(obj, typeName(p), v));
          }
          // A nested item owns the properties inside it
          if (!$c.is('[itemscope]')) visit(child);
        });
    };
    visit(el);
    return obj;
  };
  const out: Raw[] = [];
  $('[itemscope]').each((_, el) => {
    if ($(el).is('[itemprop]')) return; // part of a parent item
    out.push({ format: 'microdata', data: read(el) });
  });
  return out;
}

// ─── RDFa (Lite) ────────────────────────────────────────────────────────────

function rdfa($: CheerioAPI): Raw[] {
  const read = (el: any, depth = 0): any => {
    const $el = $(el);
    const obj: any = {};
    const t = ($el.attr('typeof') || '').trim().split(/\s+/).filter(Boolean).map(typeName);
    if (t.length) obj['@type'] = t.length === 1 ? t[0] : t;
    const id = $el.attr('resource') || $el.attr('about');
    if (id) obj['@id'] = id;
    if (depth > 10) return obj;
    const visit = (parent: any) => {
      $(parent)
        .children()
        .each((_, child) => {
          const $c = $(child);
          const props = ($c.attr('property') || '').trim().split(/\s+/).filter(Boolean);
          if (props.length) {
            const v = $c.is('[typeof]') ? read(child, depth + 1) : $c.attr('resource') ?? propValue($, child, read, 'typeof');
            props.forEach((p) => addProp(obj, typeName(p), v));
          }
          if (!$c.is('[typeof]')) visit(child);
        });
    };
    visit(el);
    return obj;
  };
  const out: Raw[] = [];
  $('[typeof]').each((_, el) => {
    if ($(el).is('[property]')) return;
    // Only schema.org vocabulary (vocab attribute, schema: prefix, or full schema.org type URL)
    const vocab = ($(el).closest('[vocab]').attr('vocab') || '').toLowerCase();
    const tf = ($(el).attr('typeof') || '').toLowerCase();
    if (!vocab.includes('schema.org') && !tf.includes('schema')) return;
    out.push({ format: 'rdfa', data: read(el) });
  });
  return out;
}

// ─── storage trimming ───────────────────────────────────────────────────────

function trimValue(v: any, maxArr: number, maxStr: number, depth = 0): { v: any; cut: boolean } {
  let cut = false;
  const go = (x: any, d: number): any => {
    if (typeof x === 'string') {
      if (x.length > maxStr) {
        cut = true;
        return x.slice(0, maxStr) + '…';
      }
      return x;
    }
    if (!x || typeof x !== 'object') return x;
    if (d > 10) {
      cut = true;
      return '…';
    }
    if (Array.isArray(x)) {
      const keep = x.slice(0, maxArr).map((y) => go(y, d + 1));
      if (x.length > maxArr) {
        cut = true;
        keep.push(`… ${x.length - maxArr} more`);
      }
      return keep;
    }
    const o: any = {};
    for (const [k, y] of Object.entries(x)) o[k] = go(y, d + 1);
    return o;
  };
  return { v: go(v, depth), cut };
}

/** Keeps stored item data small: long arrays (variants, offers, reviews) and strings are shortened. */
export function trimForStorage(data: any, maxChars = 12_000): { data: any; trimmed: boolean } {
  for (const [a, s] of [[8, 600], [4, 300], [2, 160]] as const) {
    const r = trimValue(data, a, s);
    if (JSON.stringify(r.v).length <= maxChars) return { data: r.v, trimmed: r.cut };
  }
  return { data: { '@type': data?.['@type'], note: 'Too large to keep; see the page source' }, trimmed: true };
}

// ─── entry point ────────────────────────────────────────────────────────────

/** Extracts and validates all schema.org items on a page. */
export function scanSchema($: CheerioAPI): PageSchema {
  const invalid: InvalidBlock[] = [];
  const j = jsonLd($, invalid);
  const raws: Raw[] = [...j.items, ...microdata($), ...rdfa($)];

  // @id index across all formats, so references like {"@id": "#org"} resolve
  const byId = new Map<string, any>();
  const index = (n: any, d = 0) => {
    if (!n || typeof n !== 'object' || d > 12) return;
    if (Array.isArray(n)) return n.forEach((x) => index(x, d + 1));
    if (typeof n['@id'] === 'string' && Object.keys(n).length > 1 && !byId.has(n['@id'])) byId.set(n['@id'], n);
    for (const [k, v] of Object.entries(n)) if (!k.startsWith('@')) index(v, d + 1);
  };
  raws.forEach((r) => index(r.data));
  const all = raws.map((r) => r.data);
  const ctx = pageContext(all, (id) => byId.get(id));

  // Same main type marked up in two formats (e.g. theme microdata + app JSON-LD) can conflict
  const jsonTypes = new Set(raws.filter((r) => r.format === 'json-ld').flatMap((r) => typesOf(r.data)));

  const items: SchemaItem[] = raws.slice(0, MAX_ITEMS).map((r) => {
    const v = validateItem(r.data, ctx, { jsonLdContext: r.format === 'json-ld' ? r.context : undefined });
    const types = typesOf(r.data);
    if (r.format !== 'json-ld' && types.some((t) => ['Product', 'Organization', 'BreadcrumbList', 'WebSite', 'Article', 'BlogPosting'].includes(t) && jsonTypes.has(t))) {
      v.issues.push({ level: 'warning', path: '', message: `${types[0]} is also marked up as JSON-LD on this page; duplicate markup can give search engines conflicting data` });
    }
    const t = trimForStorage(r.data);
    return {
      format: r.format,
      type: types[0] || 'Thing',
      types: types.length ? types : ['Thing'],
      nestedTypes: v.nestedTypes,
      id: typeof r.data?.['@id'] === 'string' ? r.data['@id'] : undefined,
      data: t.data,
      trimmed: t.trimmed || undefined,
      valid: v.valid,
      issues: v.issues,
      features: v.features,
      notes: v.notes,
    };
  });

  // Same Product described twice in JSON-LD
  const products = items.filter((i) => i.format === 'json-ld' && i.types.some((t) => t === 'Product'));
  if (products.length > 1) {
    products.slice(1).forEach((p) => p.issues.push({ level: 'warning', path: '', message: `${products.length} separate Product items on one page; search engines may pick the wrong one` }));
  }

  return { items, invalid, otherVocab: j.other || undefined };
}
