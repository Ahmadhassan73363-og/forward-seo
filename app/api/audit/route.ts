import { NextResponse } from 'next/server';
import { crawlBatch, queryGooglePageSpeed, CRAWL_DEADLINE_MS } from '@/lib/audit/core';
import { buildReport } from '@/lib/audit/report';
import { clampMaxPages, discover, normalizeInput } from '@/lib/audit/discover';

// Single-request audit, kept for API callers. It has to finish within one function call, so it
// can't sit out Shopify's 60s Retry-After. The UI uses the batched /discover → /crawl → /report
// flow instead, which can wait as long as the store asks.
export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const input = normalizeInput(body.url);
    if ('error' in input) return NextResponse.json({ status: 'error', message: input.error }, { status: 400 });
    const apiKey = String(body.psiApiKey || '').trim();
    const origin = `${input.url.protocol}//${input.url.hostname}/`;

    const psiPromise = Promise.all([queryGooglePageSpeed(origin, 'mobile', apiKey), queryGooglePageSpeed(origin, 'desktop', apiKey)]);

    const d = await discover(input.url, clampMaxPages(body.maxPages));
    if (d.ok === false) return NextResponse.json({ status: 'error', message: d.message }, { status: d.status });
    const { ctx } = d;

    const crawl = await crawlBatch(ctx.targets, ctx.host, undefined, ctx.startedAt + CRAWL_DEADLINE_MS);
    const [psiMobileRes, psiDesktopRes] = await psiPromise;

    const report = buildReport({
      ctx,
      pages: crawl.results,
      psiMobileRes,
      psiDesktopRes,
      skippedCount: crawl.remaining.length,
      skippedReason: crawl.waitMs > 0 ? `Shopify asked to pause ${Math.round(crawl.waitMs / 1000)}s; use the batched flow to wait it out` : 'time budget reached',
    });
    return NextResponse.json({ status: 'ok', isSample: false, report });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
