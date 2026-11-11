import { LIVE_MAX_PAGES, executeRun } from '@/lib/engine/pipeline';
import { newRun, ownerCredsFor } from '@/lib/engine/runner';
import { takeRunBudget, vetUrl } from '@/lib/engine/request-guard';
import { normalizeShopDomain } from '@/lib/engine/shopify-admin';
import type { Run, Strategy } from '@/lib/engine/types';

/*
 * Live audit: runs one audit inside this request and streams it to the browser as NDJSON lines.
 * Nothing is stored: when the tab closes, the report is gone. Works on serverless hosts (Vercel)
 * because all the work happens while the response is still open.
 *
 *   {"type":"progress","run":{...}}   every ~1.5 s (light: no page results)
 *   {"type":"done","run":{...}}       once, the full report
 *   {"type":"error","error":"..."}    the audit could not run
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel's limit for one request (Hobby with Fluid compute: up to 300 s). Must be a literal.
export const maxDuration = 300;

// New work stops after this long, leaving time for in-flight tests and building the report.
const BUDGET_MS = Math.max(30, Math.min(270, Number(process.env.AUDIT_TIME_BUDGET_SECONDS) || 230)) * 1000;
const MAX_LIVE = Math.max(1, Number(process.env.MAX_PENDING_RUNS) || 12); // per server instance

const g = globalThis as unknown as { __liveAudits?: { n: number } };
const live = (g.__liveAudits ||= { n: 0 });

const json = (body: any, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Progress snapshot without the heavy per-page results. */
function light(run: Run) {
  return {
    ...run,
    psiTests: run.psiTests.map(({ result, ...t }) => t),
    crawl: [],
    findings: [],
    apps: [],
    browser: undefined,
    owner: undefined,
    catalog: undefined,
  };
}

/** Body: { url, pages?, strategies?, customUrls?, psiApiKey?, browserTests?, cartFlow?, ownerShop?, ownerToken? } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const vetted = await vetUrl(String(body.url || ''));
  if (vetted.ok === false) return json({ error: vetted.error }, 400);

  const strategies = (Array.isArray(body.strategies) ? body.strategies.filter((s: any) => s === 'mobile' || s === 'desktop') : ['mobile', 'desktop']) as Strategy[];
  const pages = Math.max(1, Math.min(LIVE_MAX_PAGES, Number(body.pages) || 10));
  const customUrls = Array.isArray(body.customUrls) ? body.customUrls.map(String).filter(Boolean).slice(0, LIVE_MAX_PAGES) : undefined;
  const apiKey = typeof body.psiApiKey === 'string' && body.psiApiKey.trim() ? body.psiApiKey.trim() : undefined;

  let owner;
  if (body.ownerToken) {
    const shop = normalizeShopDomain(String(body.ownerShop || ''));
    if (!shop) return json({ error: 'ownerShop must be your-store.myshopify.com' }, 400);
    owner = { shop, token: String(body.ownerToken).trim() };
  }

  if (live.n >= MAX_LIVE) return json({ error: `The server is busy (${live.n} audits running). Try again in a few minutes.` }, 429);
  const limited = takeRunBudget(req, 1);
  if (limited) return json({ error: limited }, 429);

  const run = newRun(
    { url: vetted.url, pages, strategies: strategies.length ? strategies : ['mobile'], customUrls: customUrls?.length ? customUrls : undefined, browserTests: body.browserTests !== false, cartFlow: !!body.cartFlow, role: 'primary' },
    !!(apiKey || owner)
  );
  if (Array.isArray(body.competitors) && body.competitors.length) run.warnings.push('Competitor benchmarks need stored audits and are not available on this deployment.');

  const started = Date.now();
  let cancelled = false;
  let closed = false;
  req.signal?.addEventListener('abort', () => (cancelled = true));

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));
        } catch {
          closed = true;
          cancelled = true;
        }
      };
      live.n++;
      run.status = 'running';
      send({ type: 'progress', run: light(run) });
      const tick = setInterval(() => send({ type: 'progress', run: light(run) }), 1500);
      try {
        await executeRun(run, {
          apiKey: apiKey || process.env.PSI_API_KEY || undefined,
          owner: ownerCredsFor(run, { owner }),
          isCancelled: () => cancelled,
          deadline: started + BUDGET_MS,
        });
        run.status = cancelled ? 'cancelled' : 'completed';
        if (run.psiTests.some((t) => /audit time limit/.test(t.error || ''))) {
          run.warnings.unshift(`The audit reached its ${Math.round(BUDGET_MS / 1000)} s time limit on this host, so some tests did not run or finish (listed as “Not run” or “Not finished”). Audit fewer pages or only one device for a complete report.`);
        }
      } catch (e: any) {
        run.status = 'failed';
        run.error = e?.message || String(e);
      } finally {
        clearInterval(tick);
        live.n--;
      }
      run.progress.stage = run.status;
      run.progress.waitUntil = undefined;
      run.finishedAt = new Date().toISOString();
      send({ type: 'done', run });
      if (!closed) {
        closed = true;
        controller.close();
      }
    },
    cancel() {
      closed = true;
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  });
}
