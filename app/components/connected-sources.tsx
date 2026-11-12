import React from 'react';
import { SourceBadge, type SourceId } from './shared/source';

export interface SourceCaps {
  ahrefsPlan: 'off' | 'free' | 'paid';
  semrush: boolean;
  searchConsole: { email: string | null; problem: string | null } | null;
  google: { email: string | null; problem: string | null } | null;
  ga4: boolean;
  merchant: boolean;
  aiEngines: string[];
  aiOverviews: boolean;
  otterly: boolean;
  mockMode: boolean;
}

const ENGINE_IDS: Record<string, SourceId> = { ChatGPT: 'chatgpt', Perplexity: 'perplexity', Gemini: 'gemini' };

/** The connected third-party sources, each with its mark (no keys, only names). */
export function ConnectedSources({ caps }: { caps: SourceCaps }) {
  const on: Array<{ id: SourceId; label?: string }> = [];
  if (caps.searchConsole && !caps.searchConsole.problem) on.push({ id: 'searchConsole' });
  if (caps.ga4 && !caps.google?.problem) on.push({ id: 'ga4', label: 'GA4' });
  if (caps.merchant && !caps.google?.problem) on.push({ id: 'merchant' });
  if (caps.ahrefsPlan !== 'off') on.push({ id: 'ahrefs', label: `Ahrefs (${caps.ahrefsPlan})` });
  if (caps.semrush) on.push({ id: 'semrush' });
  for (const e of caps.aiEngines) {
    const name = e.split(' (')[0];
    if (ENGINE_IDS[name]) on.push({ id: ENGINE_IDS[name], label: name });
  }
  if (caps.aiOverviews) on.push({ id: 'dataforseo', label: 'AI Overviews (DataForSEO)' });
  if (caps.otterly) on.push({ id: 'otterly' });
  const googleUsers = caps.google?.email && (caps.searchConsole || caps.ga4 || caps.merchant);
  if (!on.length && !caps.google?.problem) return null;
  return (
    <div className="border-t border-neutral-200 pt-3 space-y-2 text-[11px] text-neutral-600">
      {caps.mockMode && (
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1">Test mode: third-party data comes from the local mock server (MOCK_API_BASE) and is dummy data.</p>
      )}
      {on.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-medium text-neutral-700">Connected data sources</p>
          <div className="flex flex-wrap gap-1.5">
            {on.map((s) => (
              <SourceBadge key={s.id} id={s.id} label={s.label} />
            ))}
          </div>
          <p className="text-neutral-500">Their data is added to the report and the SEO &amp; AI dashboard. It does not change the audit score.</p>
        </div>
      )}
      {caps.google?.problem && <p className="text-amber-800">Google service account problem: {caps.google.problem}.</p>}
      {googleUsers && !caps.google?.problem && (
        <p className="text-neutral-500">
          Google data appears for stores that gave <span className="font-mono break-all text-neutral-700">{caps.google!.email}</span> access in Search Console{caps.ga4 ? ', GA4' : ''}
          {caps.merchant ? ', Merchant Center' : ''}.
        </p>
      )}
    </div>
  );
}
