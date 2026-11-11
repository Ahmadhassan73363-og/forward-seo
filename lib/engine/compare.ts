import net from 'net';
import { assertPublicUrl, isPrivateIp } from './net-guard';
import { listRuns, loadRun } from './store';
import type { Finding, Run, RunComparison } from './types';

const OVERALL_DROP = 5;
const PERF_DROP = 10; // Lighthouse lab scores vary ±5–10 between runs; smaller drops are noise.

/** Which finding sources actually produced data in a run. */
function measuredSources(r: Run): Set<Finding['source']> {
  const s = new Set<Finding['source']>();
  if (r.psiTests?.some((t) => t.status === 'done')) {
    s.add('lighthouse');
    s.add('apps');
  }
  if (r.crawl?.filter((p) => !p.error).length) s.add('crawl');
  if (r.site) s.add('site');
  if (r.crux?.phone) s.add('crux');
  if (r.browser?.status === 'ok') s.add('browser');
  if (r.owner?.status === 'ok') s.add('owner');
  if (r.catalog?.status === 'ok') s.add('catalog');
  return s;
}

/**
 * Compares two runs of the same store. A finding only counts as "new" or "resolved" when every
 * source that reports it ran in both audits, so newly available data (e.g. CrUX enabled, catalog
 * feed added) is not mistaken for a regression. Score drops only count when the same modules were
 * scored in both runs.
 */
export function compareRuns(prev: Run, cur: Run): RunComparison {
  const prevSrc = measuredSources(prev);
  const curSrc = measuredSources(cur);
  const comparable = (f: Finding) => (f.sources?.length ? f.sources : [f.source]).every((s) => prevSrc.has(s) && curSrc.has(s));
  const prevIds = new Map(prev.findings.map((f) => [f.id, f]));
  const curIds = new Map(cur.findings.map((f) => [f.id, f]));
  const newFindings = cur.findings.filter((f) => !prevIds.has(f.id) && comparable(f)).map((f) => ({ id: f.id, title: f.title, severity: f.severity }));
  const resolvedFindings = prev.findings.filter((f) => !curIds.has(f.id) && comparable(f)).map((f) => ({ id: f.id, title: f.title, severity: f.severity }));

  const scoredSet = (r: Run) => (r.scores?.modules || []).filter((m) => m.score !== null).map((m) => m.id).sort().join(',');
  const sameModules = scoredSet(prev) === scoredSet(cur);
  const po = prev.scores?.overall ?? null;
  const co = cur.scores?.overall ?? null;
  const overallDelta = po !== null && co !== null ? co - po : null;
  const pp = prev.scores?.google.mobile?.performance ?? null;
  const cp = cur.scores?.google.mobile?.performance ?? null;
  const mobilePerfDelta = pp !== null && cp !== null ? cp - pp : null;
  const moduleDeltas = (cur.scores?.modules || [])
    .map((m) => ({ id: m.id, from: prev.scores?.modules.find((x) => x.id === m.id)?.score ?? null, to: m.score }))
    .filter((d) => d.from !== null && d.to !== null); // only modules scored in both runs

  const reasons: string[] = [];
  if (sameModules && overallDelta !== null && overallDelta <= -OVERALL_DROP) reasons.push(`Overall score dropped ${po} → ${co}`);
  if (mobilePerfDelta !== null && mobilePerfDelta <= -PERF_DROP) reasons.push(`Mobile performance dropped ${pp} → ${cp}`);
  const serious = newFindings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  if (serious.length) reasons.push(`${serious.length} new high/critical issue(s): ${serious.slice(0, 3).map((f) => f.title).join('; ')}`);
  const notes: string[] = [];
  if (!sameModules) notes.push('Different modules were scored in the two runs, so the overall score is not directly comparable.');
  const added = Array.from(curSrc).filter((s) => !prevSrc.has(s));
  if (added.length) notes.push(`New data sources this run (${added.join(', ')}): their issues are not counted as new.`);

  return { previousId: prev.id, previousAt: prev.createdAt, overallDelta, moduleDeltas, mobilePerfDelta, newFindings, resolvedFindings, regression: reasons.length > 0, reasons, notes };
}

/** Most recent completed primary run for the same host, before this one. */
export async function findPreviousRun(cur: Run): Promise<Run | null> {
  const host = cur.store?.host;
  if (!host) return null;
  for (const s of await listRuns(200)) {
    if (s.id === cur.id || s.status !== 'completed' || s.host !== host || s.role === 'competitor') continue;
    if (s.createdAt >= cur.createdAt) continue;
    const r = await loadRun(s.id);
    if (r?.scores) return r;
  }
  return null;
}

/** Fast syntactic check used when a webhook is saved: https and not an obviously internal host. */
export function isSafeWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return false;
    const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
    if (net.isIP(h)) return !isPrivateIp(h);
    return h.includes('.');
  } catch {
    return false;
  }
}

/** Posts a Slack/Discord/Teams-compatible message ({ text } plus Discord's { content }). */
export async function sendAlert(webhookUrl: string, run: Run, baseUrl: string): Promise<{ sent: boolean; error?: string }> {
  if (!isSafeWebhook(webhookUrl)) return { sent: false, error: 'Webhook URL must be a public https URL' };
  try {
    await assertPublicUrl(webhookUrl); // resolves DNS: refuses hosts that point at private addresses
  } catch (e: any) {
    return { sent: false, error: e?.message };
  }
  const c = run.comparison!;
  const text = [
    `⚠️ Audit regression on ${run.store?.host}`,
    ...c.reasons.map((r) => `• ${r}`),
    `Score: ${run.scores?.overall ?? '—'} (${run.scores?.grade}) · Mobile performance: ${run.scores?.google.mobile?.performance ?? '—'}`,
    baseUrl ? `Report: ${baseUrl.replace(/\/$/, '')}/runs/${run.id}` : `Run: ${run.id}`,
  ].join('\n');
  try {
    const res = await fetch(webhookUrl, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(10_000) });
    return res.ok ? { sent: true } : { sent: false, error: `Webhook returned HTTP ${res.status}` };
  } catch (e: any) {
    return { sent: false, error: e?.message || 'Webhook request failed' };
  }
}
