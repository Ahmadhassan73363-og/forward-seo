import type { CruxData, CruxHistoryPoint, CruxSnapshot } from './types';

// Chrome UX Report API: real-user Core Web Vitals (p75, rolling 28 days) and ~25 weeks of history.
// Uses the same Google Cloud API key as PSI, with "Chrome UX Report API" enabled on the project.
const BASE = 'https://chromeuxreport.googleapis.com/v1';

const p75 = (m: any): number | null => {
  const v = m?.percentiles?.p75;
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function post(path: string, key: string, body: any): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}/${path}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

function snapshot(record: any, formFactor: 'PHONE' | 'DESKTOP'): CruxSnapshot {
  const m = record?.metrics || {};
  const lp = record?.collectionPeriod?.lastDate;
  return {
    formFactor,
    lcpMs: p75(m.largest_contentful_paint),
    inpMs: p75(m.interaction_to_next_paint),
    cls: p75(m.cumulative_layout_shift),
    fcpMs: p75(m.first_contentful_paint),
    ttfbMs: p75(m.experimental_time_to_first_byte),
    period: lp ? `${lp.year}-${String(lp.month).padStart(2, '0')}-${String(lp.day).padStart(2, '0')}` : undefined,
  };
}

export async function fetchCrux(origin: string, apiKey: string | undefined): Promise<CruxData> {
  if (!apiKey) return { status: 'unavailable', message: 'No Google API key configured (PSI_API_KEY).' };
  try {
    const [phone, desktop, hist] = await Promise.all([
      post('records:queryRecord', apiKey, { origin, formFactor: 'PHONE' }),
      post('records:queryRecord', apiKey, { origin, formFactor: 'DESKTOP' }),
      post('records:queryHistoryRecord', apiKey, { origin, formFactor: 'PHONE', metrics: ['largest_contentful_paint', 'interaction_to_next_paint', 'cumulative_layout_shift'] }),
    ]);
    if (phone.status === 403 || phone.status === 400) {
      return { status: 'unavailable', message: phone.data?.error?.message || `CrUX API returned HTTP ${phone.status}. Enable "Chrome UX Report API" for this key.` };
    }
    if (phone.status === 404 && desktop.status === 404) {
      return { status: 'no_data', message: 'Not enough Chrome traffic for this origin to appear in CrUX.' };
    }
    const out: CruxData = { status: 'ok' };
    if (phone.status === 200) out.phone = snapshot(phone.data?.record, 'PHONE');
    if (desktop.status === 200) out.desktop = snapshot(desktop.data?.record, 'DESKTOP');

    if (hist.status === 200) {
      const m = hist.data?.record?.metrics || {};
      const periods: any[] = hist.data?.record?.collectionPeriods || [];
      const series = (k: string): any[] => m[k]?.percentilesTimeseries?.p75s || [];
      const lcp = series('largest_contentful_paint');
      const inp = series('interaction_to_next_paint');
      const cls = series('cumulative_layout_shift');
      const points: CruxHistoryPoint[] = periods.map((p, i) => {
        const ld = p.lastDate;
        const n = (v: any) => (v === null || v === undefined || v === 'NaN' ? null : Number(v));
        return {
          end: `${ld.year}-${String(ld.month).padStart(2, '0')}-${String(ld.day).padStart(2, '0')}`,
          lcpMs: n(lcp[i]),
          inpMs: n(inp[i]),
          cls: n(cls[i]),
        };
      });
      out.history = points;
    }
    return out;
  } catch (e: any) {
    return { status: 'unavailable', message: `CrUX request failed: ${e?.message}` };
  }
}
