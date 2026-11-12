import { httpRequest } from '../http';
import { apiBase } from '../mock-apis';
import type { SerpProvider, SerpResult } from './types';

/*
 * DataForSEO SERP API, Google Organic Live Advanced:
 *   POST https://api.dataforseo.com/v3/serp/google/organic/live/advanced   (Basic auth: API login:password)
 *   body: [{ keyword, location_code, language_code, device, depth, load_async_ai_overview: true }]
 *   → tasks[0].status_code (20000 = ok) and tasks[0].result[0].items[]
 *     item type "ai_overview": references[] and items[].references[] { source, domain, url, title, text }
 *     item type "organic": { rank_group, domain, url }
 * Advanced results always contain the expanded AI Overview (expand_ai_overview is for HTML endpoints).
 */

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

export const dataforseo: SerpProvider = {
  id: 'dataforseo',
  configured: () => !!(process.env.DATAFORSEO_LOGIN?.trim() && process.env.DATAFORSEO_PASSWORD?.trim()),
  async search({ keyword, locationCode, languageCode, device }): Promise<SerpResult> {
    const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN!.trim()}:${process.env.DATAFORSEO_PASSWORD!.trim()}`).toString('base64');
    const r = await httpRequest(`${apiBase('https://api.dataforseo.com', 'dataforseo')}/v3/serp/google/organic/live/advanced`, {
      headers: { Authorization: `Basic ${auth}` },
      json: [{ keyword, location_code: locationCode, language_code: languageCode, device, depth: 20, load_async_ai_overview: true }],
      timeoutMs: 60_000,
    });
    if (r.ok === false) return { ok: false, message: r.message };
    if (!r.res.ok) return { ok: false, message: `HTTP ${r.res.status}: ${r.body?.status_message || r.text.slice(0, 160)}${r.res.status === 401 ? ' (check DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)' : ''}`, keyRejected: r.res.status === 401 || r.res.status === 403 };
    const task = r.body?.tasks?.[0];
    if (r.body?.status_code !== 20000 || !task || task.status_code !== 20000) {
      return { ok: false, message: `DataForSEO ${task?.status_code || r.body?.status_code}: ${task?.status_message || r.body?.status_message || 'no result'}` };
    }
    const items: any[] = task.result?.[0]?.items || [];
    const aio = items.find((i) => i?.type === 'ai_overview') || items.find((i) => i?.type === 'knowledge_graph_ai_overview_item');
    const refs = new Map<string, { url: string; domain: string; title?: string; source?: string }>();
    const addRef = (x: any) => {
      if (typeof x?.url !== 'string' || refs.has(x.url)) return;
      refs.set(x.url, { url: x.url, domain: (x.domain || domainOf(x.url)).toLowerCase().replace(/^www\./, ''), title: x.title || undefined, source: x.source || undefined });
    };
    for (const x of aio?.references || []) addRef(x);
    for (const el of aio?.items || []) for (const x of el?.references || []) addRef(x);
    const organic = items
      .filter((i) => i?.type === 'organic' && typeof i.url === 'string')
      .map((i) => ({ position: typeof i.rank_group === 'number' ? i.rank_group : undefined, url: i.url as string, domain: String(i.domain || domainOf(i.url)).toLowerCase().replace(/^www\./, '') }));
    return { ok: true, hasAio: !!aio, references: Array.from(refs.values()), organic };
  },
};
