import type { EvidenceItem, FieldMetrics, NormalizedAudit, PageSpeedResult, Strategy, ThirdPartyCost } from './types';

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const PSI_TIMEOUT_MS = 120_000; // background worker: no serverless limit, PSI can take 60s+

const METRIC_AUDITS = new Set([
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
  'interactive',
  'max-potential-fid',
  'interaction-to-next-paint',
  'first-meaningful-paint',
]);
// Informational audits we read for other purposes instead of reporting as failures.
const SKIP_AUDITS = new Set(['final-screenshot', 'screenshot-thumbnails', 'full-page-screenshot', 'main-thread-tasks', 'network-requests', 'network-rtt', 'network-server-latency', 'diagnostics', 'metrics', 'resource-summary', 'script-treemap-data', 'third-party-summary', 'third-parties-insight', 'largest-contentful-paint-element']);
const MAX_ITEMS_PER_AUDIT = 15;

export type PsiOutcome =
  | { ok: true; result: PageSpeedResult; screenshotData?: string }
  | { ok: false; error: string; retryable: boolean; retryAfterMs?: number };

const trunc = (s: any, n: number) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : undefined);
const num = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function fmtBytes(b: number) {
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

function entityName(e: any): string | undefined {
  if (!e) return undefined;
  if (typeof e === 'string') return e;
  return e.text || e.name || e.url;
}

/** Flattens table / opportunity / list-of-tables details into evidence items. */
export function extractItems(details: any, limit = MAX_ITEMS_PER_AUDIT): EvidenceItem[] {
  if (!details) return [];
  let rows: any[] = [];
  if (details.type === 'list' && Array.isArray(details.items)) {
    for (const sub of details.items) {
      if (Array.isArray(sub?.items)) rows.push(...sub.items);
      else if (sub?.type === 'node') rows.push({ node: sub });
    }
  } else if (Array.isArray(details.items)) {
    rows = details.items;
  }
  const out: EvidenceItem[] = [];
  for (const it of rows) {
    if (out.length >= limit) break;
    if (!it || typeof it !== 'object') continue;
    const node = it.node?.type === 'node' ? it.node : it.type === 'node' ? it : it.element?.type === 'node' ? it.element : undefined;
    const rawUrl = typeof it.url === 'string' ? it.url : typeof it.source?.url === 'string' ? it.source.url : typeof it.request?.url === 'string' ? it.request.url : undefined;
    // Lighthouse uses pseudo-URLs like "Unattributable" or "Other" for grouped rows
    const url = rawUrl && /^https?:\/\//.test(rawUrl) ? rawUrl : undefined;
    // bootup-time rows report `total` ms; main-thread rows `duration`; third parties `blockingTime`
    const wastedMs = num(it.wastedMs) ?? num(it.blockingTime) ?? num(it.duration) ?? num(it.total) ?? undefined;
    const wastedBytes = num(it.wastedBytes) ?? undefined;
    const parts: string[] = [];
    if (wastedMs) parts.push(`${Math.round(wastedMs)} ms`);
    if (wastedBytes) parts.push(`${fmtBytes(wastedBytes)} wasted`);
    else if (num(it.transferSize)) parts.push(fmtBytes(it.transferSize));
    else if (num(it.totalBytes)) parts.push(fmtBytes(it.totalBytes));
    if (num(it.score) !== null && it.score < 1 && it.score > 0) parts.push(`shift ${it.score.toFixed(3)}`);
    const label =
      trunc(node?.nodeLabel, 160) ||
      trunc(entityName(it.entity), 80) ||
      trunc(it.label, 160) ||
      trunc(it.groupLabel, 160) ||
      (rawUrl && !url ? rawUrl : undefined) ||
      trunc(typeof it.description === 'string' ? it.description : undefined, 160);
    if (!url && !node && !label) continue;
    out.push({
      url: trunc(url, 500),
      selector: trunc(node?.selector, 300),
      snippet: trunc(node?.snippet, 300),
      label,
      value: parts.join(', ') || undefined,
      wastedMs: wastedMs != null ? Math.round(wastedMs) : undefined,
      wastedBytes: wastedBytes != null ? Math.round(wastedBytes) : undefined,
    });
  }
  return out;
}

function fieldFrom(exp: any, isUrlLevel: boolean): FieldMetrics | null {
  if (!exp?.metrics) return null;
  // PSI silently falls back to origin data when the URL has none — don't present that as URL data.
  if (isUrlLevel && exp.origin_fallback) return null;
  const m = exp.metrics;
  const lcp = m.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null;
  const inp = m.INTERACTION_TO_NEXT_PAINT?.percentile ?? null;
  const cls = m.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? m.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null;
  const passed = lcp === null ? null : lcp <= 2500 && (inp === null || inp <= 200) && (cls === null || cls <= 0.1);
  return {
    category: exp.overall_category || null,
    lcpMs: lcp,
    inpMs: inp,
    cls,
    fcpMs: m.FIRST_CONTENTFUL_PAINT_MS?.percentile ?? null,
    ttfbMs: m.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile ?? null,
    passed,
  };
}

function isFailing(a: any): boolean {
  const mode = a.scoreDisplayMode;
  if (mode === 'notApplicable' || mode === 'manual' || mode === 'error' || mode === 'informative') return false;
  if (typeof a.score !== 'number') return false;
  if (mode === 'binary') return a.score < 1;
  if (mode === 'metricSavings') return a.score < 1;
  return a.score < 0.9;
}

/** Converts a raw PSI v5 response into the engine's normalized result. Exported for tests. */
export function normalizePsi(data: any, url: string, strategy: Strategy): { result: PageSpeedResult; screenshotData?: string } {
  const lh = data.lighthouseResult;
  const audits = lh.audits || {};
  const cats = lh.categories || {};

  const refIndex = new Map<string, { category: NormalizedAudit['category']; weight: number; group?: string }>();
  for (const [catId, cat] of Object.entries<any>(cats)) {
    for (const ref of cat.auditRefs || []) {
      if (!refIndex.has(ref.id)) refIndex.set(ref.id, { category: catId as any, weight: ref.weight || 0, group: ref.group });
    }
  }

  const failedAudits: NormalizedAudit[] = [];
  for (const [id, a] of Object.entries<any>(audits)) {
    if (METRIC_AUDITS.has(id) || SKIP_AUDITS.has(id)) continue;
    const ref = refIndex.get(id);
    if (ref?.group === 'metrics') continue;
    if (!isFailing(a)) continue;
    const ms = a.metricSavings || {};
    const savingsMs = Math.round(num(a.details?.overallSavingsMs) ?? Math.max(0, num(ms.LCP) ?? 0, num(ms.FCP) ?? 0, num(ms.TBT) ?? 0, num(ms.INP) ?? 0));
    failedAudits.push({
      id,
      title: a.title,
      description: trunc(a.description, 600) || '',
      category: ref?.category || 'other',
      score: num(a.score),
      scoreDisplayMode: a.scoreDisplayMode,
      displayValue: a.displayValue,
      weight: ref?.weight || 0,
      savingsMs,
      savingsBytes: Math.round(num(a.details?.overallSavingsBytes) ?? 0),
      items: extractItems(a.details),
    });
  }

  // Third-party cost (classic audit or Lighthouse 12+ insight)
  const tpAudit = audits['third-party-summary']?.details?.items?.length ? audits['third-party-summary'] : audits['third-parties-insight'];
  const firstParty = new Set<string>((lh.entities || []).filter((e: any) => e.isFirstParty).map((e: any) => e.name));
  const tpRows: any[] = [];
  const d = tpAudit?.details;
  if (d?.type === 'list') d.items?.forEach((t: any) => Array.isArray(t?.items) && tpRows.push(...t.items));
  else if (Array.isArray(d?.items)) tpRows.push(...d.items);
  const thirdParties: ThirdPartyCost[] = tpRows
    .map((r) => ({
      entity: entityName(r.entity) || 'Unknown',
      mainThreadMs: Math.round(num(r.mainThreadTime) ?? 0),
      blockingMs: Math.round(num(r.blockingTime) ?? 0),
      transferBytes: Math.round(num(r.transferSize) ?? 0),
    }))
    .filter((r) => r.entity !== 'Unknown' && !firstParty.has(r.entity));

  // LCP element
  let lcpElement: PageSpeedResult['lcpElement'];
  for (const id of ['largest-contentful-paint-element', 'lcp-discovery-insight', 'lcp-breakdown-insight', 'lcp-phases-insight']) {
    const ev = extractItems(audits[id]?.details, 5).find((x) => x.selector || x.snippet);
    if (ev) {
      lcpElement = { selector: ev.selector, snippet: ev.snippet };
      break;
    }
  }

  const score = (k: string) => (typeof cats[k]?.score === 'number' ? Math.round(cats[k].score * 100) : null);
  const metric = (k: string) => {
    const v = num(audits[k]?.numericValue);
    return v === null ? null : k === 'cumulative-layout-shift' ? Number(v.toFixed(3)) : Math.round(v);
  };

  return {
    result: {
      url,
      finalUrl: lh.finalDisplayedUrl || lh.finalUrl || url,
      strategy,
      fetchedAt: lh.fetchTime || new Date().toISOString(),
      lighthouseVersion: lh.lighthouseVersion || 'unknown',
      scores: { performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo') },
      lab: {
        lcpMs: metric('largest-contentful-paint'),
        fcpMs: metric('first-contentful-paint'),
        tbtMs: metric('total-blocking-time'),
        cls: metric('cumulative-layout-shift'),
        siMs: metric('speed-index'),
        ttiMs: metric('interactive'),
      },
      field: fieldFrom(data.loadingExperience, true),
      originField: fieldFrom(data.originLoadingExperience, false),
      failedAudits,
      thirdParties,
      lcpElement,
    },
    screenshotData: typeof audits['final-screenshot']?.details?.data === 'string' ? audits['final-screenshot'].details.data : undefined,
  };
}

export async function runPageSpeed(url: string, strategy: Strategy, apiKey: string | undefined): Promise<PsiOutcome> {
  const params = new URLSearchParams({ url, strategy });
  ['performance', 'accessibility', 'best-practices', 'seo'].forEach((c) => params.append('category', c));
  if (apiKey) params.set('key', apiKey);

  let res: Response;
  try {
    res = await fetch(`${PSI_ENDPOINT}?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(PSI_TIMEOUT_MS) });
  } catch (e: any) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return { ok: false, error: timeout ? `PSI timed out after ${PSI_TIMEOUT_MS / 1000}s` : `PSI request failed: ${e?.message}`, retryable: true };
  }

  if (!res.ok) {
    let msg = '';
    try {
      msg = (await res.json())?.error?.message || '';
    } catch {}
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after'));
      return {
        ok: false,
        error: `PSI quota exceeded (HTTP 429)${apiKey ? '' : ' — set PSI_API_KEY; the shared anonymous quota is almost always exhausted'}`,
        retryable: !!apiKey,
        retryAfterMs: Number.isFinite(ra) && ra > 0 ? ra * 1000 : 30_000,
      };
    }
    // Lighthouse could not load the page (DNS, 4xx/5xx document, timeout on Google's side)
    const pageError = /FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|NO_FCP|DNS_FAILURE|NOT_HTML/.test(msg);
    return { ok: false, error: `PSI HTTP ${res.status}${msg ? `: ${trunc(msg, 300)}` : ''}`, retryable: !pageError && res.status >= 500 };
  }

  // The body can stall after the headers arrive (the timeout then fires here), so read it inside try.
  let data: any;
  try {
    data = await res.json();
  } catch (e: any) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return { ok: false, error: timeout ? `PSI response timed out after ${PSI_TIMEOUT_MS / 1000}s` : `PSI returned an unreadable response: ${e?.message}`, retryable: true };
  }
  if (!data?.lighthouseResult) return { ok: false, error: 'PSI returned no Lighthouse result', retryable: true };
  if (data.lighthouseResult.runtimeError?.code) {
    return { ok: false, error: `Lighthouse error: ${data.lighthouseResult.runtimeError.message || data.lighthouseResult.runtimeError.code}`, retryable: false };
  }
  try {
    const { result, screenshotData } = normalizePsi(data, url, strategy);
    // A report without any category score is not a usable test result.
    if (Object.values(result.scores).every((v) => v === null || v === undefined)) {
      return { ok: false, error: 'PSI returned a Lighthouse report without scores', retryable: true };
    }
    return { ok: true, result, screenshotData };
  } catch (e: any) {
    return { ok: false, error: `Could not read the Lighthouse report: ${e?.message}`, retryable: false };
  }
}
