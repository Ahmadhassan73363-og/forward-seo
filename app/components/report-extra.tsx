'use client';

import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AxeViolation, BrowserPage, Run } from '@/lib/engine/types';
import { Card, CopyButton, fmtMs, shortUrl } from './ui';

const IMPACT_STYLE: Record<string, string> = {
  critical: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  serious: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  moderate: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  minor: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
};

// Live audits carry screenshots inline as data: URIs; stored runs serve them from the API.
export const shotUrl = (runId: string, f?: string) => (!f ? undefined : f.startsWith('data:image/') ? f : `/api/runs/${runId}/screenshot?f=${encodeURIComponent(f)}`);

// ─── Browser tests (Phase 3) ────────────────────────────────────────────────

export function BrowserTab({ run }: { run: Run }) {
  const b = run.browser!;
  if (b.status !== 'ok') return <Card className="text-xs text-slate-300">Browser tests {b.status}: {b.message}</Card>;
  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400">
        Real mobile browser ({b.browser}) on a 390×844 viewport. axe-core WCAG 2.2 AA checks after load (and with the mobile menu open on the homepage), JSON-LD in the rendered page vs the
        server HTML, and console errors.
      </p>

      {b.flow && (
        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            Add to cart → checkout flow
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${b.flow.reachedCheckout ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
              {b.flow.reachedCheckout ? 'checkout reached' : b.flow.addedToCart ? 'checkout not reached' : 'add to cart failed'}
            </span>
          </div>
          <a href={b.flow.productUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono text-slate-400 hover:text-emerald-400">
            {b.flow.productUrl}
          </a>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {b.flow.steps.map((s, i) => (
              <div key={i} className={`rounded-xl border p-2 space-y-1 ${s.ok ? 'border-slate-800' : 'border-rose-500/40'}`}>
                <div className="text-xs font-semibold">
                  {s.ok ? '✓' : '✗'} {s.name} <span className="text-slate-500 font-normal">{fmtMs(s.ms)}</span>
                </div>
                {s.detail && <div className="text-[11px] text-slate-400">{s.detail}</div>}
                {s.screenshot && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shotUrl(run.id, s.screenshot)} alt={`${s.name} screenshot`} className="rounded border border-slate-800 w-full" />
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">The test stops at checkout before any customer details and clears the cart afterwards.</p>
        </Card>
      )}

      {b.pages.map((p, i) => (
        <BrowserPageCard key={`${p.url}-${p.context}-${i}`} run={run} p={p} />
      ))}
    </div>
  );
}

function BrowserPageCard({ run, p }: { run: Run; p: BrowserPage }) {
  const [open, setOpen] = useState<string | null>(null);
  const total = p.axe.reduce((s, v) => s + v.count, 0);
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-emerald-300 hover:underline">
          {shortUrl(p.url)}
        </a>
        <span className="text-[11px] text-slate-400">
          {p.type} · {p.context}
          {p.loadMs ? ` · loaded in ${fmtMs(p.loadMs)}` : ''}
        </span>
        {!p.ok && <span className="text-[11px] text-rose-300">{p.error}</span>}
        {p.ok && (
          <span className="ml-auto text-[11px] text-slate-300">
            {p.axe.length} accessibility rules failed · {total} elements · {p.consoleErrors.length} console errors
          </span>
        )}
      </div>
      {p.ok && (
        <div className="grid lg:grid-cols-4 gap-4">
          {p.screenshot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shotUrl(run.id, p.screenshot)} alt={`${p.context} screenshot`} className="rounded-lg border border-slate-800 w-full max-w-[200px]" />
          )}
          <div className={`${p.screenshot ? 'lg:col-span-3' : 'lg:col-span-4'} space-y-3`}>
            {p.axe.length === 0 && <p className="text-xs text-emerald-300">No axe violations.</p>}
            {p.axe.map((v: AxeViolation) => (
              <div key={v.id} className="border border-slate-800 rounded-lg">
                <button onClick={() => setOpen(open === v.id ? null : v.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${IMPACT_STYLE[v.impact || 'minor']}`}>{v.impact || 'minor'}</span>
                  <span className="text-slate-200 flex-1">{v.help}</span>
                  <span className="text-slate-500">{v.count} el.</span>
                </button>
                {open === v.id && (
                  <div className="px-3 pb-3 space-y-1">
                    {v.nodes.map((n, i) => (
                      <div key={i} className="text-[11px]">
                        <code className="text-sky-300 break-all">{n.target}</code>
                        <code className="block text-slate-500 break-all">{n.html}</code>
                      </div>
                    ))}
                    <a href={v.helpUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-400 inline-flex items-center gap-1">
                      How to fix ({v.id}) <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            ))}
            {p.context === 'loaded' && (
              <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                  <div className="text-slate-500">Schema in server HTML</div>
                  <div className="text-slate-200">{p.serverSchemaTypes.join(', ') || 'none'}</div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                  <div className="text-slate-500">Schema after JavaScript</div>
                  <div className="text-slate-200">
                    {p.renderedSchemaTypes.join(', ') || 'none'}
                    {p.jsInjectedSchema.length > 0 && <span className="text-amber-300"> (JS-only: {p.jsInjectedSchema.join(', ')})</span>}
                  </div>
                </div>
              </div>
            )}
            {p.consoleErrors.length > 0 && (
              <div className="text-[11px] space-y-0.5">
                <div className="text-slate-400">Console errors</div>
                {p.consoleErrors.slice(0, 10).map((e, i) => (
                  <code key={i} className="block text-rose-300 break-all">
                    {e}
                  </code>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Catalog / owner mode (Phase 4) ─────────────────────────────────────────

const CHECK_LABELS: Record<string, string> = {
  owner_missing_meta: 'No SEO description',
  owner_title_long: 'SEO title over 70 characters',
  owner_thin_description: 'Thin description (< 50 words)',
  owner_duplicate_description: 'Duplicate description',
  owner_no_images: 'No images',
  owner_media_alt: 'Images without alt text',
  owner_missing_barcode: 'No barcode (GTIN)',
  owner_oos_indexed: 'Out of stock but published',
  owner_empty_collections: 'Empty collections',
  owner_collection_no_description: 'Collections without description',
};

export function CatalogTab({ run }: { run: Run }) {
  // Owner mode (Admin API) wins; otherwise the public product feed.
  const o = run.owner?.status === 'ok' || !run.catalog ? run.owner! : run.catalog;
  const feed = o.via === 'feed';
  const [check, setCheck] = useState<string | null>(null);
  if (o.status !== 'ok') return <Card className="text-xs text-slate-300">{feed ? 'Catalog feed' : 'Owner mode'} {o.status}: {o.message}</Card>;
  const entries = Object.entries(o.issues || {}).filter(([, v]) => v.length);
  const sel = check ? o.issues![check] : null;
  return (
    <div className="space-y-5">
      <Card className="grid sm:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="text-slate-500">{feed ? 'Source' : 'Shop'}</div>
          <div className="font-semibold">{feed ? 'Public product feed' : o.shop?.name}</div>
          <div className="text-slate-400 font-mono">{feed ? '/products.json + /collections.json' : o.shop?.myshopifyDomain}</div>
        </div>
        <div>
          <div className="text-slate-500">Products</div>
          <div className="font-semibold">
            {o.counts?.activeProducts} active of {o.counts?.products}
          </div>
          <div className="text-slate-400">{o.counts?.productsScanned} scanned{o.truncated ? ' (limit reached)' : ''}</div>
        </div>
        <div>
          <div className="text-slate-500">Collections</div>
          <div className="font-semibold">{o.counts?.collections}</div>
        </div>
        <div>
          <div className="text-slate-500">URL redirects</div>
          <div className="font-semibold">{o.counts?.redirects ?? '—'}</div>
        </div>
      </Card>
      {o.message && <p className="text-xs text-amber-300">{o.message}</p>}
      {feed && (
        <p className="text-xs text-slate-400">
          Every published product and collection, read from Shopify's public feed. SEO titles and descriptions, image alt text and barcodes are not in the feed. Connect owner mode (Admin API token) to check those too.
        </p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.length === 0 && <Card className="text-xs text-emerald-300">No catalog issues found.</Card>}
        {entries.map(([k, v]) => (
          <button key={k} onClick={() => setCheck(check === k ? null : k)} className={`text-left rounded-2xl border p-4 ${check === k ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
            <div className="text-2xl font-black text-amber-300">{(o.totals?.[k] ?? v.length).toLocaleString('en-US')}</div>
            <div className="text-xs text-slate-300">{CHECK_LABELS[k] || k}</div>
          </button>
        ))}
      </div>

      {sel && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold">
              {CHECK_LABELS[check!] || check}
              {(o.totals?.[check!] ?? sel.length) > sel.length && (
                <span className="ml-2 text-[11px] font-normal text-slate-400">
                  first {sel.length} of {(o.totals?.[check!] ?? 0).toLocaleString('en-US')} listed
                </span>
              )}
            </div>
            <CopyButton text={sel.map((i) => i.url).join('\n')} label={`Copy ${sel.length} URLs`} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-[480px]">
            <table className="w-full text-[11px]">
              <tbody className="divide-y divide-slate-800/60">
                {sel.map((i) => (
                  <tr key={i.handle}>
                    <td className="px-3 py-1.5 text-slate-200">{i.title}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-400">
                      <a href={i.url} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400">
                        {shortUrl(i.url)}
                      </a>
                    </td>
                    <td className="px-3 py-1.5 text-amber-200">{i.issue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {o.themeScripts && (
        <Card className="space-y-2 text-xs">
          <div className="text-sm font-bold">Third-party scripts hard-coded in layout/theme.liquid ({o.themeName})</div>
          {o.themeScripts.length === 0 && <p className="text-emerald-300">None — app scripts are loaded through app embeds or Customer events.</p>}
          {o.themeScripts.map((t) => (
            <div key={t.domain} className="flex justify-between bg-slate-950/60 rounded px-3 py-1.5">
              <span className="font-mono">{t.domain}</span>
              <span className="text-slate-400">{t.app || 'unknown app'}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
