import { NextResponse } from 'next/server';
import { queryGooglePageSpeed } from '@/lib/audit/core';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Runs one Google PageSpeed Insights test. Called in parallel with the crawl. */
export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const url = String(body.url || '');
  const strategy = body.strategy === 'desktop' ? 'desktop' : 'mobile';
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid URL' }, { status: 400 });
  }
  const result = await queryGooglePageSpeed(url, strategy, String(body.psiApiKey || '').trim());
  return NextResponse.json(result);
}
