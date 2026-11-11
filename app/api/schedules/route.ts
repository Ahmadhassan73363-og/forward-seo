import { NextResponse } from 'next/server';
import { isSafeWebhook } from '@/lib/engine/compare';
import { checkPublicUrl, parseStoreUrl } from '@/lib/engine/net-guard';
import { MAX_PAGES } from '@/lib/engine/pipeline';
import { ensureRecovered } from '@/lib/engine/runner';
import { EPHEMERAL } from '@/lib/engine/store';
import { loadSchedules, newScheduleId, nextRunAt, updateSchedules } from '@/lib/engine/schedules';
import type { Schedule, Strategy } from '@/lib/engine/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const mask = (s: Schedule) => ({ ...s, webhookUrl: s.webhookUrl ? new URL(s.webhookUrl).hostname : undefined, nextRunAt: nextRunAt(s) });

export async function GET() {
  await ensureRecovered();
  return NextResponse.json({ schedules: (await loadSchedules()).map(mask) });
}

/** Body: { url, frequency: 'daily'|'weekly', pages?, strategies?, browserTests?, webhookUrl? } */
export async function POST(req: Request) {
  if (EPHEMERAL) return NextResponse.json({ error: 'Scheduled audits need a server with storage. This deployment keeps no audits.' }, { status: 409 });
  await ensureRecovered();
  const body = await req.json().catch(() => ({}));
  const url = String(body.url || '').trim();
  const parsed = parseStoreUrl(url);
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const pub = await checkPublicUrl(parsed.url.toString());
  if (pub.ok === false) return NextResponse.json({ error: pub.error }, { status: 400 });
  const frequency = body.frequency === 'daily' ? 'daily' : 'weekly';
  const webhookUrl = typeof body.webhookUrl === 'string' && body.webhookUrl.trim() ? body.webhookUrl.trim() : undefined;
  if (webhookUrl && !isSafeWebhook(webhookUrl)) return NextResponse.json({ error: 'Webhook URL must be a public https URL' }, { status: 400 });
  if (webhookUrl) {
    const hook = await checkPublicUrl(webhookUrl);
    if (hook.ok === false) return NextResponse.json({ error: `Webhook URL: ${hook.error}` }, { status: 400 });
  }
  const strategies: Strategy[] = Array.isArray(body.strategies) ? body.strategies.filter((s: any) => s === 'mobile' || s === 'desktop') : ['mobile'];

  const schedule: Schedule = {
    id: newScheduleId(),
    url,
    pages: Math.max(1, Math.min(MAX_PAGES, Number(body.pages) || 10)),
    strategies: strategies.length ? strategies : ['mobile'],
    browserTests: body.browserTests !== false,
    frequency,
    webhookUrl,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  await updateSchedules((list) => [...list, schedule]);
  return NextResponse.json({ schedule: mask(schedule) }, { status: 201 });
}
