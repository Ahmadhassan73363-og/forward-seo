'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarClock, Gauge, Globe, Key, ListChecks, MessageSquareText, Store, Users } from 'lucide-react';
import { AppHeader } from './components/app-header';
import type { RunSummary } from '@/lib/engine/types';
import Schedules from './components/schedules';
import { Card, scoreColor } from './components/ui';
import { ConnectedSources } from './components/connected-sources';

const LIVE_KEY = 'liveAuditRequest'; // same key as app/live/page.tsx

const STATUS_STYLE: Record<string, string> = {
  queued: 'text-neutral-700 bg-neutral-500/15',
  running: 'text-sky-700 bg-sky-500/15',
  completed: 'text-emerald-700 bg-emerald-500/15',
  failed: 'text-rose-700 bg-rose-500/15',
  cancelled: 'text-neutral-600 bg-neutral-400/20',
};

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [pages, setPages] = useState(20);
  const [mobile, setMobile] = useState(true);
  const [desktop, setDesktop] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customUrls, setCustomUrls] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [serverKey, setServerKey] = useState<boolean | null>(null);
  const [caps, setCaps] = useState<{ browserAvailable: boolean; ownerConfigured: boolean; ownerShop: string | null; alertWebhook: boolean; ephemeral: boolean; ahrefsPlan: 'off' | 'free' | 'paid'; semrush: boolean; searchConsole: { email: string | null; problem: string | null } | null; google: { email: string | null; problem: string | null } | null; ga4: boolean; merchant: boolean; aiEngines: string[]; aiOverviews: boolean; otterly: boolean; mockMode: boolean } | null>(null);
  const [aiBrand, setAiBrand] = useState('');
  const [aiCompetitors, setAiCompetitors] = useState('');
  const [aiPrompts, setAiPrompts] = useState('');
  const ephemeral = !!caps?.ephemeral;
  const [browserTests, setBrowserTests] = useState(true);
  const [cartFlow, setCartFlow] = useState(false);
  const [competitors, setCompetitors] = useState('');
  const [ownerShop, setOwnerShop] = useState('');
  const [ownerToken, setOwnerToken] = useState('');
  const [maxPages, setMaxPages] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then((d) => {
        setRuns(d.runs || []);
        setServerKey(!!d.serverKey);
        setMaxPages(d.maxPages || 100);
        if (d.ephemeral) setPages((p) => Math.min(p, 10)); // a live audit must finish within one request
        setCaps({ browserAvailable: !!d.browserAvailable, ownerConfigured: !!d.ownerConfigured, ownerShop: d.ownerShop, alertWebhook: !!d.alertWebhook, ephemeral: !!d.ephemeral, ahrefsPlan: d.ahrefsPlan === 'paid' || d.ahrefsPlan === 'free' ? d.ahrefsPlan : 'off', semrush: !!d.semrush, searchConsole: d.searchConsole && typeof d.searchConsole === 'object' ? { email: d.searchConsole.email || null, problem: d.searchConsole.problem || null } : null, google: d.google && typeof d.google === 'object' ? { email: d.google.email || null, problem: d.google.problem || null } : null, ga4: !!d.ga4, merchant: !!d.merchant, aiEngines: Array.isArray(d.aiEngines) ? d.aiEngines.map(String) : [], aiOverviews: !!d.aiOverviews, otterly: !!d.otterly, mockMode: !!d.mockMode });
      })
      .catch(() => setServerKey(false));
  }, []);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    const strategies = [mobile && 'mobile', desktop && 'desktop'].filter(Boolean);
    const request = JSON.stringify({
        url: url.trim(),
        pages,
        strategies,
        psiApiKey: apiKey.trim() || undefined,
        browserTests,
        cartFlow,
        competitors: competitors.split(/\s+/).map((x) => x.trim()).filter(Boolean),
        ownerShop: ownerToken.trim() ? ownerShop.trim() : undefined,
        ownerToken: ownerToken.trim() || undefined,
        ai: { brand: aiBrand.trim() || undefined, competitors: aiCompetitors, prompts: aiPrompts },
        customUrls: customUrls
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
    });
    if (ephemeral) {
      // No storage on this deployment: the audit streams into the /live tab and is never saved.
      try {
        sessionStorage.setItem(LIVE_KEY, request);
      } catch {
        setSubmitting(false);
        setError('Your browser blocked session storage, which live audits need. Allow site data for this page and try again.');
        return;
      }
      router.push('/live');
      return;
    }
    const res = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setSubmitting(false);
    if (!res?.ok || !data?.id) {
      setError(
        data?.error ||
          (res
            ? `Could not start the audit: the server answered HTTP ${res.status} without an explanation. Check the server logs (on Vercel: Project → Logs).`
            : 'Could not start the audit: the server could not be reached.')
      );
      return;
    }
    router.push(`/runs/${data.id}`);
  };

  const psiCalls = pages * ((mobile ? 1 : 0) + (desktop ? 1 : 0));

  return (
    <div className="min-h-screen text-neutral-900">
      <AppHeader width="max-w-6xl" />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        <div className="max-w-3xl mx-auto space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">New audit</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">Audit a Shopify store</h1>
          <p className="text-neutral-600 text-sm leading-relaxed">
            PageSpeed Insights and Chrome real-user data for every page tested, plus Shopify-specific checks for SEO, structured data, URLs, app cost,
            accessibility, AI search and conversion. Each issue lists the affected elements and a fix. Other platforms get the general web checks only.
          </p>
        </div>

        <Card className="max-w-3xl mx-auto">
          <form onSubmit={start} className="space-y-4">
            <div className="flex items-center gap-2 bg-white/80 border border-neutral-300/80 rounded-xl p-1.5 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
              <Globe className="w-4 h-4 text-neutral-400 ml-2" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="your-store.com or your-store.myshopify.com"
                className="flex-1 bg-transparent px-2 py-2 text-sm focus:outline-none"
                aria-label="Store URL"
              />
              <button
                type="submit"
                disabled={submitting || !url.trim() || (!mobile && !desktop)}
                className="bg-gradient-to-b from-brand-500 to-brand-700 hover:from-brand-600 hover:to-brand-800 text-white text-sm font-semibold px-5 py-2 rounded-lg shadow-[0_8px_18px_-8px_rgba(183,18,52,0.75),inset_0_1px_0_rgba(255,255,255,0.25)] disabled:opacity-50 disabled:shadow-none inline-flex items-center gap-2"
              >
                {submitting ? 'Starting…' : 'Run audit'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-neutral-700">
              <label className="flex items-center gap-2">
                Pages to test
                <select value={pages} onChange={(e) => setPages(Number(e.target.value))} className="bg-white/70 border border-neutral-300 rounded px-2 py-1">
                  {[5, 10, 20, 40, 60, maxPages].filter((v, i, a) => v <= maxPages && a.indexOf(v) === i).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={mobile} onChange={(e) => setMobile(e.target.checked)} /> Mobile
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={desktop} onChange={(e) => setDesktop(e.target.checked)} /> Desktop
              </label>
              <span className="text-neutral-500">
                {psiCalls} PageSpeed tests · ~{Math.max(1, Math.round((psiCalls * 25) / (ephemeral ? 8 : 4) / 60))} min
              </span>
              <label className="flex items-center gap-1.5" title={caps && !caps.browserAvailable ? 'No Chrome/Edge found on the server' : ''}>
                <input type="checkbox" checked={browserTests} onChange={(e) => setBrowserTests(e.target.checked)} disabled={caps ? !caps.browserAvailable : false} /> Browser tests
              </label>
              <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="ml-auto text-neutral-600 hover:text-brand">
                {showAdvanced ? 'Hide options' : 'More options'}
              </button>
            </div>

            {serverKey === false && (
              <p className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                No PSI_API_KEY is set on the server. Add a Google API key below (PageSpeed Insights API + Chrome UX Report API enabled) — without one Google
                rejects most requests with HTTP 429.
              </p>
            )}

            {(showAdvanced || serverKey === false) && (
              <div className="space-y-3 border-t border-neutral-200 pt-4">
                <label className="block text-xs space-y-1">
                  <span className="text-neutral-700 inline-flex items-center gap-1">
                    <Key className="w-3.5 h-3.5" /> Google API key {serverKey ? '(optional — server key is configured)' : ''}
                  </span>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIza…"
                    className="w-full bg-white/70 border border-neutral-300 rounded-lg px-3 py-2 font-mono"
                  />
                  <span className="text-[11px] text-neutral-500">Used for this run only; kept in server memory, never saved to disk.</span>
                </label>
                {showAdvanced && !ephemeral && (
                  <label className="flex items-start gap-2 text-xs text-neutral-700">
                    <input type="checkbox" className="mt-0.5" checked={cartFlow} onChange={(e) => setCartFlow(e.target.checked)} disabled={!browserTests} />
                    <span>
                      Test add to cart → cart → checkout in a real mobile browser
                      <span className="block text-[11px] text-neutral-500">Creates a cart on the store and opens checkout, then clears the cart. Never enters customer or payment details. Use on your own stores.</span>
                    </span>
                  </label>
                )}
                {showAdvanced && !ephemeral && (
                  <label className="block text-xs space-y-1">
                    <span className="text-neutral-700 inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> Competitors to benchmark (optional, up to 5, one per line)
                    </span>
                    <textarea value={competitors} onChange={(e) => setCompetitors(e.target.value)} rows={2} placeholder={'competitor-one.com\ncompetitor-two.com'} className="w-full bg-white/70 border border-neutral-300 rounded-lg px-3 py-2 font-mono" />
                    <span className="text-[11px] text-neutral-500">Each competitor gets the same public checks on up to 10 pages; results appear side by side.</span>
                  </label>
                )}
                {showAdvanced && (
                  <div className="text-xs space-y-1">
                    <span className="text-neutral-700 inline-flex items-center gap-1">
                      <Store className="w-3.5 h-3.5" /> Owner mode — full catalog via Shopify Admin API (optional)
                    </span>
                    {caps?.ownerConfigured && <p className="text-[11px] text-emerald-700">Server token configured for {caps.ownerShop}; used automatically when auditing that store.</p>}
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input value={ownerShop} onChange={(e) => setOwnerShop(e.target.value)} placeholder="your-store.myshopify.com" className="bg-white/70 border border-neutral-300 rounded-lg px-3 py-2 font-mono" />
                      <input type="password" value={ownerToken} onChange={(e) => setOwnerToken(e.target.value)} placeholder="Admin API access token (shpat_…)" className="bg-white/70 border border-neutral-300 rounded-lg px-3 py-2 font-mono" />
                    </div>
                    <span className="text-[11px] text-neutral-500">Read-only scopes: read_products, read_content, read_themes. Kept in memory for this run only; ignored if it belongs to a different store.</span>
                  </div>
                )}
                {showAdvanced && (
                  <label className="block text-xs space-y-1">
                    <span className="text-neutral-700 inline-flex items-center gap-1">
                      <ListChecks className="w-3.5 h-3.5" /> Specific URLs (optional, one per line)
                    </span>
                    <textarea
                      value={customUrls}
                      onChange={(e) => setCustomUrls(e.target.value)}
                      rows={4}
                      placeholder={'https://your-store.com/products/best-seller\nhttps://your-store.com/collections/new'}
                      className="w-full bg-white/70 border border-neutral-300 rounded-lg px-3 py-2 font-mono"
                    />
                    <span className="text-[11px] text-neutral-500">Leave empty to pick pages automatically from the sitemap (products, collections, pages, articles).</span>
                  </label>
                )}
              </div>
            )}
            {ephemeral && (
              <p className="text-[11px] text-neutral-600 bg-neutral-900/[0.04] border border-neutral-300/60 rounded-lg px-3 py-2">
                Live mode: the audit runs while its tab is open and the report is not saved. Up to {maxPages} pages; large audits may hit the host&apos;s time limit, and
                anything not finished is shown as “Not run”. Browser tests, cart flow, competitors and schedules need a server with storage.
              </p>
            )}
            {caps && (caps.aiEngines.length > 0 || caps.aiOverviews || !!caps.searchConsole) && (
              <div className="border-t border-neutral-200 pt-3 space-y-2 text-xs">
                <span className="text-neutral-700 inline-flex items-center gap-1">
                  <MessageSquareText className="w-3.5 h-3.5" /> Brand and AI search (optional)
                </span>
                <div className="grid sm:grid-cols-2 gap-2">
                  <input value={aiBrand} onChange={(e) => setAiBrand(e.target.value)} placeholder="Brand name as people say it (default: from the domain)" className="bg-white/70 border border-neutral-300 rounded-lg px-3 py-2" />
                  <input value={aiCompetitors} onChange={(e) => setAiCompetitors(e.target.value)} placeholder="Competitor brands or domains, comma-separated" className="bg-white/70 border border-neutral-300 rounded-lg px-3 py-2" />
                </div>
                {caps.aiEngines.length > 0 && (
                  <textarea value={aiPrompts} onChange={(e) => setAiPrompts(e.target.value)} rows={2} placeholder={'Your own buyer questions, one per line (optional)\ne.g. best waterproof hiking boots for wide feet'} className="w-full bg-white/70 border border-neutral-300 rounded-lg px-3 py-2" />
                )}
                <span className="text-[11px] text-neutral-500 block">
                  The brand is used for Search Console&apos;s brand split and for spotting your brand in AI answers. Without your own questions, they come from your top Search Console queries and collections.
                </span>
              </div>
            )}
            {caps && <ConnectedSources caps={caps} />}
            {error && <p className="text-xs text-rose-700">{error}</p>}
          </form>
        </Card>

        {!ephemeral && <Schedules alertWebhookConfigured={!!caps?.alertWebhook} />}

        {!ephemeral && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-900 text-neutral-700 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-brand" /> Recent audits
          </h2>
          {runs.length === 0 ? (
            <p className="text-xs text-neutral-500">No audits yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-neutral-200">
              <table className="w-full text-xs">
                <thead className="bg-white/60 text-neutral-600 uppercase text-[10px]">
                  <tr>
                    <th className="text-left px-4 py-2">Store</th>
                    <th className="text-left px-4 py-2">Started</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Score</th>
                    <th className="text-left px-4 py-2">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/70">
                  {runs.map((r) => (
                    <tr key={r.id} className="hover:bg-white/55 cursor-pointer" onClick={() => router.push(`/runs/${r.id}`)}>
                      <td className="px-4 py-2 font-mono text-neutral-800">
                        {r.host || r.url}
                        {r.platform && r.platform !== 'Shopify' && <span className="ml-2 text-[10px] text-amber-700">{r.platform}</span>}
                        {r.role === 'competitor' && <span className="ml-2 text-[10px] text-neutral-500">competitor</span>}
                        {r.scheduleId && <CalendarClock className="inline w-3 h-3 ml-2 text-neutral-500" />}
                        {r.groupId && r.role === 'primary' && (
                          <a href={`/benchmark/${r.groupId}`} onClick={(e) => e.stopPropagation()} className="ml-2 text-[10px] text-brand hover:underline">
                            benchmark
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                      </td>
                      <td className={`px-4 py-2 font-bold ${r.grade === 'Incomplete' ? 'text-neutral-600' : scoreColor(r.overall)}`}>
                        {/* An incomplete run's number covers only some modules, so it isn't shown as a score. */}
                        {r.grade === 'Incomplete' ? (
                          <span className="font-normal">Incomplete</span>
                        ) : (
                          <>
                            {r.overall ?? '—'} {r.grade && <span className="text-neutral-500 font-normal">({r.grade})</span>}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2 text-neutral-700">{r.findings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}
      </main>
    </div>
  );
}
