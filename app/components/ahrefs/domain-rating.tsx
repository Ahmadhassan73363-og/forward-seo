import React from 'react';
import type { AhrefsData } from '@/lib/engine/types';
import { Stat } from './shared';

/** Free tier: Domain Rating (available with either key). */
export function DomainRatingCard({ dr }: { dr: AhrefsData['domainRating'] }) {
  return <Stat label="Domain Rating" value={dr.value === undefined ? '—' : String(dr.value)} sub={dr.value === undefined ? dr.error || 'No value returned' : 'Backlink strength, 0–100'} />;
}
