import { existsSync } from 'fs';
import { flattenJsonLd, typesOf } from '../audit/core';
import { assertPublicUrl } from './net-guard';
import { saveScreenshot } from './store';
import type { AxeViolation, BrowserPage, BrowserResults, FlowResult, FlowStep } from './types';

/*
 * Browser worker (Phase 3). Uses playwright-core with an installed Chrome/Edge/Chromium — no
 * browser download. Set CHROME_PATH to point at a specific binary.
 * Shopify rate limits apply to these page loads too, so only a handful of pages are opened.
 */

const NAV_TIMEOUT = 45_000;
const STAGE_BUDGET_MS = 6 * 60_000;
const MAX_NODES = 10;
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 ForwardShopifyAudit/1.0';

const CANDIDATES: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
};

export function findBrowser(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const p of CANDIDATES[process.platform] || []) if (existsSync(p)) return p;
  return null;
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

function schemaTypesFrom(blocks: string[]): string[] {
  const entities: any[] = [];
  for (const b of blocks) {
    try {
      flattenJsonLd(JSON.parse(b), entities);
    } catch {}
  }
  return Array.from(new Set(entities.flatMap(typesOf)));
}

async function runAxe(page: any): Promise<AxeViolation[]> {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return res.violations.map((v: any) => ({
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    helpUrl: v.helpUrl,
    count: v.nodes.length,
    nodes: v.nodes.slice(0, MAX_NODES).map((n: any) => ({ target: (n.target || []).join(' '), html: trunc(String(n.html || ''), 220) })),
  }));
}

async function shot(page: any, runId: string, key: string): Promise<string | undefined> {
  try {
    const buf: Buffer = await page.screenshot({ type: 'jpeg', quality: 55 });
    return await saveScreenshot(runId, key, `data:image/jpeg;base64,${buf.toString('base64')}`);
  } catch {
    return undefined;
  }
}

const MENU_SELECTORS = [
  'header details[id*="menu" i] > summary',
  'header button[aria-controls*="menu" i]',
  'header button[aria-label*="menu" i]',
  'header summary[aria-label*="menu" i]',
  'header .header__icon--menu',
  'header [data-drawer-toggle], header [data-action="toggle-menu"], header [data-menu-toggle]',
  'header-drawer summary, menu-drawer summary',
  'header button[aria-label*="navigation" i], header button[aria-label*="open nav" i]',
  'header [class*="hamburger" i], header [class*="menu-toggle" i], header [class*="nav-toggle" i]',
  'header button[aria-expanded="false"][aria-controls]',
];

export interface BrowserInput {
  runId: string;
  baseUrl: string;
  pages: Array<{ url: string; type: string; serverSchemaTypes: string[] }>;
  cartFlow: boolean;
  productUrl?: string;
  isCancelled: () => boolean;
}

export async function runBrowserTests(input: BrowserInput): Promise<BrowserResults> {
  const exe = findBrowser();
  if (!exe) {
    return { status: 'skipped', message: 'No Chrome/Edge/Chromium found. Install Chrome or set CHROME_PATH to enable browser tests.', pages: [] };
  }
  let chromium: any;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch (e: any) {
    return { status: 'skipped', message: `playwright-core not available: ${e?.message}`, pages: [] };
  }

  const started = Date.now();
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const out: BrowserResults = { status: 'ok', browser: exe.split(/[\\/]/).pop(), pages: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: MOBILE_UA, locale: 'en-US' });
    // SSRF guard: the page (or a redirect / embedded resource) must not reach private or local addresses.
    await context.route('**/*', async (route) => {
      const u = route.request().url();
      if (!/^https?:/i.test(u)) return route.continue();
      try {
        await assertPublicUrl(u);
        return route.continue();
      } catch {
        return route.abort('blockedbyclient');
      }
    });

    for (let i = 0; i < input.pages.length; i++) {
      if (input.isCancelled() || Date.now() - started > STAGE_BUDGET_MS) break;
      const target = input.pages[i];
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on('console', (m: any) => m.type() === 'error' && consoleErrors.length < 30 && consoleErrors.push(trunc(m.text(), 300)));
      page.on('pageerror', (e: any) => consoleErrors.length < 30 && consoleErrors.push(trunc(`Uncaught: ${e?.message || e}`, 300)));
      const result: BrowserPage = { url: target.url, type: target.type, context: 'loaded', ok: false, axe: [], consoleErrors, renderedSchemaTypes: [], serverSchemaTypes: target.serverSchemaTypes, jsInjectedSchema: [] };
      const extra: BrowserPage[] = [];
      try {
        const t0 = Date.now();
        const resp = await page.goto(target.url, { waitUntil: 'load', timeout: NAV_TIMEOUT });
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        result.loadMs = Date.now() - t0;
        const status = resp?.status() ?? 0;
        if (status >= 400) {
          result.error = status === 429 ? 'Rate limited by Shopify (HTTP 429)' : `HTTP ${status}`;
        } else {
          const blocks: string[] = await page.$$eval('script[type="application/ld+json"]', (els: any[]) => els.map((e) => e.textContent || ''));
          result.renderedSchemaTypes = schemaTypesFrom(blocks);
          result.jsInjectedSchema = result.renderedSchemaTypes.filter((t) => !target.serverSchemaTypes.includes(t));
          result.axe = await runAxe(page);
          result.screenshot = await shot(page, input.runId, `br-${i}`);
          result.ok = true;

          // Home: also audit with the mobile menu open — drawers are a common accessibility failure Lighthouse never sees.
          if (target.type === 'home') {
            for (const sel of MENU_SELECTORS) {
              const loc = page.locator(sel).first();
              if (await loc.isVisible().catch(() => false)) {
                await loc.click({ timeout: 3000 }).catch(() => {});
                await page.waitForTimeout(900);
                const menuAxe = await runAxe(page).catch(() => []);
                extra.push({ url: target.url, type: 'home', context: 'menu open', ok: true, axe: menuAxe, consoleErrors: [], renderedSchemaTypes: [], serverSchemaTypes: [], jsInjectedSchema: [], screenshot: await shot(page, input.runId, `br-${i}-menu`) });
                break;
              }
            }
          }
        }
      } catch (e: any) {
        result.error = trunc(e?.message || String(e), 200);
      }
      out.pages.push(result, ...extra);
      await page.close().catch(() => {});
    }

    if (input.cartFlow && input.productUrl && !input.isCancelled()) {
      out.flow = await cartFlow(context, input.runId, input.baseUrl, input.productUrl);
    }
    await context.close().catch(() => {});
  } catch (e: any) {
    out.status = out.pages.length ? 'ok' : 'failed';
    out.message = `Browser error: ${trunc(e?.message || String(e), 200)}`;
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}

/** Add to cart → cart → checkout reachability. Never enters customer or payment details; clears the cart afterwards. */
async function cartFlow(context: any, runId: string, baseUrl: string, productUrl: string): Promise<FlowResult> {
  const page = await context.newPage();
  const steps: FlowStep[] = [];
  const flow: FlowResult = { productUrl, steps, addedToCart: false, reachedCheckout: false };
  const step = async (name: string, fn: () => Promise<string | void>) => {
    const t0 = Date.now();
    try {
      const detail = (await fn()) || undefined;
      steps.push({ name, ok: true, ms: Date.now() - t0, detail, screenshot: await shot(page, runId, `flow-${steps.length}`) });
      return true;
    } catch (e: any) {
      steps.push({ name, ok: false, ms: Date.now() - t0, detail: trunc(e?.message || String(e), 240), screenshot: await shot(page, runId, `flow-${steps.length}`) });
      return false;
    }
  };
  const cartCount = async () => page.evaluate(() => fetch('/cart.js', { headers: { Accept: 'application/json' } }).then((r) => r.json()).then((c: any) => c.item_count ?? 0)).catch(() => -1);

  try {
    if (!(await step('Open product page', async () => {
      const r = await page.goto(productUrl, { waitUntil: 'load', timeout: NAV_TIMEOUT });
      if (!r || r.status() >= 400) throw new Error(`HTTP ${r?.status()}`);
    }))) return flow;

    if (!(await step('Click add to cart', async () => {
      let btn = page.locator('form[action*="/cart/add"] [type="submit"], form[action*="/cart/add"] button[name="add"], button[name="add"]').first();
      if (!(await btn.isVisible().catch(() => false))) btn = page.getByRole('button', { name: /add to (cart|bag|basket)/i }).first();
      if (!(await btn.isVisible().catch(() => false))) throw new Error('No visible add-to-cart button');
      if (await btn.isDisabled().catch(() => false)) throw new Error('Add-to-cart button is disabled (sold out or variant not selected)');
      await Promise.all([page.waitForResponse((r: any) => /\/cart\/add/.test(r.url()), { timeout: 10_000 }).catch(() => null), btn.click({ timeout: 5000 })]);
      await page.waitForTimeout(1500);
      const n = await cartCount();
      if (n <= 0) throw new Error('Cart is still empty after clicking add to cart');
      flow.addedToCart = true;
      return `${n} item(s) in cart`;
    }))) return flow;

    if (!(await step('Open cart', async () => {
      const r = await page.goto(`${baseUrl}/cart`, { waitUntil: 'load', timeout: NAV_TIMEOUT });
      if (!r || r.status() >= 400) throw new Error(`HTTP ${r?.status()}`);
    }))) return flow;

    await step('Reach checkout', async () => {
      const btn = page.locator('button[name="checkout"], input[name="checkout"], a[href*="/checkout"]').first();
      if (await btn.isVisible().catch(() => false)) {
        await Promise.all([page.waitForURL(/checkout|checkouts|shop\.app/i, { timeout: 20_000 }).catch(() => null), btn.click({ timeout: 5000 })]);
      } else {
        await page.goto(`${baseUrl}/checkout`, { waitUntil: 'load', timeout: NAV_TIMEOUT });
      }
      await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
      const u = page.url();
      if (!/\/checkouts?\b|checkout\.shopify|shop\.app/i.test(u)) throw new Error(`Ended on ${u} instead of checkout`);
      flow.reachedCheckout = true;
      return `Checkout loaded (${new URL(u).hostname}) — stopped before any customer details`;
    });
  } catch (e: any) {
    flow.error = trunc(e?.message || String(e), 200);
  } finally {
    // Leave no cart behind on the store.
    await page.goto(`${baseUrl}/cart`, { timeout: 20_000 }).catch(() => {});
    await page.evaluate(() => fetch('/cart/clear.js', { method: 'POST' })).catch(() => {});
    await page.close().catch(() => {});
  }
  return flow;
}
