import type { SiteExplorerData } from '../types';
import { ahrefsGet, isRefused, num } from './client';

/*
 * Site Explorer data (paid plan with API access, Lite or higher). 4 requests per audit, each at
 * least 50 API units. The first request checks access; if it's refused the others are skipped.
 */

const TOP_PAGES = 10;
const TOP_KEYWORDS = 20;

export async function fetchSiteExplorer(target: string, key: string): Promise<SiteExplorerData> {
  const common = { target, date: new Date().toISOString().slice(0, 10), mode: 'subdomains' };

  const stats = await ahrefsGet('/site-explorer/backlinks-stats', common, key);
  if (stats.ok === false) {
    return isRefused(stats)
      ? { status: 'no_api_access', message: `Ahrefs refused Site Explorer data for this key (${stats.message}). The key's plan needs API access (Lite or higher).` }
      : { status: 'failed', message: `Ahrefs Site Explorer request failed (${stats.message}).` };
  }

  const out: SiteExplorerData = { status: 'ok' };
  const m = stats.data?.metrics || {};
  out.backlinks = { live: num(m.live), liveRefdomains: num(m.live_refdomains), allTime: num(m.all_time), allTimeRefdomains: num(m.all_time_refdomains) };

  const [metrics, pages, kws] = await Promise.all([
    ahrefsGet('/site-explorer/metrics', common, key),
    ahrefsGet('/site-explorer/top-pages', { ...common, select: 'url,sum_traffic,keywords,top_keyword,top_keyword_volume,top_keyword_best_position', order_by: 'sum_traffic:desc', limit: String(TOP_PAGES) }, key),
    ahrefsGet('/site-explorer/organic-keywords', { ...common, select: 'keyword,volume,best_position,best_position_url', order_by: 'volume:desc', limit: String(TOP_KEYWORDS) }, key),
  ]);

  const errors: string[] = [];
  if (metrics.ok === true) {
    const x = metrics.data?.metrics || {};
    out.organic = { traffic: num(x.org_traffic), keywords: num(x.org_keywords), keywordsTop3: num(x.org_keywords_1_3) };
  } else errors.push(`organic metrics: ${metrics.message}`);

  if (pages.ok === true) {
    out.topPages = (Array.isArray(pages.data?.pages) ? pages.data.pages : [])
      .filter((p: any) => typeof p?.url === 'string')
      .map((p: any) => ({
        url: p.url,
        traffic: num(p.sum_traffic),
        keywords: num(p.keywords),
        topKeyword: typeof p.top_keyword === 'string' ? p.top_keyword : undefined,
        topKeywordVolume: num(p.top_keyword_volume),
        topKeywordPosition: num(p.top_keyword_best_position),
      }));
  } else errors.push(`top pages: ${pages.message}`);

  if (kws.ok === true) {
    out.keywords = (Array.isArray(kws.data?.keywords) ? kws.data.keywords : [])
      .filter((k: any) => typeof k?.keyword === 'string')
      .map((k: any) => ({ keyword: k.keyword, volume: num(k.volume), position: num(k.best_position), url: typeof k.best_position_url === 'string' ? k.best_position_url : undefined }));
  } else errors.push(`organic keywords: ${kws.message}`);

  if (errors.length) {
    out.status = 'partial';
    out.message = `Some Ahrefs requests failed (${errors.join('; ')}).`;
  }
  return out;
}
