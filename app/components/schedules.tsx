'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Trash2 } from 'lucide-react';
import { Card } from './ui';

interface ScheduleView {
  id: string;
  url: string;
  pages: number;
  frequency: 'daily' | 'weekly';
  webhookUrl?: string; // hostname only (masked by the API)
  enabled: boolean;
  lastRunAt?: string;
  lastRunId?: string;
  nextRunAt?: string | null;
}

export default function Schedules({ alertWebhookConfigured }: { alertWebhookConfigured: boolean }) {
  const [list, setList] = useState<ScheduleView[]>([]);
  const [url, setUrl] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('weekly');
  const [pages, setPages] = useState(10);
  const [webhook, setWebhook] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = () =>
    fetch('/api/schedules')
      .then((r) => r.json())
      .then((d) => setList(d.schedules || []))
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, frequency, pages, webhookUrl: webhook || undefined, strategies: ['mobile'] }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setError(d.error || 'Could not create schedule');
    setUrl('');
    setWebhook('');
    load();
  };

  const toggle = async (s: ScheduleView) => {
    await fetch(`/api/schedules/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !s.enabled }) });
    load();
  };

  const remove = async (s: ScheduleView) => {
    if (!confirm(`Delete the ${s.frequency} schedule for ${s.url}? Past runs are kept.`)) return;
    await fetch(`/api/schedules/${s.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-emerald-400" /> Scheduled monitoring
        </h2>
        <button onClick={() => setOpen(!open)} className="text-xs text-emerald-400 hover:underline">
          {open ? 'Close' : '+ New schedule'}
        </button>
      </div>
      {open && (
        <Card>
          <form onSubmit={create} className="grid sm:grid-cols-6 gap-2 text-xs items-end">
            <label className="sm:col-span-2 space-y-1">
              <span className="text-slate-400">Store URL</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="your-store.com" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">Every</span>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2">
                <option value="daily">Day</option>
                <option value="weekly">Week</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">Pages</span>
              <select value={pages} onChange={(e) => setPages(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2">
                {[5, 10, 20, 40].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2 space-y-1">
              <span className="text-slate-400">Alert webhook (Slack/Discord/Teams, optional)</span>
              <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://hooks.slack.com/services/…" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono" />
            </label>
            <div className="sm:col-span-6 flex items-center gap-3">
              <button type="submit" disabled={!url.trim()} className="bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-lg disabled:opacity-50">
                Create schedule
              </button>
              <span className="text-[11px] text-slate-500">
                The first audit starts within a minute of creating the schedule, then repeats every {frequency === 'daily' ? 'day' : 'week'}. Runs mobile PageSpeed + browser tests and compares with the previous run. Alerts fire when the score drops 5+, mobile performance drops 10+, or new high/critical issues appear
                {alertWebhookConfigured ? ' (server default webhook is set)' : ''}.
              </span>
            </div>
            {error && <p className="sm:col-span-6 text-rose-300">{error}</p>}
          </form>
        </Card>
      )}
      {list.length === 0 ? (
        <p className="text-xs text-slate-500">No scheduled audits.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="text-left px-4 py-2">Store</th>
                <th className="text-left px-4 py-2">Every</th>
                <th className="text-left px-4 py-2">Last run</th>
                <th className="text-left px-4 py-2">Next run</th>
                <th className="text-left px-4 py-2">Alerts</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {list.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 font-mono">{s.url}</td>
                  <td className="px-4 py-2">{s.frequency === 'daily' ? 'day' : 'week'} · {s.pages} pages</td>
                  <td className="px-4 py-2 text-slate-400">
                    {s.lastRunId ? (
                      <Link href={`/runs/${s.lastRunId}`} className="hover:text-emerald-400">
                        {new Date(s.lastRunAt!).toLocaleString()}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{s.enabled ? (s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : '—') : 'paused'}</td>
                  <td className="px-4 py-2 text-slate-400">{s.webhookUrl || (alertWebhookConfigured ? 'server default' : 'none')}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => toggle(s)} className="text-[11px] px-2 py-0.5 rounded border border-slate-700 mr-2">
                      {s.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button onClick={() => remove(s)} aria-label="Delete schedule" className="text-slate-500 hover:text-rose-400 align-middle">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
