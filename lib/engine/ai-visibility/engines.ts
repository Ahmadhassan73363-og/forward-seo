import type { AiCitation } from '../integration-types';
import { httpRequest } from '../http';
import { apiBase } from '../mock-apis';

/*
 * AI answer engines, each asked one question with web search turned on. Every engine returns the
 * answer text and the URLs it cited. Adding an engine = one entry in ENGINES.
 *
 *   OpenAI      POST https://api.openai.com/v1/responses, tools [{type:"web_search"}]
 *               → output[] message content[] output_text { text, annotations[] url_citation {url,title} }
 *   Perplexity  POST https://api.perplexity.ai/v1/agent (Agent API; Sonar chat completions is being retired)
 *               → output[] search_results { results[] {url,title} } + message content[] output_text
 *   Gemini      POST …/v1beta/models/{model}:generateContent, tools [{google_search:{}}]
 *               → candidates[0].content.parts[].text + groundingMetadata.groundingChunks[].web {uri,title}
 *               (uri is often a Google redirect; title is the source domain)
 *
 * Models are configurable because vendors rename them often; defaults are the ones in each
 * vendor's web-search docs (Nov 2026).
 */

export type EngineAnswer = { ok: true; text: string; citations: AiCitation[]; model?: string } | { ok: false; message: string; keyRejected?: boolean };

export interface Engine {
  id: string;
  label: string;
  keyEnv: string;
  key(): string | undefined;
  model(): string | undefined;
  ask(prompt: string, key: string, model: string | undefined): Promise<EngineAnswer>;
}

const TIMEOUT_MS = 90_000;

export const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

const cite = (url: unknown, title?: unknown, domain?: string): AiCitation | undefined => {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return undefined;
  return { url, title: typeof title === 'string' && title ? title : undefined, domain: domain || domainOf(url) };
};

const uniq = (list: Array<AiCitation | undefined>) => {
  const seen = new Set<string>();
  return list.filter((c): c is AiCitation => !!c && !seen.has(c.url) && !!seen.add(c.url));
};

const apiError = (r: Awaited<ReturnType<typeof httpRequest>>, vendor: string): string | undefined => {
  if (r.ok === false) return r.message;
  if (r.res.ok) return undefined;
  const msg = r.body?.error?.message || r.body?.error || r.body?.detail || r.text.slice(0, 200);
  const hint = r.res.status === 401 || r.res.status === 403 ? ` (check the ${vendor} API key)` : r.res.status === 429 ? ' (rate limit or quota reached)' : '';
  return `HTTP ${r.res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}${hint}`;
};

const openai: Engine = {
  id: 'chatgpt',
  label: 'ChatGPT (OpenAI)',
  keyEnv: 'OPENAI_API_KEY',
  key: () => process.env.OPENAI_API_KEY?.trim() || undefined,
  model: () => process.env.OPENAI_MODEL?.trim() || 'gpt-6-astra',
  async ask(prompt, key, model) {
    const r = await httpRequest(`${apiBase('https://api.openai.com', 'openai')}/v1/responses`, {
      headers: { Authorization: `Bearer ${key}` },
      json: { model, input: prompt, tools: [{ type: 'web_search' }] },
      timeoutMs: TIMEOUT_MS,
    });
    const err = apiError(r, 'OpenAI');
    if (err || r.ok === false) return { ok: false, message: err || 'request failed', keyRejected: r.ok === true && (r.res.status === 401 || r.res.status === 403) };
    const parts: string[] = [];
    const citations: Array<AiCitation | undefined> = [];
    for (const item of r.body?.output || []) {
      if (item?.type !== 'message') continue;
      for (const c of item.content || []) {
        if (c?.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
        for (const a of c?.annotations || []) if (a?.type === 'url_citation') citations.push(cite(a.url, a.title));
      }
    }
    const text = parts.join('\n') || (typeof r.body?.output_text === 'string' ? r.body.output_text : '');
    return text ? { ok: true, text, citations: uniq(citations), model: r.body?.model || model } : { ok: false, message: 'no answer text in the response' };
  },
};

const perplexity: Engine = {
  id: 'perplexity',
  label: 'Perplexity',
  keyEnv: 'PERPLEXITY_API_KEY',
  key: () => process.env.PERPLEXITY_API_KEY?.trim() || undefined,
  model: () => process.env.PERPLEXITY_MODEL?.trim() || undefined,
  async ask(prompt, key, model) {
    const r = await httpRequest(`${apiBase('https://api.perplexity.ai', 'perplexity')}/v1/agent`, {
      headers: { Authorization: `Bearer ${key}` },
      // Without a model, Perplexity's "fast" preset is used (as in its migration guide).
      json: { input: prompt, tools: [{ type: 'web_search' }], ...(model ? { model } : { effort: 'fast' }) },
      timeoutMs: TIMEOUT_MS,
    });
    const err = apiError(r, 'Perplexity');
    if (err || r.ok === false) return { ok: false, message: err || 'request failed', keyRejected: r.ok === true && (r.res.status === 401 || r.res.status === 403) };
    const b = r.body || {};
    const parts: string[] = [];
    const citations: Array<AiCitation | undefined> = [];
    for (const item of b.output || []) {
      if (item?.type === 'search_results') for (const s of item.results || []) citations.push(cite(s?.url, s?.title));
      if (item?.type === 'message') for (const c of item.content || []) if (c?.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
    }
    // Other documented shapes: top-level results[], and legacy Sonar (choices + citations / search_results).
    for (const s of b.results || []) citations.push(cite(s?.url, s?.title));
    for (const s of b.search_results || []) citations.push(cite(s?.url, s?.title));
    for (const u of b.citations || []) citations.push(cite(u));
    const text = parts.join('\n') || b.output_text || b.choices?.[0]?.message?.content || '';
    return text ? { ok: true, text, citations: uniq(citations), model: b.model || model } : { ok: false, message: 'no answer text in the response' };
  },
};

const gemini: Engine = {
  id: 'gemini',
  label: 'Gemini',
  keyEnv: 'GEMINI_API_KEY',
  key: () => process.env.GEMINI_API_KEY?.trim() || undefined,
  model: () => process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
  async ask(prompt, key, model) {
    const r = await httpRequest(`${apiBase('https://generativelanguage.googleapis.com', 'gemini')}/v1beta/models/${encodeURIComponent(model || '')}:generateContent`, {
      headers: { 'x-goog-api-key': key },
      json: { contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] },
      timeoutMs: TIMEOUT_MS,
    });
    const err = apiError(r, 'Gemini');
    if (err || r.ok === false) return { ok: false, message: err || 'request failed', keyRejected: r.ok === true && (r.res.status === 401 || r.res.status === 403) };
    const cand = r.body?.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p: any) => p?.text || '').join('');
    // Grounding URIs are usually Google redirect links; the title holds the source domain.
    const citations = (cand?.groundingMetadata?.groundingChunks || []).map((g: any) => {
      const title = typeof g?.web?.title === 'string' ? g.web.title : '';
      const titleDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(title) ? title.toLowerCase().replace(/^www\./, '') : undefined;
      return cite(g?.web?.uri, title, titleDomain);
    });
    return text ? { ok: true, text, citations: uniq(citations), model } : { ok: false, message: cand?.finishReason ? `no answer (finish reason ${cand.finishReason})` : 'no answer text in the response' };
  },
};

export const ENGINES: Engine[] = [openai, perplexity, gemini];

export const configuredEngines = () => ENGINES.filter((e) => !!e.key());
