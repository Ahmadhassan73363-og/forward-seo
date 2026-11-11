import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createRun, ensureRecovered, pendingRuns, serverConfig } from '@/lib/engine/runner';
import { listRuns } from '@/lib/engine/store';
import { LIVE_MAX_PAGES, MAX_PAGES } from '@/lib/engine/pipeline';
import { findBrowser } from '@/lib/engine/browser';
import { takeRunBudget, vetUrl } from '@/lib/engine/request-guard';
import { EPHEMERAL } from '@/lib/engine/store';
import { normalizeShopDomain } from '@/lib/engine/shopify-admin';
import type { Strategy } from '@/lib/engine/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_COMPETITORS = 5;
const MAX_PENDING_RUNS = Math.max(1, Number(process.env.MAX_PENDING_RUNS) || 12); // queued + running, server-wide
/** List recent runs (optionally ?group=<groupId>) plus server capabilities. */
export async function GET(req: Request) {
  await ensureRecovered();
  const group = new URL(req.url).searchParams.get('group');
  let runs = await listRuns(group ? 200 : 50);
  if (group) runs = runs.filter((r) => r.groupId === group);
  return NextResponse.json({ runs, ...serverConfig(), browserAvailable: !!findBrowser(), maxPages: EPHEMERAL ? LIVE_MAX_PAGES : MAX_PAGES });
}

/**
 * Start a run. Body:
 * { url, pages?, strategies?, customUrls?, psiApiKey?, browserTests?, cartFlow?, competitors?: string[], ownerShop?, ownerToken? }
 */
export async function POST(req: Request) {
  if (EPHEMERAL) return NextResponse.json({ error: 'This deployment keeps no stored audits. Start audits from the home page; they run live in your browser tab.' }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const vetted = await vetUrl(String(body.url || ''));
  if (vetted.ok === false) return NextResponse.json({ error: vetted.error }, { status: 400 });
  const url = vetted.url;

  const strategies: Strategy[] = Array.isArray(body.strategies)
    ? (body.strategies.filter((s: any) => s === 'mobile' || s === 'desktop') as Strategy[])
    : ['mobile', 'desktop'];
  const customUrls = Array.isArray(body.customUrls) ? body.customUrls.map(String).filter(Boolean).slice(0, MAX_PAGES) : undefined;
  const pages = Math.max(1, Math.min(MAX_PAGES, Number(body.pages) || 20));
  const apiKey = typeof body.psiApiKey === 'string' && body.psiApiKey.trim() ? body.psiApiKey.trim() : undefined;
  const browserTests = body.browserTests !== false;

  let owner;
  if (body.ownerToken) {
    const shop = normalizeShopDomain(String(body.ownerShop || ''));
    if (!shop) return NextResponse.json({ error: 'ownerShop must be your-store.myshopify.com' }, { status: 400 });
    owner = { shop, token: String(body.ownerToken).trim() };
  }

  const skipped: string[] = [];
  const competitors: string[] = [];
  const rawCompetitors: string[] = Array.isArray(body.competitors) ? body.competitors.map((x: any) => String(x).trim()).filter(Boolean) : [];
  for (const c of rawCompetitors) {
    if (competitors.length >= MAX_COMPETITORS) {
      skipped.push(`${c} (limit of ${MAX_COMPETITORS} competitors)`);
      continue;
    }
    const v = await vetUrl(c);
    if (v.ok === true) competitors.push(v.url);
    else skipped.push(`${c} (${v.error})`);
  }

  // Abuse limits: server-wide queue depth and a per-client hourly budget.
  const needed = 1 + competitors.length;
  const pending = pendingRuns();
  if (pending + needed > MAX_PENDING_RUNS) {
    return NextResponse.json({ error: `The server is busy (${pending} audits queued or running, limit ${MAX_PENDING_RUNS}). Try again when some have finished.` }, { status: 429 });
  }
  const limited = takeRunBudget(req, needed);
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  const groupId = competitors.length ? `grp-${crypto.randomBytes(5).toString('hex')}` : undefined;
  const run = await createRun(
    {
      url,
      pages,
      strategies: strategies.length ? strategies : ['mobile'],
      customUrls: customUrls?.length ? customUrls : undefined,
      browserTests,
      cartFlow: !!body.cartFlow,
      groupId,
      role: 'primary',
    },
    { apiKey, owner }
  );

  // Competitors: same checks, smaller sample, no cart flow and never owner credentials.
  for (const c of competitors) {
    await createRun({ url: c, pages: Math.min(pages, 10), strategies: strategies.length ? strategies : ['mobile'], browserTests, cartFlow: false, groupId, role: 'competitor' }, { apiKey });
  }

  return NextResponse.json({ id: run.id, groupId, skippedCompetitors: skipped.length ? skipped : undefined }, { status: 201 });
}
