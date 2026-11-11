import { readScreenshot } from '@/lib/engine/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const file = new URL(req.url).searchParams.get('f') || '';
  const shot = await readScreenshot(params.id, file).catch(() => null);
  if (!shot) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(shot.data), { headers: { 'Content-Type': shot.type, 'Cache-Control': 'private, max-age=86400' } });
}
