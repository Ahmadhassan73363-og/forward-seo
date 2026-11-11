import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Run, RunSummary } from './types';

/*
 * File-based run store: one directory per run under DATA_DIR (default ./.data/runs).
 *   run.json      the run document
 *   shots/*.jpg   Lighthouse screenshots
 * Good for a single long-running server. Swap for Postgres by reimplementing these functions.
 */

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), '.data'));
const RUNS_DIR = path.join(DATA_DIR, 'runs');
const ID_RE = /^[a-z0-9-]{8,64}$/;

function runDir(id: string) {
  if (!ID_RE.test(id)) throw new Error('Invalid run id');
  return path.join(RUNS_DIR, id);
}

export function newRunId() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  // Date + time prefix keeps directory order chronological.
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return `${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}

async function writeAtomic(file: string, data: string | Buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

export async function saveRun(run: Run) {
  run.updatedAt = new Date().toISOString();
  await writeAtomic(path.join(runDir(run.id), 'run.json'), JSON.stringify(run));
}

export async function loadRun(id: string): Promise<Run | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(runDir(id), 'run.json'), 'utf8'));
  } catch {
    return null;
  }
}

export async function listRuns(limit = 50): Promise<RunSummary[]> {
  let ids: string[] = [];
  try {
    ids = (await fs.readdir(RUNS_DIR)).filter((x) => ID_RE.test(x));
  } catch {
    return [];
  }
  ids.sort().reverse();
  const out: RunSummary[] = [];
  for (const id of ids.slice(0, limit)) {
    const r = await loadRun(id);
    if (!r) continue;
    out.push({
      id: r.id,
      createdAt: r.createdAt,
      status: r.status,
      url: r.input.url,
      host: r.store?.host,
      overall: r.scores?.overall ?? null,
      grade: r.scores?.grade,
      findings: r.findings.length,
      groupId: r.input.groupId,
      role: r.input.role,
      scheduleId: r.input.scheduleId,
      platform: r.store?.platform?.name,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteRun(id: string) {
  await fs.rm(runDir(id), { recursive: true, force: true });
}

export async function saveScreenshot(id: string, key: string, dataUri: string): Promise<string | undefined> {
  const m = dataUri.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
  if (!m || !/^[a-z0-9-]+$/.test(key)) return undefined;
  const ext = m[1] === 'jpg' ? 'jpeg' : m[1];
  await writeAtomic(path.join(runDir(id), 'shots', `${key}.${ext}`), Buffer.from(m[2], 'base64'));
  return `${key}.${ext}`;
}

export async function readScreenshot(id: string, file: string): Promise<{ data: Buffer; type: string } | null> {
  if (!/^[a-z0-9-]+\.(jpeg|png|webp)$/.test(file)) return null;
  try {
    const data = await fs.readFile(path.join(runDir(id), 'shots', file));
    return { data, type: `image/${file.split('.').pop()}` };
  } catch {
    return null;
  }
}
