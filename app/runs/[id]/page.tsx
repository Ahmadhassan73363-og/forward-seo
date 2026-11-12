'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RunReport, Shell } from '../../components/run-report';
import { Card } from '../../components/ui';
import type { Run } from '@/lib/engine/types';

/** A stored run, polled while it is in progress. */
export default function RunPage({ params }: { params: { id: string } }) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/runs/${params.id}`, { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setError(res?.status === 404 ? 'Run not found.' : 'Could not load this run.');
      return;
    }
    setRun(await res.json());
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const active = run?.status === 'queued' || run?.status === 'running';
  useEffect(() => {
    if (!active) return;
    const poll = setInterval(load, 3000);
    return () => clearInterval(poll);
  }, [active, load]);

  const cancel = async () => {
    await fetch(`/api/runs/${params.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) });
    load();
  };

  return (
    <Shell>
      {error ? (
        <Card className="text-center text-rose-700">{error}</Card>
      ) : !run ? (
        <Card className="text-center text-neutral-600">Loading…</Card>
      ) : (
        <RunReport run={run} onCancel={cancel} />
      )}
    </Shell>
  );
}
