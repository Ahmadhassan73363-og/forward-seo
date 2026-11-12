import React from 'react';
import type { AhrefsData } from '@/lib/engine/types';
import { Stat } from '../shared/stat';

/** Free tier: Domain Rating (available with either key). */
export function DomainRatingCard({ dr }: { dr: AhrefsData['domainRating'] }) {
  return <Stat source="ahrefs" label="Domain Rating" value={dr.value === undefined ? '—' : String(dr.value)} sub={dr.value === undefined ? dr.error || 'No value returned' : 'Backlink strength, 0–100'} />;
}
