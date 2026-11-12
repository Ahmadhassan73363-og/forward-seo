'use client';

import React from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import type { AiOverviewsData, AiVisibilityData, OtterlyData, Run } from '@/lib/engine/types';
import { Card, shortUrl } from '../ui';
import { Stat } from '../shared/stat';
import { int, SimpleTable, SourceNotice, xOfN } from '../shared/format';
import { engineSource, SourceHeading, SourceIcon } from '../shared/source';

const Yes = () => <Check className="w-3.5 h-3.5 text-emerald-700 inline" aria-label="yes" />;
const No = () => <X className="w-3.5 h-3.5 text-neutral-500 inline" aria-label="no" />;

/** AI Search tab: our AI-engine probes, Google AI Overviews and Otterly.AI, each in its own section. */
export function AiSearchTab({ run }: { run: Run }) {
  return (
    <div className="space-y-6">
      {run.aiVisibility && <AiVisibility d={run.aiVisibility} />}
      {run.aiOverviews && <AiOverviews d={run.aiOverviews} />}
      {run.otterly && <Otterly d={run.otterly} />}
    </div>
  );
}

function AiVisibility({ d }: { d: AiVisibilityData }) {
  const total = d.shareOfVoice.reduce((s, x) => s + x.mentions, 0);
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex gap-1 p-1 bg-white border border-neutral-200 rounded-sm">
          {d.engines.map((e) => (
            <SourceIcon key={e.engine} id={engineSource(e.engine)} size={16} />
          ))}
        </span>
        <div>
          <h3 className="text-base font-semibold text-neutral-900">AI answers: {d.engines.map((e) => e.label.split(' (')[0]).join(', ')}</h3>
          <p className="text-[11px] text-neutral-500">
            {d.prompts.length} buyer questions sent to each engine&apos;s API with web search on, {d.fetchedAt.slice(0, 10)}. Brand: <strong>{d.brand}</strong> (matched as {d.brandTerms.join(', ')}). API answers can differ from what people see in the apps, so treat these as a sample.
          </p>
        </div>
      </div>
      {d.status === 'unavailable' ? (
        <SourceNotice title="No AI engine answered." message={d.message} />
      ) : (
        <>
          <Card className="space-y-2">
            <SimpleTable
              head={['Engine', 'Answered', 'Mentions your brand', 'Cites your site', 'Names your products', 'Not answered']}
              rows={d.engines.map((e) => [
                <span key="e" className="inline-flex items-center gap-1.5">
                  <SourceIcon id={engineSource(e.engine)} size={14} />
                  {e.label}
                  {e.model && <span className="text-neutral-500 font-mono text-[10px]"> · {e.model}</span>}
                </span>,
                int(e.answered),
                xOfN(e.brandMentions, e.answered),
                xOfN(e.storeCitations, e.answered),
                <span key="p" title="Shopping questions only">{xOfN(e.productRecommendations, e.shoppingAnswered)}</span>,
                e.failed + e.notRun ? `${e.failed} failed · ${e.notRun} not sent` : '—',
              ])}
            />
            {d.errors.length > 0 && <p className="text-[11px] text-amber-700">{d.errors.join(' · ')}</p>}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-2">
              <h4 className="text-sm font-semibold text-neutral-900">Share of voice in AI answers</h4>
              {d.competitors.length === 0 && <p className="text-[11px] text-neutral-500">Add competitor brands in the audit form to compare.</p>}
              {d.shareOfVoice.map((s) => (
                <div key={s.name} className="text-xs space-y-0.5">
                  <div className="flex justify-between">
                    <span className={s.isStore ? 'font-semibold text-brand' : ''}>{s.name}</span>
                    <span className="text-neutral-600">{s.mentions} answers{total ? ` · ${Math.round((s.mentions / total) * 100)}%` : ''}</span>
                  </div>
                  <div className="h-1.5 bg-neutral-900/[0.07] rounded">
                    <div className={`h-1.5 rounded ${s.isStore ? 'bg-brand' : 'bg-neutral-500'}`} style={{ width: `${total ? (s.mentions / total) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </Card>
            <Card className="space-y-2">
              <h4 className="text-sm font-semibold text-neutral-900">Sites the AI answers cite most</h4>
              <SimpleTable head={['Site', 'Citations', 'Engines']} rows={d.citedDomains.slice(0, 12).map((c) => [<span key="d" className={c.isStore ? 'text-brand font-semibold' : c.competitor ? 'text-amber-700' : ''}>{c.domain}{c.isStore ? ' (you)' : c.competitor ? ` (${c.competitor})` : ''}</span>, int(c.count), <span key="en" className="inline-flex gap-1 justify-end">{c.engines.map((e) => <SourceIcon key={e} id={engineSource(e)} size={13} />)}</span>])} />
            </Card>
          </div>

          {d.storeUrlsCited.length > 0 && (
            <Card className="space-y-2">
              <h4 className="text-sm font-semibold text-neutral-900">Your pages cited by AI engines</h4>
              <SimpleTable head={['Page', 'Times cited']} rows={d.storeUrlsCited.map((u) => [<a key="u" href={u.url} target="_blank" rel="noreferrer" className="font-mono break-all hover:text-brand">{shortUrl(u.url)}</a>, int(u.count)])} />
            </Card>
          )}

          <Card className="space-y-2">
            <h4 className="text-sm font-semibold text-neutral-900">Questions and answers (evidence)</h4>
            <div className="space-y-2">
              {d.prompts.map((p, i) => {
                const answers = d.answers.filter((a) => a.promptIndex === i);
                return (
                  <details key={i} className="border border-neutral-200 rounded-lg p-2.5 text-xs">
                    <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.text}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-900/[0.07] text-neutral-600">{p.group}</span>
                      <span className="text-[10px] text-neutral-500">from {p.source}</span>
                      <span className="ml-auto flex gap-2 text-[10px] text-neutral-600">
                        {answers.map((a) => (
                          <span key={a.engine} className="inline-flex items-center gap-1" title={`${a.engine}: brand ${a.brandMentioned ? 'mentioned' : 'not mentioned'}`}>
                            <SourceIcon id={engineSource(a.engine)} size={12} />
                            {a.ok ? (a.brandMentioned ? <Yes /> : <No />) : <span className="text-amber-700">{a.notRun ? 'not sent' : 'failed'}</span>}
                          </span>
                        ))}
                      </span>
                    </summary>
                    <div className="mt-2 space-y-3">
                      {answers.map((a) => (
                        <div key={a.engine} className="space-y-1">
                          <p className="text-[11px] font-semibold text-neutral-700 flex flex-wrap items-center gap-1">
                            <SourceIcon id={engineSource(a.engine)} size={12} />
                            {a.engine}
                            {a.model && <span className="font-mono text-neutral-500"> · {a.model}</span>}
                            {a.ok && (
                              <span className="text-neutral-600 font-normal">
                                {' '}· brand {a.brandMentioned ? 'mentioned' : 'not mentioned'} · your site {a.storeCited ? 'cited' : 'not cited'}
                                {a.competitorsMentioned.length > 0 && ` · competitors: ${a.competitorsMentioned.join(', ')}`}
                                {a.productsMentioned.length > 0 && ` · products: ${a.productsMentioned.map((x) => (x.startsWith('http') ? shortUrl(x) : x)).join(', ')}`}
                              </span>
                            )}
                          </p>
                          {a.ok ? <p className="whitespace-pre-wrap text-neutral-700 bg-white/55 rounded p-2 max-h-64 overflow-y-auto">{a.text}</p> : <p className="text-amber-700">{a.error || a.notRun}</p>}
                          {a.citations.length > 0 && (
                            <p className="text-[10px] text-neutral-500 break-all">
                              Sources: {a.citations.map((c, j) => (
                                <a key={j} href={c.url} target="_blank" rel="noreferrer" className="hover:text-brand mr-2">
                                  {c.domain}
                                </a>
                              ))}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </section>
  );
}

function AiOverviews({ d }: { d: AiOverviewsData }) {
  const ok = d.keywords.filter((k) => k.ok);
  const withAio = ok.filter((k) => k.hasAio);
  return (
    <section className="space-y-3">
      <SourceHeading
        id="dataforseo"
        title="Google AI Overviews"
        sub={<>Google results for {d.keywords.length} keywords via DataForSEO ({d.location}, {d.language}, {d.device}), {d.fetchedAt.slice(0, 10)}. Search Console can&apos;t separate AI Overview traffic, so this checks the results pages directly.</>}
      />
      {d.status === 'unavailable' ? (
        <SourceNotice title="AI Overviews could not be checked." message={d.message} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat source="dataforseo" label="Keywords with an AI Overview" value={xOfN(withAio.length, ok.length)} />
            <Stat source="dataforseo" label="AI Overviews citing your site" value={xOfN(withAio.filter((k) => k.storeCited).length, withAio.length)} />
            <Stat source="dataforseo" label="Your best organic position (median)" value={(() => { const p = ok.map((k) => k.storeOrganicPosition).filter((x): x is number => x !== undefined).sort((a, b) => a - b); return p.length ? String(p[Math.floor(p.length / 2)]) : '—'; })()} sub="On the same results pages (top 20)" />
          </div>
          {d.errors.length > 0 && <p className="text-[11px] text-amber-700">{d.errors.join(' · ')}</p>}
          <Card>
            <SimpleTable
              head={['Keyword', 'AI Overview', 'Cites you', 'Competitors cited', 'Your position', 'Sources in the AI Overview']}
              rows={d.keywords.map((k) => [
                <span key="k">
                  {k.keyword}
                  <span className="block text-[10px] text-neutral-500">{k.source}</span>
                </span>,
                k.ok ? (k.hasAio ? <Yes key="a" /> : <No key="a" />) : <span key="a" className="text-amber-700">{k.notRun ? 'not checked' : 'failed'}</span>,
                k.ok && k.hasAio ? (k.storeCited ? <Yes key="c" /> : <No key="c" />) : '—',
                k.competitorsCited.join(', ') || '—',
                k.storeOrganicPosition ?? '—',
                <span key="r" className="text-[10px] text-neutral-600 break-all">{k.error || k.references.slice(0, 5).map((r) => r.domain).join(', ') || '—'}</span>,
              ])}
            />
          </Card>
        </>
      )}
    </section>
  );
}

function Otterly({ d }: { d: OtterlyData }) {
  return (
    <section className="space-y-3">
      <SourceHeading
        id="otterly"
        title="Otterly.AI"
        sub={<>From your Otterly brand report{d.reportName ? ` "${d.reportName}"` : ''}{d.range ? `, ${d.range.start} to ${d.range.end}` : ''}{d.country ? `, ${d.country}` : ''}. Shown as Otterly reports it, separate from our own checks above.</>}
      />
      {d.status === 'unavailable' || d.status === 'no_report' ? (
        <SourceNotice title={d.status === 'no_report' ? 'No Otterly brand report for this store.' : 'Otterly returned no data.'} message={d.message} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat source="otterly" label="Share of voice" value={d.summary?.shareOfVoice !== undefined ? String(d.summary.shareOfVoice) : '—'} sub="As reported by Otterly" />
            <Stat source="otterly" label="Brand coverage" value={d.summary?.brandCoverage !== undefined ? String(d.summary.brandCoverage) : '—'} />
            <Stat source="otterly" label="Mentions" value={int(d.summary?.totalMentions)} sub={d.totalPrompts !== undefined ? `${d.totalPrompts} prompts tracked` : undefined} />
            <Stat source="otterly" label="Average position" value={d.summary?.averagePosition !== undefined ? d.summary.averagePosition.toFixed(1) : '—'} />
          </div>
          {d.errors.length > 0 && <p className="text-[11px] text-amber-700">{d.errors.join(' · ')}</p>}
          {d.brands && d.brands.length > 0 && (
            <Card className="space-y-2">
              <h4 className="text-sm font-semibold text-neutral-900">Brands in Otterly&apos;s tracked answers</h4>
              <SimpleTable head={['Brand', 'Mentions', 'Share of voice', 'Coverage', 'Domain citations']} rows={d.brands.map((b) => [<span key="b" className={b.isMainBrand ? 'text-brand font-semibold' : ''}>{b.brand}</span>, int(b.mentions), b.shareOfVoice ?? '—', b.brandCoverage ?? '—', int(b.domainCitations)])} />
            </Card>
          )}
          {d.citations && d.citations.length > 0 && (
            <Card className="space-y-2">
              <h4 className="text-sm font-semibold text-neutral-900">Most cited URLs</h4>
              <SimpleTable
                head={['URL', 'Citations', 'Category']}
                rows={d.citations.map((c) => [
                  <a key="u" href={c.url} target="_blank" rel="noreferrer" className={`font-mono break-all hover:text-brand inline-flex gap-1 ${c.isMyBrandDomain ? 'text-brand' : ''}`}>
                    {c.domain}
                    {shortUrl(c.url) === '/' ? '' : shortUrl(c.url)} <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>,
                  int(c.citations),
                  c.category || '—',
                ])}
              />
            </Card>
          )}
        </>
      )}
    </section>
  );
}
