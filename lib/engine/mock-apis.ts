/*
 * Development-only test switch: MOCK_API_BASE=http://localhost:4010 sends every Ahrefs, Semrush
 * and Search Console request to the local mock server (scripts/mock-apis.mjs) instead of the real
 * services. The real request and parsing code still runs; only the answering server changes.
 *
 * Ignored in production builds (next build / next start, Vercel), so it can never put dummy
 * data into a real report. Runs made with it carry a warning saying the data is dummy.
 */

export function mockApiBase(): string | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  const base = process.env.MOCK_API_BASE?.trim().replace(/\/+$/, '');
  if (!base) return undefined;
  try {
    const u = new URL(base);
    // Only a local server: API keys are sent with these requests.
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ? base : undefined;
  } catch {
    return undefined;
  }
}

/** The real base URL, or the mock server's /<service> path when MOCK_API_BASE is active. */
export function apiBase(real: string, service: string): string {
  const mock = mockApiBase();
  return mock ? `${mock}/${service}` : real;
}
