import { NextResponse } from 'next/server';
import { clampMaxPages, discover, normalizeInput } from '@/lib/audit/discover';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Step 1: homepage + sitemap discovery. Returns the context the client passes to later steps. */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const input = normalizeInput(body.url);
    if ('error' in input) return NextResponse.json({ status: 'error', message: input.error }, { status: 400 });
    const d = await discover(input.url, clampMaxPages(body.maxPages));
    if (d.ok === false) return NextResponse.json({ status: 'error', message: d.message }, { status: d.status });
    return NextResponse.json({ status: 'ok', ctx: d.ctx });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
