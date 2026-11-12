import type { AiInput, AiOverviewKeyword, AiOverviewsData } from '../integration-types';
import { brandInfo, competitorList } from '../brand';
import { buyerCollections } from '../ai-visibility/prompts';
import { envInt } from '../google/config';
import { mapLimit } from '../http';
import { databaseFor } from '../semrush/config';
import { dataforseo } from './dataforseo';
import type { SerpProvider } from './types';

/*
 * Google AI Overviews: Google has no API for them and Search Console mixes them into normal web
 * totals, so a SERP data provider fetches the results page for each tracked keyword.
 *
 *   DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD   API credentials (dashboard → API Access)
 *   AIO_MAX_KEYWORDS      keywords per audit (default 10)
 *   AIO_LOCATION_CODE     Google location (default: from the domain's country, else 2840 = United States)
 *   AIO_LANGUAGE          language code (default en)
 *   AIO_DEVICE            desktop | mobile (default desktop)
 * Keywords: the store's top non-brand Search Console queries, then collection names.
 */

const PROVIDERS: SerpProvider[] = [dataforseo];

// Semrush database (from the domain) → Google location code and name.
const LOCATIONS: Record<string, [number, string]> = {
  us: [2840, 'United States'], uk: [2826, 'United Kingdom'], de: [2276, 'Germany'], fr: [2250, 'France'], ca: [2124, 'Canada'], au: [2036, 'Australia'],
  in: [2356, 'India'], pk: [2586, 'Pakistan'], nl: [2528, 'Netherlands'], es: [2724, 'Spain'], it: [2380, 'Italy'], ie: [2372, 'Ireland'], nz: [2554, 'New Zealand'],
};

export function aiOverviewsConfig() {
  const provider = PROVIDERS.find((p) => p.configured());
  return { enabled: !!provider, provider, maxKeywords: envInt('AIO_MAX_KEYWORDS', 10, 1, 100) };
}

export async function fetchAiOverviews(ctx: {
  host: string;
  input?: AiInput;
  queries: string[];
  collections: Array<{ title: string; count?: number }>;
  timeLeftMs: () => number;
  isCancelled: () => boolean;
}): Promise<AiOverviewsData | undefined> {
  const cfg = aiOverviewsConfig();
  if (!cfg.enabled || !cfg.provider) return undefined;
  const domain = ctx.host.toLowerCase().replace(/^www\./, '');
  const competitors = competitorList(ctx.input).filter((c) => c.domain);
  const db = databaseFor(domain).database;
  const configured = Number(process.env.AIO_LOCATION_CODE);
  const [locationCode, location] = Number.isFinite(configured) && configured > 0 ? [configured, `location ${configured}`] : LOCATIONS[db] || LOCATIONS.us;
  const language = process.env.AIO_LANGUAGE?.trim() || 'en';
  const device = process.env.AIO_DEVICE?.trim() === 'mobile' ? 'mobile' : 'desktop';

  // Keywords: non-brand queries first, then collection names (deduplicated).
  const seen = new Set<string>();
  const keywords: Array<{ keyword: string; source: string }> = [];
  for (const q of ctx.queries) if (!seen.has(q.toLowerCase()) && keywords.length < cfg.maxKeywords && seen.add(q.toLowerCase())) keywords.push({ keyword: q, source: 'Search Console query' });
  for (const c of buyerCollections(ctx.collections, brandInfo(ctx.host, ctx.input).terms)) {
    const k = c.title.toLowerCase();
    if (keywords.length >= cfg.maxKeywords || seen.has(k)) continue;
    seen.add(k);
    keywords.push({ keyword: k, source: 'collection name' });
  }
  const out: AiOverviewsData = { provider: cfg.provider.id, location, locationCode, language, device, fetchedAt: new Date().toISOString(), status: 'ok', errors: [], keywords: [] };
  if (!keywords.length) return { ...out, status: 'unavailable', message: 'No keywords to check: connect Search Console or audit a Shopify store with collections.' };

  let rejected = false;
  out.keywords = await mapLimit(keywords, 5, async ({ keyword, source }): Promise<AiOverviewKeyword> => {
    const base: AiOverviewKeyword = { keyword, source, ok: false, references: [], competitorsCited: [] };
    if (ctx.isCancelled()) return { ...base, notRun: 'audit cancelled' };
    if (rejected) return { ...base, notRun: 'skipped: the API credentials were rejected' };
    if (ctx.timeLeftMs() < 30_000) return { ...base, notRun: 'audit time limit reached' };
    const r = await cfg.provider!.search({ keyword, locationCode, languageCode: language, device });
    if (r.ok === false) {
      if (r.keyRejected) rejected = true;
      return { ...base, error: r.message };
    }
    const isStore = (d: string) => d === domain || d.endsWith(`.${domain}`);
    const storePositions = r.organic.filter((o) => isStore(o.domain) && o.position !== undefined).map((o) => o.position!);
    return {
      ...base,
      ok: true,
      hasAio: r.hasAio,
      references: r.references.slice(0, 20),
      storeCited: r.references.some((x) => isStore(x.domain)),
      competitorsCited: competitors.filter((c) => r.references.some((x) => x.domain === c.domain || x.domain.endsWith(`.${c.domain}`))).map((c) => c.name),
      storeOrganicPosition: storePositions.length ? Math.min(...storePositions) : undefined,
    };
  });

  const failed = out.keywords.filter((k) => k.error);
  const notRun = out.keywords.filter((k) => k.notRun);
  if (failed.length) out.errors.push(`${failed.length} of ${out.keywords.length} keywords failed (${failed[0].error})`);
  if (notRun.length) out.errors.push(`${notRun.length} keywords not checked (${notRun[0].notRun})`);
  const ok = out.keywords.filter((k) => k.ok).length;
  out.status = ok === out.keywords.length ? 'ok' : ok > 0 ? 'partial' : 'unavailable';
  if (out.status === 'unavailable') out.message = out.errors.join(' ');
  return out;
}
