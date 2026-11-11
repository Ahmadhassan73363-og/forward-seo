import { NextResponse } from 'next/server';
import { cancelRun, ensureRecovered } from '@/lib/engine/runner';
import { deleteRun, loadRun } from '@/lib/engine/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await ensureRecovered();
  let run;
  try {
    run = await loadRun(params.id);
  } catch {
    return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
  }
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  return NextResponse.json(run);
}

/** POST { action: "cancel" } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  if (body.action !== 'cancel') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  return NextResponse.json({ cancelled: cancelRun(params.id) });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const run = await loadRun(params.id).catch(() => null);
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  if (run.status === 'running' || run.status === 'queued') return NextResponse.json({ error: 'Cancel the run before deleting it' }, { status: 409 });
  await deleteRun(params.id);
  return NextResponse.json({ deleted: true });
}
