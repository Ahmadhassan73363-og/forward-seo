import type { OtterlyData } from '../integration-types';
import { envInt } from '../google/config';
import { httpRequest, parseDomainMap, sameSite, toNum } from '../http';
import { apiBase } from '../mock-apis';

/*
 * Otterly.AI public API (https://data.otterly.ai/v1, Bearer key from app.otterly.ai/api-keys).
 * Reads an existing Otterly brand report for the store; it doesn't create prompts or reports.
 *
 *   OTTERLY_API_KEY    key
 *   OTTERLY_REPORTS    optional "store.com=<reportId>"; without it, the report whose brand domain
 *                      matches the store is used
 *   OTTERLY_COUNTRY    report country (default us)
 *   OTTERLY_DAYS       date range (default 28)
 *
 *   GET /v1/reports/brand                         list brand reports
 *   GET /v1/reports/brand/{id}/stats              summary, brand mentions, share of voice
 *   GET /v1/reports/brand/{id}/citations          cited URLs (limit, offset)
 * Otterly's numbers are shown as Otterly reports them and never mixed with our own probes.
 */

export function otterlyConfig() {
  const key = process.env.OTTERLY_API_KEY?.trim();
  return key
    ? { enabled: true as const, key, reports: parseDomainMap(process.env.OTTERLY_REPORTS), country: process.env.OTTERLY_COUNTRY?.trim() || 'us', days: envInt('OTTERLY_DAYS', 28, 1, 365) }
    : { enabled: false as const };
}

const BASE = () => `${apiBase('https://data.otterly.ai', 'otterly')}/v1`;
const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};
const listOf = (b: any): any[] => (Array.isArray(b) ? b : b?.items || b?.data || b?.reports || b?.results || []);

export async function fetchOtterly(host: string): Promise<OtterlyData | undefined> {
  const cfg = otterlyConfig();
  if (cfg.enabled === false) return undefined;
  const out: OtterlyData = { fetchedAt: new Date().toISOString(), status: 'ok', errors: [], country: cfg.country };
  const get = async (path: string) => {
    const r = await httpRequest(`${BASE()}${path}`, { headers: { Authorization: `Bearer ${cfg.key}` } });
    if (r.ok === false) return { ok: false as const, message: r.message };
    if (!r.res.ok) {
      const why = r.body?.error?.message || r.body?.message || r.body?.error || r.text.slice(0, 160);
      const hint = r.res.status === 401 ? ' (check OTTERLY_API_KEY)' : r.res.status === 403 ? ' (the key lacks access to this workspace or report)' : r.res.status === 429 ? ' (rate limited)' : '';
      return { ok: false as const, message: `HTTP ${r.res.status}: ${typeof why === 'string' ? why : JSON.stringify(why)}${hint}` };
    }
    return { ok: true as const, data: r.body };
  };

  const bare = host.toLowerCase().replace(/^www\./, '');
  let reportId = cfg.reports.get(bare);
  if (reportId) out.matchedBy = 'OTTERLY_REPORTS';
  else {
    const list = await get('/reports/brand');
    if (list.ok === false) return { ...out, status: 'unavailable', message: `Could not list Otterly brand reports: ${list.message}` };
    const reports = listOf(list.data);
    const hit = reports.find((r: any) => {
      const d = r?.brand?.brandDomain || r?.brandDomain || r?.domain || '';
      return d && sameSite(String(d).includes('://') ? d : `https://${d}`, host);
    });
    if (!hit) return { ...out, status: 'no_report', message: `None of the ${reports.length} Otterly brand reports is for ${bare}. Create one in Otterly, or set OTTERLY_REPORTS=${bare}=<report id>.` };
    reportId = String(hit.id);
    out.reportName = hit.name || hit.brand?.brand || undefined;
    out.matchedBy = 'brand domain';
  }
  out.reportId = reportId;
  out.range = { start: day(cfg.days), end: day(0) };
  const q = new URLSearchParams({ startDate: out.range.start, endDate: out.range.end, country: cfg.country });

  const [stats, cites] = await Promise.all([get(`/reports/brand/${encodeURIComponent(reportId)}/stats?${q}`), get(`/reports/brand/${encodeURIComponent(reportId)}/citations?${q}&limit=25`)]);
  if (stats.ok === true) {
    const s = stats.data || {};
    out.totalPrompts = toNum(s.totalPrompts);
    out.reportName ||= s.brand?.brand;
    out.summary = {
      shareOfVoice: toNum(s.summary?.shareOfVoice),
      brandCoverage: toNum(s.summary?.brandCoverage),
      domainCoverage: toNum(s.summary?.domainCoverage),
      totalMentions: toNum(s.summary?.totalMentions),
      averagePosition: toNum(s.summary?.averagePosition),
      averageRank: toNum(s.summary?.averageRank),
    };
    const brands = s.competitorBrandsAnalysis?.brandMentions || s.allBrandsAnalysis?.brandMentions || [];
    out.brands = brands.slice(0, 15).map((x: any) => ({
      brand: String(x?.brand || ''),
      isMainBrand: !!x?.isMainBrand,
      mentions: toNum(x?.mentions),
      shareOfVoice: toNum(x?.shareOfVoice),
      brandCoverage: toNum(x?.brandCoverage),
      domainCitations: toNum(x?.domainCitations),
    }));
  } else out.errors.push(`Brand stats: ${stats.message}`);
  if (cites.ok === true) {
    out.citations = listOf(cites.data)
      .slice(0, 25)
      .map((c: any) => ({ url: String(c?.url || ''), domain: String(c?.domain || ''), title: c?.title || undefined, citations: toNum(c?.citations), isMyBrandDomain: !!c?.isMyBrandDomain, category: c?.domainCategory || undefined }))
      .filter((c: any) => c.url);
  } else out.errors.push(`Citations: ${cites.message}`);

  out.status = !out.errors.length ? 'ok' : out.summary || out.citations ? 'partial' : 'unavailable';
  if (out.status === 'unavailable') out.message = out.errors.join(' ');
  return out;
}
