import type { AiAnswer, AiEngineSummary, AiInput, AiVisibilityData } from '../integration-types';
import { brandInfo, competitorList, mentions } from '../brand';
import { envInt } from '../google/config';
import { mapLimit } from '../http';
import { configuredEngines, domainOf, ENGINES } from './engines';
import { buildPrompts, productMatchNames } from './prompts';

export { ENGINES, configuredEngines } from './engines';

/*
 * AI visibility: the same buyer questions are sent to ChatGPT, Perplexity and Gemini (whichever
 * keys are set), with web search on. Each answer is checked for the brand, competitors, the store's
 * products and cited URLs. Results are a SAMPLE ("x of n prompts"), measured through the APIs —
 * not identical to what people see in the consumer apps — and the answers are kept as evidence.
 *
 *   OPENAI_API_KEY / PERPLEXITY_API_KEY / GEMINI_API_KEY   one or more engines
 *   OPENAI_MODEL / PERPLEXITY_MODEL / GEMINI_MODEL          optional model overrides
 *   AI_PROBE_MAX_PROMPTS   questions per audit (default 8; × engines = API calls)
 *   AI_PROBE_CONCURRENCY   calls in flight (default 6)
 */

export function aiVisibilityConfig() {
  const engines = configuredEngines();
  return { enabled: engines.length > 0, engines, maxPrompts: envInt('AI_PROBE_MAX_PROMPTS', 8, 1, 100), concurrency: envInt('AI_PROBE_CONCURRENCY', 6, 1, 20) };
}

export interface AiVisibilityContext {
  host: string;
  input?: AiInput;
  /** Non-brand Search Console queries (best first), if Search Console is connected. */
  queries: string[];
  catalog: { products: string[]; collections: Array<{ title: string; count?: number }> };
  /** Milliseconds left in the audit's time budget (Infinity when unlimited). */
  timeLeftMs: () => number;
  isCancelled: () => boolean;
}

const MIN_TIME_MS = 45_000; // don't start a call that probably can't finish
const MAX_ANSWER_CHARS = 6_000;

export async function fetchAiVisibility(ctx: AiVisibilityContext): Promise<AiVisibilityData | undefined> {
  const cfg = aiVisibilityConfig();
  if (!cfg.enabled) return undefined;
  const domain = ctx.host.toLowerCase().replace(/^www\./, '');
  const b = brandInfo(ctx.host, ctx.input);
  const competitors = competitorList(ctx.input);
  const products = productMatchNames(ctx.catalog.products);
  const prompts = buildPrompts({ brand: b.brand, brandTerms: b.terms, domain, competitors, custom: ctx.input?.prompts || [], queries: ctx.queries, collections: ctx.catalog.collections, max: cfg.maxPrompts });

  const out: AiVisibilityData = {
    fetchedAt: new Date().toISOString(),
    status: 'ok',
    errors: [],
    brand: b.brand,
    brandTerms: b.terms,
    competitors: competitors.map((c) => ({ name: c.name, terms: c.terms })),
    productNamesChecked: products.length,
    prompts,
    engines: [],
    answers: [],
    citedDomains: [],
    storeUrlsCited: [],
    shareOfVoice: [],
  };
  if (b.guessed) out.errors.push(`Brand name guessed from the domain ("${b.brand}"). Enter the real brand name in the audit form for accurate mention counts.`);

  // Interleave engines so a rejected key is noticed early, then skip that engine's other questions.
  const jobs = prompts.flatMap((_, promptIndex) => cfg.engines.map((engine) => ({ engine, promptIndex })));
  const rejected = new Set<string>();
  const answers = await mapLimit(jobs, cfg.concurrency, async ({ engine, promptIndex }): Promise<AiAnswer> => {
    const base: AiAnswer = { engine: engine.id, promptIndex, ok: false, citations: [], brandMentioned: false, storeCited: false, competitorsMentioned: [], productsMentioned: [] };
    if (ctx.isCancelled()) return { ...base, notRun: 'audit cancelled' };
    if (rejected.has(engine.id)) return { ...base, notRun: 'skipped: the API key was rejected' };
    if (ctx.timeLeftMs() < MIN_TIME_MS) return { ...base, notRun: 'audit time limit reached' };
    const r = await engine.ask(prompts[promptIndex].text, engine.key()!, engine.model());
    if (r.ok === false) {
      if (r.keyRejected) rejected.add(engine.id);
      return { ...base, error: r.message };
    }
    const storeCites = r.citations.filter((c) => c.domain === domain || c.domain.endsWith(`.${domain}`));
    const productsMentioned = products.filter((p) => mentions(r.text, [p]));
    // A cited product page of the store also counts as a product recommendation.
    for (const c of storeCites) if (/\/products\//.test(c.url) && !productsMentioned.includes(c.url)) productsMentioned.push(c.url);
    return {
      ...base,
      ok: true,
      model: r.model,
      text: r.text.length > MAX_ANSWER_CHARS ? `${r.text.slice(0, MAX_ANSWER_CHARS)}…` : r.text,
      citations: r.citations.slice(0, 40),
      brandMentioned: mentions(r.text, b.terms) || storeCites.length > 0,
      storeCited: storeCites.length > 0,
      competitorsMentioned: competitors.filter((c) => mentions(r.text, c.terms)).map((c) => c.name),
      productsMentioned,
    };
  });
  out.answers = answers.sort((a, b) => a.engine.localeCompare(b.engine) || a.promptIndex - b.promptIndex);

  // Per-engine summaries ("x of answered").
  out.engines = cfg.engines.map((engine): AiEngineSummary => {
    const mine = out.answers.filter((a) => a.engine === engine.id);
    const ok = mine.filter((a) => a.ok);
    const shopping = ok.filter((a) => prompts[a.promptIndex].group === 'shopping');
    const comp: Record<string, number> = {};
    for (const c of competitors) comp[c.name] = ok.filter((a) => a.competitorsMentioned.includes(c.name)).length;
    const firstError = mine.find((a) => a.error)?.error;
    if (firstError) out.errors.push(`${engine.label}: ${mine.filter((a) => a.error).length} of ${mine.length} requests failed (${firstError})`);
    const notRun = mine.filter((a) => a.notRun).length;
    if (notRun) out.errors.push(`${engine.label}: ${notRun} prompts not sent (${mine.find((a) => a.notRun)!.notRun})`);
    return {
      engine: engine.id,
      label: engine.label,
      model: ok[0]?.model || engine.model(),
      answered: ok.length,
      failed: mine.filter((a) => a.error).length,
      notRun,
      brandMentions: ok.filter((a) => a.brandMentioned).length,
      storeCitations: ok.filter((a) => a.storeCited).length,
      shoppingAnswered: shopping.length,
      productRecommendations: shopping.filter((a) => a.productsMentioned.length > 0).length,
      competitorMentions: comp,
    };
  });

  // Cited domains and store URLs across all engines.
  const domains = new Map<string, { count: number; engines: Set<string> }>();
  const storeUrls = new Map<string, number>();
  for (const a of out.answers) {
    for (const c of a.citations) {
      const d = c.domain || domainOf(c.url);
      if (!d) continue;
      const e = domains.get(d) || { count: 0, engines: new Set<string>() };
      e.count++;
      e.engines.add(a.engine);
      domains.set(d, e);
      if (d === domain || d.endsWith(`.${domain}`)) storeUrls.set(c.url, (storeUrls.get(c.url) || 0) + 1);
    }
  }
  const compByDomain = new Map(competitorList(ctx.input).filter((c) => c.domain).map((c) => [c.domain!, c.name]));
  out.citedDomains = Array.from(domains.entries())
    .map(([d, v]) => ({ domain: d, count: v.count, engines: Array.from(v.engines), isStore: d === domain || d.endsWith(`.${domain}`), competitor: compByDomain.get(d) }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 40);
  out.storeUrlsCited = Array.from(storeUrls.entries()).map(([url, count]) => ({ url, count })).sort((x, y) => y.count - x.count);

  const okAnswers = out.answers.filter((a) => a.ok);
  out.shareOfVoice = [
    { name: b.brand, mentions: okAnswers.filter((a) => a.brandMentioned).length, isStore: true },
    ...competitors.map((c) => ({ name: c.name, mentions: okAnswers.filter((a) => a.competitorsMentioned.includes(c.name)).length, isStore: false })),
  ];

  const answered = okAnswers.length;
  out.status = answered === out.answers.length ? 'ok' : answered > 0 ? 'partial' : 'unavailable';
  if (out.status === 'unavailable') out.message = out.errors.filter((e) => !e.startsWith('Brand name guessed')).join(' ') || 'No AI engine answered.';
  return out;
}
