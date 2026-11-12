import type { AhrefsData } from '../types';
import { ahrefsGet, num } from './client';

/**
 * Domain Rating from the free public endpoint (any APIv3 key; costs no API units).
 * Ahrefs requires the credit "Domain Rating by Ahrefs" wherever the value is shown.
 */
export async function fetchDomainRating(target: string, key: string): Promise<AhrefsData['domainRating']> {
  const r = await ahrefsGet('/public/domain-rating-free', { target }, key);
  if (r.ok === false) return { error: r.status === 401 ? `Ahrefs rejected the API key (${r.message})` : r.message, keyRejected: r.status === 401 };
  const v = num(r.data?.domain_rating?.domain_rating);
  return v === undefined ? { error: 'Ahrefs returned no Domain Rating for this site' } : { value: Math.round(v * 10) / 10 };
}
