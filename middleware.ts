import { NextResponse, type NextRequest } from 'next/server';

/*
 * Access control for the whole app.
 *
 * - APP_PASSWORD set   → HTTP Basic auth on every page and API route (user: APP_USER or any name).
 * - APP_PASSWORD unset → only requests addressed to localhost are served, so a server accidentally
 *                        exposed on a network (or reached through DNS rebinding) refuses requests.
 * - Cross-site requests → state-changing API calls must be JSON and come from this same origin,
 *                         so another website can't make your browser start or delete audits.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function unauthorized(msg: string, basic: boolean) {
  return new NextResponse(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', ...(basic ? { 'WWW-Authenticate': 'Basic realm="Store audit", charset="UTF-8"' } : {}) },
  });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  const hostHeader = req.headers.get('host') || '';
  const hostname = hostHeader.replace(/:\d+$/, '').toLowerCase();

  if (password) {
    const auth = req.headers.get('authorization') || '';
    let ok = false;
    if (auth.startsWith('Basic ')) {
      try {
        const [user, ...rest] = atob(auth.slice(6)).split(':');
        const pass = rest.join(':');
        ok = safeEqual(pass, password) && (!process.env.APP_USER || safeEqual(user, process.env.APP_USER));
      } catch {}
    }
    if (!ok) return unauthorized('Sign in required.', true);
  } else if (!LOCAL_HOSTS.has(hostname)) {
    return unauthorized('This audit tool only answers on localhost until APP_PASSWORD is set. Set APP_PASSWORD (and optionally APP_USER) to use it over a network.', false);
  }

  // CSRF: state-changing API calls must be JSON from this origin.
  if (req.nextUrl.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {}
      if (originHost !== hostHeader.toLowerCase()) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
    }
    const type = (req.headers.get('content-type') || '').toLowerCase();
    if (req.method !== 'DELETE' && !type.startsWith('application/json')) {
      return NextResponse.json({ error: 'Requests must be sent as application/json.' }, { status: 415 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
