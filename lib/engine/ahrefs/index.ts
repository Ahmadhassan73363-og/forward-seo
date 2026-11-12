import type { AhrefsData } from '../types';
import { ahrefsConfig } from './config';
import { fetchDomainRating } from './free';
import { fetchSiteExplorer } from './paid';

export { ahrefsConfig, AHREFS_FEATURES } from './config';

/**
 * Ahrefs data for one site, according to the configured key (see config.ts).
 * Returns undefined when no Ahrefs key is configured.
 */
export async function fetchAhrefs(host: string): Promise<AhrefsData | undefined> {
  const cfg = ahrefsConfig();
  if (cfg.plan === 'off') return undefined;
  const target = host.replace(/^www\./, '');
  const out: AhrefsData = { plan: cfg.plan, target, fetchedAt: new Date().toISOString(), status: 'ok', domainRating: {} };

  out.domainRating = await fetchDomainRating(target, cfg.key);

  if (cfg.plan === 'paid') {
    out.siteExplorer = out.domainRating.keyRejected
      ? { status: 'failed', message: 'Skipped: Ahrefs rejected the API key. Check AHREFS_PAID_API_KEY.' }
      : await fetchSiteExplorer(target, cfg.key);
  }

  const drOk = out.domainRating.value !== undefined;
  const seOk = out.siteExplorer?.status === 'ok' || out.siteExplorer?.status === 'partial';
  if (cfg.plan === 'free') out.status = drOk ? 'ok' : 'unavailable';
  else out.status = drOk && out.siteExplorer?.status === 'ok' ? 'ok' : drOk || seOk ? 'partial' : 'unavailable';
  if (out.status === 'unavailable') {
    out.message = [out.domainRating.error, out.siteExplorer?.message].filter(Boolean).join(' ') || 'Ahrefs returned no data.';
  }
  return out;
}
