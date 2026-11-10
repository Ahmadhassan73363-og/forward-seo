import { NextResponse } from 'next/server';
import { buildReport } from '@/lib/audit/report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Step 3: score everything the client collected. Pure computation, no outbound requests. */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.ctx || !Array.isArray(body.pages)) {
      return NextResponse.json({ status: 'error', message: 'ctx and pages are required' }, { status: 400 });
    }
    const noPsi = { ok: false, error: 'PageSpeed test was not run' };
    const report = buildReport({
      ctx: body.ctx,
      pages: body.pages,
      psiMobileRes: body.psi?.mobile || noPsi,
      psiDesktopRes: body.psi?.desktop || noPsi,
      skippedCount: Number(body.skippedCount) || 0,
      skippedReason: typeof body.skippedReason === 'string' ? body.skippedReason.slice(0, 200) : undefined,
    });
    return NextResponse.json({ status: 'ok', isSample: false, report });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
