'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RunReport, Shell } from '../components/run-report';
import { Card } from '../components/ui';
import type { Run } from '@/lib/engine/types';

/*
 * Live audit: the home page leaves the audit settings in sessionStorage and opens this page, which
 * streams the audit from /api/audit. The report lives only in this tab; nothing is stored anywhere.
 */
const LIVE_KEY = 'liveAuditRequest'; // same key as app/page.tsx

export default function LivePage() {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idle, setIdle] = useState(false);
  const started = useRef(false);
  const mounted = useRef(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Real unmount (not React's dev double-mount): stop the audit on the server.
      setTimeout(() => {
        if (!mounted.current) ctrl.current?.abort();
      }, 0);
    };
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let request: string | null = null;
    try {
      request = sessionStorage.getItem(LIVE_KEY);
      sessionStorage.removeItem(LIVE_KEY); // a reload must not silently start a second audit
    } catch {}
    if (!request) {
      setIdle(true);
      return;
    }
    const c = new AbortController();
    ctrl.current = c;
    (async () => {
      let last: Run | null = null;
      let done = false;
      try {
        const res = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request, signal: c.signal });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null);
          setError(data?.error || `The server refused the audit (HTTP ${res.status}).`);
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const msg = JSON.parse(line);
            if (msg.type === 'progress' || msg.type === 'done') {
              last = msg.run;
              setRun(msg.run);
              if (msg.type === 'done') done = true;
            } else if (msg.type === 'error') {
              setError(msg.error);
            }
          }
        }
        if (!done) {
          const msg =
            'The connection closed before the audit finished, so there is no report. The host may have stopped the request at its time limit, or the network dropped. Try fewer pages or one device.';
          if (last) setRun({ ...last, status: 'failed', error: msg });
          else setError(msg);
        }
      } catch (e: any) {
        if (c.signal.aborted) {
          if (last) setRun({ ...last, status: 'cancelled', progress: { ...last.progress, stage: 'cancelled' } });
          return;
        }
        setError(`Lost the connection to the audit: ${e?.message || e}. Nothing was saved; start it again.`);
      }
    })();
  }, []);

  // Leaving the page ends the audit and discards the report, so ask first while it runs.
  const running = run?.status === 'running' || run?.status === 'queued' || (!run && !error && !idle);
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  return (
    <Shell live>
      {idle ? (
        <Card className="text-center text-neutral-700 space-y-2">
          <p>No audit is running in this tab. Reports aren&apos;t saved, so a finished report disappears when the page is closed or reloaded.</p>
          <Link href="/" className="text-brand hover:underline text-sm">
            Start an audit
          </Link>
        </Card>
      ) : (
        <>
          {error && <Card className="border-rose-500/40 bg-rose-500/5 text-sm text-rose-800">{error}</Card>}
          {run ? (
            <RunReport run={run} live onCancel={() => ctrl.current?.abort()} />
          ) : (
            !error && <Card className="text-center text-neutral-600">Starting the audit…</Card>
          )}
          {run?.status === 'completed' && (
            <p className="text-[11px] text-neutral-500 text-center">This report isn&apos;t saved. Use JSON or Print / PDF above to keep a copy before closing the tab.</p>
          )}
        </>
      )}
    </Shell>
  );
}
