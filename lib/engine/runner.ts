import { compareRuns, findPreviousRun, sendAlert } from './compare';
import { executeRun } from './pipeline';
import { integrationsConfig } from './integrations';
import { isDue, loadSchedules, updateSchedules } from './schedules';
import type { OwnerCredentials } from './shopify-admin';
import { EPHEMERAL, listRuns, loadRun, newRunId, saveRun } from './store';
import type { Run, RunInput } from './types';

/*
 * In-process job runner + scheduler. Requires a long-running Node server (`next start`, Docker, VPS) —
 * on serverless platforms background work is killed when the response is sent.
 * State lives on globalThis so dev-mode hot reloads don't spawn duplicate runners.
 */
const MAX_CONCURRENT_RUNS = Math.max(1, Number(process.env.MAX_CONCURRENT_RUNS) || 2);
const SCHEDULER_TICK_MS = 60_000;

export interface RunSecrets {
  apiKey?: string;
  owner?: OwnerCredentials;
}

interface RunnerState {
  queue: string[];
  active: Set<string>;
  cancelled: Set<string>;
  secrets: Map<string, RunSecrets>; // memory only — never written to disk
  recovered: boolean;
  schedulerStarted: boolean;
}

const g = globalThis as unknown as { __auditRunner?: RunnerState };
const state: RunnerState = (g.__auditRunner ||= { queue: [], active: new Set(), cancelled: new Set(), secrets: new Map(), recovered: false, schedulerStarted: false });

/**
 * Runs left queued/running by a previous process: restart them from the beginning (once), unless
 * they used per-run secrets, which lived only in that process's memory and cannot be recovered.
 */
async function recover() {
  if (state.recovered) return;
  state.recovered = true;
  for (const s of await listRuns(200)) {
    if ((s.status === 'running' || s.status === 'queued') && !state.active.has(s.id) && !state.queue.includes(s.id)) {
      const r = await loadRun(s.id);
      if (!r) continue;
      if (r.hasRunSecrets || (r.restarts || 0) >= 1) {
        r.status = 'failed';
        r.error = r.hasRunSecrets
          ? 'The server restarted while this run was in progress. It used a per-run API key or token, which is never stored, so it could not be resumed. Start a new run.'
          : 'The server restarted twice while this run was in progress. Start a new run.';
        r.finishedAt = new Date().toISOString();
        await saveRun(r);
        continue;
      }
      // Start over with a clean slate; partial results from the dead process are discarded.
      Object.assign(r, {
        status: 'queued',
        restarts: (r.restarts || 0) + 1,
        progress: { stage: 'queued', psiDone: 0, psiTotal: 0, crawlDone: 0, crawlTotal: 0, message: 'Restarted after a server restart' },
        targets: [],
        psiTests: [],
        crawl: [],
        apps: [],
        findings: [],
        warnings: ['The server restarted during this audit, so it was started again from the beginning.'],
        site: undefined,
        crux: undefined,
        ahrefs: undefined,
        semrush: undefined,
        searchConsole: undefined,
        ga4: undefined,
        merchant: undefined,
        aiVisibility: undefined,
        aiOverviews: undefined,
        otterly: undefined,
        browser: undefined,
        owner: undefined,
        catalog: undefined,
        scores: undefined,
        error: undefined,
      });
      await saveRun(r);
      state.queue.push(r.id);
    }
  }
  pump();
}

/** Audits queued or running right now. */
export function pendingRuns() {
  return state.queue.length + state.active.size;
}

function pump() {
  while (state.active.size < MAX_CONCURRENT_RUNS && state.queue.length) {
    const id = state.queue.shift()!;
    state.active.add(id);
    processRun(id).finally(() => {
      state.active.delete(id);
      state.secrets.delete(id);
      state.cancelled.delete(id);
      pump();
    });
  }
}

/** Server-level owner credentials apply only to primary runs; the pipeline verifies the shop matches. */
export function ownerCredsFor(run: Run, secrets?: RunSecrets): OwnerCredentials | undefined {
  if (secrets?.owner) return secrets.owner;
  if (run.input.role === 'competitor') return undefined;
  const shop = process.env.SHOPIFY_SHOP;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  return shop && token ? { shop, token } : undefined;
}

async function processRun(id: string) {
  const run = await loadRun(id);
  if (!run) return;
  const secrets = state.secrets.get(id);
  run.status = 'running';
  await saveRun(run);
  try {
    await executeRun(run, {
      apiKey: secrets?.apiKey || process.env.PSI_API_KEY || undefined,
      owner: ownerCredsFor(run, secrets),
      isCancelled: () => state.cancelled.has(id),
    });
    run.status = state.cancelled.has(id) ? 'cancelled' : 'completed';
  } catch (e: any) {
    run.status = 'failed';
    run.error = e?.message || String(e);
  }
  run.progress.stage = run.status;
  run.progress.waitUntil = undefined;
  run.finishedAt = new Date().toISOString();

  // Compare with the previous run of the same store; alert on regressions.
  if (run.status === 'completed' && run.input.role !== 'competitor') {
    try {
      const prev = await findPreviousRun(run);
      if (prev) run.comparison = compareRuns(prev, run);
      if (run.comparison?.regression) {
        const schedule = run.input.scheduleId ? (await loadSchedules()).find((s) => s.id === run.input.scheduleId) : undefined;
        const target = schedule?.webhookUrl || process.env.ALERT_WEBHOOK_URL;
        if (target) {
          const r = await sendAlert(target, run, process.env.PUBLIC_BASE_URL || '');
          run.alert = { sent: r.sent, target: new URL(target).hostname, error: r.error };
        }
      }
    } catch (e: any) {
      run.warnings.push(`Comparison/alert step failed: ${e?.message}`);
    }
  }
  await saveRun(run);
}

/** A fresh run document (not yet stored or queued). */
export function newRun(input: RunInput, hasRunSecrets = false): Run {
  const now = new Date().toISOString();
  return {
    id: newRunId(),
    createdAt: now,
    updatedAt: now,
    status: 'queued',
    input,
    progress: { stage: 'queued', psiDone: 0, psiTotal: 0, crawlDone: 0, crawlTotal: 0 },
    targets: [],
    psiTests: [],
    crawl: [],
    apps: [],
    findings: [],
    warnings: [],
    hasRunSecrets,
  };
}

export async function createRun(input: RunInput, secrets?: RunSecrets): Promise<Run> {
  if (EPHEMERAL) throw new Error('This deployment keeps no stored audits; audits run live through /api/audit.');
  await recover();
  const run = newRun(input, !!(secrets && (secrets.apiKey || secrets.owner)));
  await saveRun(run);
  if (secrets && (secrets.apiKey || secrets.owner)) state.secrets.set(run.id, secrets);
  state.queue.push(run.id);
  pump();
  return run;
}

export function cancelRun(id: string): boolean {
  const qi = state.queue.indexOf(id);
  if (qi >= 0) {
    state.queue.splice(qi, 1);
    loadRun(id).then((r) => {
      if (r) {
        r.status = 'cancelled';
        r.finishedAt = new Date().toISOString();
        saveRun(r);
      }
    });
    return true;
  }
  if (state.active.has(id)) {
    state.cancelled.add(id);
    return true;
  }
  return false;
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

async function schedulerTick() {
  const schedules = await loadSchedules();
  const busy = new Set<string>();
  for (const id of [...state.queue, ...Array.from(state.active)]) {
    const r = await loadRun(id);
    if (r?.input.scheduleId) busy.add(r.input.scheduleId);
  }
  for (const s of schedules) {
    if (!isDue(s) || busy.has(s.id)) continue;
    const run = await createRun({ url: s.url, pages: s.pages, strategies: s.strategies, browserTests: s.browserTests, scheduleId: s.id, role: 'primary' });
    await updateSchedules((list) => {
      const x = list.find((y) => y.id === s.id);
      if (x) {
        x.lastRunAt = new Date().toISOString();
        x.lastRunId = run.id;
      }
    });
  }
}

export function startScheduler() {
  if (state.schedulerStarted || EPHEMERAL) return; // no background loop without a long-running server

  state.schedulerStarted = true;
  recover().catch(() => {});
  setInterval(() => schedulerTick().catch((e) => console.error('[scheduler]', e)), SCHEDULER_TICK_MS);
  setTimeout(() => schedulerTick().catch(() => {}), 5000);
}

export async function ensureRecovered() {
  await recover();
  startScheduler();
}

export function serverConfig() {
  return {
    serverKey: !!process.env.PSI_API_KEY,
    ownerConfigured: !!(process.env.SHOPIFY_SHOP && process.env.SHOPIFY_ADMIN_TOKEN),
    ownerShop: process.env.SHOPIFY_SHOP || null,
    alertWebhook: !!process.env.ALERT_WEBHOOK_URL,
    // Third-party sources: plan names, booleans and the Google service account email only (never keys).
    ...integrationsConfig(),
    // No-storage mode: audits stream live, nothing is kept, no schedules or competitor runs.
    ephemeral: EPHEMERAL,
  };
}
