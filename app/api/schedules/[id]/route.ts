import { NextResponse } from 'next/server';
import { updateSchedules } from '@/lib/engine/schedules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Body: { enabled: boolean } */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  let found = false;
  await updateSchedules((list) => {
    const s = list.find((x) => x.id === params.id);
    if (s && typeof body.enabled === 'boolean') {
      s.enabled = body.enabled;
      found = true;
    }
  });
  return found ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  let found = false;
  await updateSchedules((list) => {
    found = list.some((x) => x.id === params.id);
    return list.filter((x) => x.id !== params.id);
  });
  return found ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
}
