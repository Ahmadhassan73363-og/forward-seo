import type { Run } from './types';
import { ahrefsConfig, fetchAhrefs } from './ahrefs';
import { fetchSemrush, semrushConfig } from './semrush';
import { fetchSearchConsole, gscConfig } from './gsc';
import { fetchGa4, ga4Config } from './ga4';
import { fetchMerchant, merchantConfig } from './merchant';
import { aiVisibilityConfig, fetchAiVisibility } from './ai-visibility';
import { aiOverviewsConfig, fetchAiOverviews } from './serp';
import { fetchOtterly, otterlyConfig } from './otterly';
import { fetchCatalogNames } from './catalog-feed';
import { brandInfo } from './brand';
import { googleAccount } from './google/config';
import { mockApiBase } from './mock-apis';

/*
 * Third-party SEO and AI-SEO sources, run alongside the audit. None of them is scored.
 *
 *   Stage 1 (parallel): Ahrefs, Semrush, Search Console, GA4, Merchant Center, Otterly,
 *                       plus the store's product/collection names (Shopify feed).
 *   Stage 2 (parallel): AI visibility probes and Google AI Overviews, which use the
 *                       Search Console queries and catalog names from stage 1.
 *
 * Each source: no key → no requests and no run field; failures become run warnings; the rest of
 * the audit is never blocked. To add a source: write lib/engine/<source>/ (config + fetch), add a
 * Run field in integration-types.ts, call it here, and list it in integrationsConfig().
 */

export interface IntegrationContext {
  host: string;
  baseUrl: string;
  homeUrl: string;
  shopify: boolean;
  timeLeftMs: () => number;
  isCancelled: () => boolean;
  persist: () => Promise<void>;
}

/** What is configured (booleans, plan names and the Google service account email only; never keys). */
export function integrationsConfig() {
  const g = googleAccount();
  const ai = aiVisibilityConfig();
  return {
    ahrefsPlan: ahrefsConfig().plan,
    semrush: semrushConfig().enabled,
    searchConsole: (() => {
      const c = gscConfig();
      return c.enabled ? { email: c.email || null, problem: c.credentials ? null : c.error || 'key problem' } : null;
    })(),
    google: g.configured ? { email: g.email || null, problem: g.credentials ? null : g.error || 'key problem' } : null,
    ga4: ga4Config().enabled,
    merchant: merchantConfig().enabled,
    aiEngines: ai.engines.map((e) => e.label),
    aiOverviews: aiOverviewsConfig().enabled,
    otterly: otterlyConfig().enabled,
    mockMode: !!mockApiBase(),
  };
}

const warn = (run: Run, label: string, d: { status: string; message?: string; errors?: string[] } | undefined) => {
  if (!d) return;
  if (d.status === 'unavailable') run.warnings.push(`${label}: ${d.message}`);
  else if (d.status !== 'no_access' && d.status !== 'no_report' && d.errors?.length) run.warnings.push(`${label}: some requests failed (${d.errors.join('; ')}).`);
};

export async function runIntegrations(run: Run, ctx: IntegrationContext): Promise<void> {
  if (mockApiBase()) run.warnings.push(`Test mode: third-party SEO and AI data in this run is DUMMY data from the mock server at ${mockApiBase()} (MOCK_API_BASE), not from the real services.`);
  const brand = brandInfo(ctx.host, run.input.ai);
  const needCatalog = ctx.shopify && (aiVisibilityConfig().enabled || aiOverviewsConfig().enabled);
  // Each source catches its own failure, so one broken source never hides the others.
  const guard = (label: string, task: () => Promise<void>) =>
    task().catch((e) => {
      run.warnings.push(`${label} stopped early: ${e?.message || e}.`);
    });

  let catalog: { products: string[]; collections: Array<{ title: string; count?: number }> } = { products: [], collections: [] };
  await Promise.all([
    guard('Ahrefs', async () => {
      run.ahrefs = await fetchAhrefs(ctx.host);
      if (run.ahrefs?.status === 'unavailable') run.warnings.push(`Ahrefs: ${run.ahrefs.message}`);
      else if (run.ahrefs?.siteExplorer?.message) run.warnings.push(`Ahrefs: ${run.ahrefs.siteExplorer.message}`);
      await ctx.persist();
    }),
    guard('Semrush', async () => {
      run.semrush = await fetchSemrush(ctx.host);
      warn(run, 'Semrush', run.semrush);
      await ctx.persist();
    }),
    guard('Search Console', async () => {
      run.searchConsole = await fetchSearchConsole(ctx.host, ctx.homeUrl, { brandTerms: brand.terms });
      warn(run, 'Search Console', run.searchConsole);
      await ctx.persist();
    }),
    guard('GA4', async () => {
      run.ga4 = await fetchGa4(ctx.host);
      warn(run, 'GA4', run.ga4);
      await ctx.persist();
    }),
    guard('Merchant Center', async () => {
      run.merchant = await fetchMerchant(ctx.host);
      warn(run, 'Merchant Center', run.merchant);
      await ctx.persist();
    }),
    guard('Otterly.AI', async () => {
      run.otterly = await fetchOtterly(ctx.host);
      warn(run, 'Otterly.AI', run.otterly);
      await ctx.persist();
    }),
    guard('Catalog names', async () => {
      if (needCatalog) catalog = await fetchCatalogNames(ctx.baseUrl);
    }),
  ]);
  if (ctx.isCancelled()) return;

  const gsc = run.searchConsole;
  const queries = (gsc?.nonBrandQueries || gsc?.queries || []).map((q) => ('query' in q ? q.query : '')).filter(Boolean);
  await Promise.all([
    guard('AI visibility', async () => {
      run.aiVisibility = await fetchAiVisibility({ host: ctx.host, input: run.input.ai, queries, catalog, timeLeftMs: ctx.timeLeftMs, isCancelled: ctx.isCancelled });
      warn(run, 'AI visibility', run.aiVisibility);
      await ctx.persist();
    }),
    guard('AI Overviews', async () => {
      run.aiOverviews = await fetchAiOverviews({ host: ctx.host, input: run.input.ai, queries, collections: catalog.collections, timeLeftMs: ctx.timeLeftMs, isCancelled: ctx.isCancelled });
      warn(run, 'AI Overviews', run.aiOverviews);
      await ctx.persist();
    }),
  ]);
}
