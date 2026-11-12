// SEO + AI SEO KPI registry: turns one run into dashboard tiles (and CSV rows for Looker Studio).
// Pure and dependency-free, so the browser and the server share it. Nothing here estimates or
// fills in values: a KPI without data says why ("Not connected", "No access", "Failed").

import type { Run } from './types';

export type KpiKind = 'measured' | 'estimated' | 'sampled';
export type KpiFormat = 'int' | 'pct' | 'position' | 'money' | 'ms' | 'cls' | 'score' | 'text';
export type KpiStatus = 'ok' | 'not_connected' | 'no_access' | 'failed' | 'no_data';

export interface Kpi {
  id: string;
  section: 'seo' | 'ai';
  label: string;
  status: KpiStatus;
  value?: number;
  text?: string;
  format: KpiFormat;
  /** Sampled KPIs: x of n. */
  numerator?: number;
  denominator?: number;
  previous?: number;
  /** Daily (or weekly) values from the source, oldest first, for a sparkline. */
  series?: number[];
  /** Lower is better (position, LCP …): flips the colour of the change. */
  lowerIsBetter?: boolean;
  source: string;
  /** Source ids for the UI's source marks (searchConsole, ga4, merchant, ahrefs, semrush, crux, audit, chatgpt, perplexity, gemini, dataforseo, otterly). */
  sourceIds?: string[];
  kind: KpiKind;
  range?: string;
  note?: string;
  /** Docs page that explains how to connect the source. */
  setup?: string;
}

type Src = { status: string; message?: string } | undefined;
const stateOf = (d: Src): KpiStatus | undefined =>
  !d ? 'not_connected' : d.status === 'no_access' || d.status === 'no_report' ? 'no_access' : d.status === 'unavailable' ? 'failed' : undefined;
const why = (d: Src, fallback: string) => (d && d.status !== 'ok' && d.status !== 'partial' ? d.message || fallback : undefined);
const ratio = (x?: number, n?: number) => (x !== undefined && n ? x / n : undefined);

export function buildKpis(run: Run): Kpi[] {
  const k: Kpi[] = [];
  const add = (x: Kpi) => k.push(x);
  const gsc = run.searchConsole;
  const ga4 = run.ga4;
  const mc = run.merchant;
  const ai = run.aiVisibility;
  const aio = run.aiOverviews;
  const ot = run.otterly;
  const gscRange = gsc?.range ? `${gsc.range.start} – ${gsc.range.end}` : undefined;
  const ga4Range = ga4?.range ? `${ga4.range.start} – ${ga4.range.end}` : undefined;
  const gscBase = { source: 'Search Console', kind: 'measured' as const, range: gscRange, setup: 'SEARCH_CONSOLE.md', status: stateOf(gsc) || 'ok', note: why(gsc, 'Search Console unavailable') };
  const ga4Base = { source: 'GA4', kind: 'measured' as const, range: ga4Range, setup: 'SEO_AI_INTEGRATIONS.md#ga4', status: stateOf(ga4) || 'ok', note: why(ga4, 'GA4 unavailable') };

  // ─── SEO ───
  add({ ...gscBase, id: 'organic_clicks', section: 'seo', label: 'Organic clicks', format: 'int', value: gsc?.totals?.clicks, previous: gsc?.previous?.clicks });
  add({ ...gscBase, id: 'organic_impressions', section: 'seo', label: 'Organic impressions', format: 'int', value: gsc?.totals?.impressions, previous: gsc?.previous?.impressions });
  add({ ...gscBase, id: 'avg_position', section: 'seo', label: 'Average position', format: 'position', value: gsc?.totals?.position, previous: gsc?.previous?.position, lowerIsBetter: true });
  const insp = (gsc?.inspections || []).filter((i) => !i.error);
  add({
    ...gscBase,
    id: 'indexed_pages',
    section: 'seo',
    label: 'Indexed pages (inspected)',
    kind: 'sampled',
    format: 'pct',
    numerator: insp.length ? insp.filter((i) => i.verdict === 'PASS').length : undefined,
    denominator: insp.length || undefined,
    value: insp.length ? insp.filter((i) => i.verdict === 'PASS').length / insp.length : undefined,
    note: gscBase.note || 'URL Inspection of the homepage and top pages; Google has no API for the total indexed count.',
    status: gscBase.status === 'ok' && !insp.length ? 'no_data' : gscBase.status,
  });
  const tpl = (t: string) => gsc?.templates?.find((x) => x.template === t);
  add({ ...gscBase, id: 'product_clicks', section: 'seo', label: 'Product page clicks', format: 'int', value: tpl('product')?.clicks, note: gscBase.note || (tpl('product') ? `${(tpl('product')!.impressions ?? 0).toLocaleString()} impressions` : undefined) });
  add({ ...gscBase, id: 'collection_clicks', section: 'seo', label: 'Collection page clicks', format: 'int', value: tpl('collection')?.clicks, note: gscBase.note || (tpl('collection') ? `${(tpl('collection')!.impressions ?? 0).toLocaleString()} impressions` : undefined) });
  if (gsc?.brandSplit) {
    const b = gsc.brandSplit;
    add({ ...gscBase, id: 'nonbrand_click_share', section: 'seo', label: 'Non-brand share of clicks', format: 'pct', numerator: b.nonBrand.clicks, denominator: (b.brand.clicks ?? 0) + (b.nonBrand.clicks ?? 0), value: ratio(b.nonBrand.clicks, (b.brand.clicks ?? 0) + (b.nonBrand.clicks ?? 0)), note: `Brand terms: ${b.terms.join(', ')}` });
  }

  add({ ...ga4Base, id: 'organic_sessions', section: 'seo', label: 'Organic sessions', format: 'int', value: ga4?.organic?.sessions, previous: ga4?.organicPrevious?.sessions });
  add({ ...ga4Base, id: 'organic_conversion_rate', section: 'seo', label: 'Organic conversion rate', format: 'pct', value: ga4?.organicConversionRate, previous: ga4?.organicConversionRatePrevious, note: ga4Base.note || 'Organic purchases ÷ organic sessions' });
  add({ ...ga4Base, id: 'organic_revenue', section: 'seo', label: 'Organic revenue', format: 'money', value: ga4?.organic?.revenue, previous: ga4?.organicPrevious?.revenue });

  const se = run.ahrefs?.siteExplorer;
  const refd = se?.backlinks?.liveRefdomains ?? run.semrush?.backlinks?.referringDomains;
  const refSource = se?.backlinks?.liveRefdomains !== undefined ? 'Ahrefs' : run.semrush?.backlinks?.referringDomains !== undefined ? 'Semrush' : run.ahrefs ? 'Ahrefs' : run.semrush ? 'Semrush' : 'Ahrefs / Semrush';
  add({ id: 'referring_domains', section: 'seo', label: 'Referring domains', format: 'int', value: refd, source: refSource, kind: 'estimated', status: run.ahrefs || run.semrush ? (refd === undefined ? 'no_data' : 'ok') : 'not_connected', note: 'Growth needs history; this audit shows the current value.', setup: 'AHREFS.md' });
  const dr = run.ahrefs?.domainRating?.value;
  const as = run.semrush?.backlinks?.authorityScore;
  add({ id: 'authority', section: 'seo', label: dr !== undefined ? 'Domain Rating' : 'Authority Score', format: 'score', value: dr ?? as, source: dr !== undefined ? 'Ahrefs' : 'Semrush', kind: 'estimated', status: run.ahrefs || run.semrush ? (dr ?? as) === undefined ? 'no_data' : 'ok' : 'not_connected', setup: 'AHREFS.md' });

  const phone = run.crux?.phone;
  add({ id: 'lcp', section: 'seo', label: 'LCP (real users, phone)', format: 'ms', value: phone?.lcpMs ?? undefined, lowerIsBetter: true, source: 'Chrome UX Report', kind: 'measured', status: phone?.lcpMs != null ? 'ok' : 'no_data', note: phone?.lcpMs != null ? (phone.lcpMs <= 2500 ? 'Good (≤ 2.5 s)' : phone.lcpMs <= 4000 ? 'Needs improvement' : 'Poor') : run.crux?.message, range: phone?.period });
  add({ id: 'inp', section: 'seo', label: 'INP (real users, phone)', format: 'ms', value: phone?.inpMs ?? undefined, lowerIsBetter: true, source: 'Chrome UX Report', kind: 'measured', status: phone?.inpMs != null ? 'ok' : 'no_data', note: phone?.inpMs != null ? (phone.inpMs <= 200 ? 'Good (≤ 200 ms)' : phone.inpMs <= 500 ? 'Needs improvement' : 'Poor') : undefined, range: phone?.period });
  add({ id: 'cls', section: 'seo', label: 'CLS (real users, phone)', format: 'cls', value: phone?.cls ?? undefined, lowerIsBetter: true, source: 'Chrome UX Report', kind: 'measured', status: phone?.cls != null ? 'ok' : 'no_data', note: phone?.cls != null ? (phone.cls <= 0.1 ? 'Good (≤ 0.1)' : phone.cls <= 0.25 ? 'Needs improvement' : 'Poor') : undefined, range: phone?.period });

  const sd = run.scores?.modules.find((m) => m.id === 'structured_data');
  add({ id: 'structured_data', section: 'seo', label: 'Structured data score', format: 'score', value: sd?.score ?? undefined, source: 'This audit (crawl)', kind: 'measured', status: sd?.score != null ? 'ok' : 'no_data', note: sd ? `${sd.findings} finding${sd.findings === 1 ? '' : 's'}` : undefined });

  const mcBase = { source: 'Merchant Center', kind: 'measured' as const, range: mc?.range ? `${mc.range.start} – ${mc.range.end}` : undefined, setup: 'SEO_AI_INTEGRATIONS.md#merchant-center', status: stateOf(mc) || 'ok', note: why(mc, 'Merchant Center unavailable') };
  add({ ...mcBase, id: 'free_listing_clicks', section: 'seo', label: 'Free listing clicks', format: 'int', value: mc?.freeListings?.clicks, previous: mc?.freeListingsPrevious?.clicks, note: mcBase.note || (mc?.freeListings ? `${(mc.freeListings.impressions ?? 0).toLocaleString()} impressions` : undefined) });
  add({ ...mcBase, id: 'disapproved_products', section: 'seo', label: 'Disapproved products', format: 'int', value: mc?.products?.disapproved, lowerIsBetter: true, note: mcBase.note || (mc?.products ? `of ${mc.products.total.toLocaleString()} products${mc.products.truncated ? ' (first part of the catalog)' : ''}` : undefined) });

  // ─── AI SEO ───
  const aiBase = { source: 'AI probes (API)', kind: 'sampled' as const, setup: 'SEO_AI_INTEGRATIONS.md#ai-visibility', range: ai ? ai.fetchedAt.slice(0, 10) : undefined };
  if (!ai) {
    add({ ...aiBase, id: 'ai_brand_mentions', section: 'ai', label: 'AI brand mentions', format: 'pct', status: 'not_connected' });
  } else {
    for (const e of ai.engines) {
      const st: KpiStatus = e.answered ? 'ok' : 'failed';
      const n = e.answered || undefined;
      add({ ...aiBase, id: `ai_mentions_${e.engine}`, section: 'ai', label: `${e.label.split(' (')[0]} brand mentions`, format: 'pct', status: st, numerator: e.brandMentions, denominator: n, value: ratio(e.brandMentions, n), note: e.model ? `model ${e.model}` : undefined });
      add({ ...aiBase, id: `ai_citations_${e.engine}`, section: 'ai', label: `${e.label.split(' (')[0]} citations of your site`, format: 'pct', status: st, numerator: e.storeCitations, denominator: n, value: ratio(e.storeCitations, n) });
    }
    const shop = ai.engines.reduce((s, e) => s + e.shoppingAnswered, 0);
    const rec = ai.engines.reduce((s, e) => s + e.productRecommendations, 0);
    add({ ...aiBase, id: 'ai_product_recs', section: 'ai', label: 'Product recommendation frequency', format: 'pct', status: shop ? 'ok' : 'no_data', numerator: rec, denominator: shop || undefined, value: ratio(rec, shop), note: ai.productNamesChecked ? `Shopping prompts naming one of ${ai.productNamesChecked} products or citing a product page` : 'Shopping prompts citing a product page (no product names available)' });
    const total = ai.shareOfVoice.reduce((s, x) => s + x.mentions, 0);
    const me = ai.shareOfVoice.find((x) => x.isStore);
    add({ ...aiBase, id: 'ai_share_of_voice', section: 'ai', label: 'AI share of voice vs competitors', format: 'pct', status: ai.competitors.length ? (total ? 'ok' : 'no_data') : 'no_data', numerator: me?.mentions, denominator: total || undefined, value: ratio(me?.mentions, total), note: ai.competitors.length ? `Competitors: ${ai.competitors.map((c) => c.name).join(', ')}` : 'Add competitor brands in the audit form' });
    add({ ...aiBase, id: 'ai_cited_urls', section: 'ai', label: 'Your URLs cited by AI', format: 'int', status: 'ok', value: ai.storeUrlsCited.length, note: ai.citedDomains[0] ? `Most cited site: ${ai.citedDomains[0].domain} (${ai.citedDomains[0].count}×)` : undefined });
  }

  const aioBase = { source: 'Google results (DataForSEO)', kind: 'sampled' as const, setup: 'SEO_AI_INTEGRATIONS.md#ai-overviews', range: aio ? `${aio.location}, ${aio.fetchedAt.slice(0, 10)}` : undefined, status: stateOf(aio) || 'ok', note: why(aio, 'AI Overview check failed') };
  const checked = aio?.keywords.filter((x) => x.ok) || [];
  const withAio = checked.filter((x) => x.hasAio);
  add({ ...aioBase, id: 'aio_presence', section: 'ai', label: 'Keywords with an AI Overview', format: 'pct', numerator: aio ? withAio.length : undefined, denominator: checked.length || undefined, value: ratio(withAio.length, checked.length) });
  add({ ...aioBase, id: 'aio_citations', section: 'ai', label: 'AI Overviews citing your site', format: 'pct', numerator: aio ? withAio.filter((x) => x.storeCited).length : undefined, denominator: withAio.length || undefined, value: ratio(withAio.filter((x) => x.storeCited).length, withAio.length), status: aioBase.status === 'ok' && aio && !withAio.length ? 'no_data' : aioBase.status });

  add({ ...ga4Base, id: 'ai_sessions', section: 'ai', label: 'AI-referred sessions', format: 'int', value: ga4?.aiReferrals?.total.sessions, previous: ga4?.aiReferrals?.previousTotal?.sessions, note: ga4Base.note || 'Lower bound: many AI visits arrive without a referrer' });
  add({ ...ga4Base, id: 'ai_revenue', section: 'ai', label: 'AI-referred revenue', format: 'money', value: ga4?.aiReferrals?.total.revenue, previous: ga4?.aiReferrals?.previousTotal?.revenue });

  if (ot) {
    const otBase = { source: 'Otterly.AI', kind: 'sampled' as const, setup: 'SEO_AI_INTEGRATIONS.md#otterly', range: ot.range ? `${ot.range.start} – ${ot.range.end}` : undefined, status: stateOf(ot) || 'ok', note: why(ot, 'Otterly unavailable') };
    add({ ...otBase, id: 'otterly_sov', section: 'ai', label: 'Otterly share of voice', format: 'text', text: ot.summary?.shareOfVoice !== undefined ? String(ot.summary.shareOfVoice) : undefined, note: otBase.note || 'As reported by Otterly' });
    add({ ...otBase, id: 'otterly_coverage', section: 'ai', label: 'Otterly brand coverage', format: 'text', text: ot.summary?.brandCoverage !== undefined ? String(ot.summary.brandCoverage) : undefined, note: otBase.note || (ot.totalPrompts !== undefined ? `${ot.totalPrompts} prompts tracked in Otterly` : undefined) });
  }

  // A connected source that returned nothing for a KPI shows "No data", never 0.
  for (const x of k) if (x.status === 'ok' && x.value === undefined && x.text === undefined) x.status = 'no_data';

  // Trend series the sources already returned (nothing is stored between audits).
  const series = (vals: Array<number | null | undefined> | undefined) => {
    const v = (vals || []).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    return v.length >= 3 ? v : undefined;
  };
  const SERIES: Record<string, number[] | undefined> = {
    organic_clicks: series(gsc?.daily?.map((d) => d.clicks)),
    organic_impressions: series(gsc?.daily?.map((d) => d.impressions)),
    avg_position: series(gsc?.daily?.map((d) => d.position)),
    ai_sessions: series(ga4?.aiReferrals?.daily.map((d) => d.sessions)),
    free_listing_clicks: series(mc?.daily?.map((d) => d.clicks)),
    lcp: series(run.crux?.history?.map((h) => h.lcpMs)),
    inp: series(run.crux?.history?.map((h) => h.inpMs)),
    cls: series(run.crux?.history?.map((h) => h.cls)),
  };
  for (const x of k) if (x.status === 'ok' && SERIES[x.id]) x.series = SERIES[x.id];

  // Source marks for the UI.
  const BY_SOURCE: Record<string, string[]> = {
    'Search Console': ['searchConsole'],
    GA4: ['ga4'],
    'Merchant Center': ['merchant'],
    Ahrefs: ['ahrefs'],
    Semrush: ['semrush'],
    'Ahrefs / Semrush': ['ahrefs', 'semrush'],
    'Chrome UX Report': ['crux'],
    'This audit (crawl)': ['audit'],
    'Google results (DataForSEO)': ['dataforseo'],
    'Otterly.AI': ['otterly'],
  };
  for (const x of k) {
    const engine = x.id.match(/^ai_(?:mentions|citations)_(.+)$/)?.[1];
    x.sourceIds = engine ? [engine] : x.source === 'AI probes (API)' ? (ai?.engines.map((e) => e.engine) ?? ['chatgpt', 'perplexity', 'gemini']) : BY_SOURCE[x.source] || ['audit'];
  }
  return k;
}

/** CSV for Google Sheets / Looker Studio (one row per KPI). */
export function kpisCsv(run: Run, kpis: Kpi[]): string {
  const head = ['store', 'audit_date', 'section', 'kpi', 'label', 'value', 'numerator', 'denominator', 'previous', 'format', 'source', 'kind', 'range', 'status', 'note'];
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = kpis.map((x) => [run.store?.host || run.input.url, run.createdAt?.slice(0, 10), x.section, x.id, x.label, x.value ?? x.text, x.numerator, x.denominator, x.previous, x.format, x.source, x.kind, x.range, x.status, x.note]);
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
