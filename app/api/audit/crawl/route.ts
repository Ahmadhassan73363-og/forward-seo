import { NextResponse } from 'next/server';
import { crawlBatch, CRAWL_DEADLINE_MS } from '@/lib/audit/core';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TARGETS_PER_CALL = 200;

/**
 * Step 2 (repeatable): crawl as many queued pages as fit in this invocation. If Shopify asks for
 * a pause longer than we can wait here, returns `waitMs` and the remaining queue; the client
 * waits and calls again with the returned limiter state.
 */
export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const host = String(body.host || '');
    const targets = Array.isArray(body.targets) ? body.targets.slice(0, MAX_TARGETS_PER_CALL) : [];
    if (!host || targets.length === 0) {
      return NextResponse.json({ status: 'error', message: 'host and targets are required' }, { status: 400 });
    }
    // Only crawl URLs on the audited store's host.
    const clean = targets.filter((t: any) => {
      try {
        return typeof t?.url === 'string' && typeof t?.type === 'string' && new URL(t.url).hostname === host;
      } catch {
        return false;
      }
    });
    const batch = await crawlBatch(clean, host, body.limiter, started + CRAWL_DEADLINE_MS);
    return NextResponse.json({ status: 'ok', ...batch });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
