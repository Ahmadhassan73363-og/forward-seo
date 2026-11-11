import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Schedule } from './types';

/* Scheduled audits, stored in DATA_DIR/schedules.json. The scheduler loop lives in runner.ts. */

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), '.data'));
const FILE = path.join(DATA_DIR, 'schedules.json');
export const INTERVAL_MS: Record<Schedule['frequency'], number> = { daily: 24 * 3600_000, weekly: 7 * 24 * 3600_000 };

let writeChain: Promise<void> = Promise.resolve();

export async function loadSchedules(): Promise<Schedule[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function saveSchedules(list: Schedule[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(list, null, 2));
  await fs.rename(tmp, FILE);
}

/** Serialises read-modify-write so concurrent updates don't clobber each other. */
export function updateSchedules(fn: (list: Schedule[]) => Schedule[] | void): Promise<Schedule[]> {
  let result: Schedule[] = [];
  writeChain = writeChain.then(async () => {
    const list = await loadSchedules();
    result = fn(list) || list;
    await saveSchedules(result);
  });
  return writeChain.then(() => result);
}

export function newScheduleId() {
  return `sch-${crypto.randomBytes(5).toString('hex')}`;
}

export function isDue(s: Schedule, now = Date.now()) {
  if (!s.enabled) return false;
  if (!s.lastRunAt) return true;
  return now - Date.parse(s.lastRunAt) >= INTERVAL_MS[s.frequency];
}

export function nextRunAt(s: Schedule): string | null {
  if (!s.enabled) return null;
  if (!s.lastRunAt) return new Date().toISOString();
  return new Date(Date.parse(s.lastRunAt) + INTERVAL_MS[s.frequency]).toISOString();
}
