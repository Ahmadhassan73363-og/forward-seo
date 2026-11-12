#!/usr/bin/env node
/*
 * Local mock of the Ahrefs, Semrush, Google (Search Console, GA4, Merchant Center), OpenAI, Perplexity, Gemini, DataForSEO and Otterly.AI APIs, for testing the report tabs
 * without paid keys. Every answer is DUMMY data in the response formats from each service's docs.
 *
 *   node scripts/mock-apis.mjs [store-domain] [--port 4010]
 *
 * Then start the app in development mode with (see docs/TESTING_INTEGRATIONS.md):
 *   MOCK_API_BASE=http://localhost:4010
 *   AHREFS_PAID_API_KEY=mock-key  (or AHREFS_FREE_API_KEY=mock-key)
 *   SEMRUSH_API_KEY=mock-key
 *   GOOGLE_SERVICE_ACCOUNT_FILE=.data/mock/gsc-service-account.json   (written by this script)
 *   GA4_ENABLED=true  MERCHANT_ENABLED=true
 *   OPENAI_API_KEY / PERPLEXITY_API_KEY / GEMINI_API_KEY=mock-key
 *   DATAFORSEO_LOGIN=mock DATAFORSEO_PASSWORD=mock-key   OTTERLY_API_KEY=mock-key
 *
 * The key "bad-key" is rejected the way each real service rejects a wrong key, to test errors.
 * Google and Otterly grant access to [store-domain] only; any other store gets the "no access" state.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : 4010;
const SITE = (args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port') || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();

// A throwaway service account key so the app's real Google sign-in code (JWT signing) runs.
const keyFile = path.resolve('.data/mock/gsc-service-account.json');
if (!fs.existsSync(keyFile)) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, JSON.stringify({ type: 'service_account', project_id: 'mock-project', client_email: 'mock-audit@mock-project.iam.gserviceaccount.com', private_key: privateKey }, null, 2));
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const text = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(body);
};
const brandOf = (d) => (d || 'store').replace(/^www\./, '').split('.')[0];
const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};

// ── Ahrefs API v3 ──────────────────────────────────────────────────────────────
function ahrefs(req, res, u) {
  const auth = req.headers.authorization || '';
  if (auth === 'Bearer bad-key') return json(res, 401, ['Error', 'Unauthorized']);
  const target = u.searchParams.get('target') || '';
  const origin = `https://${target.replace(/\/.*$/, '')}`;
  const b = brandOf(target);
  switch (u.pathname.replace('/ahrefs/v3', '')) {
    case '/public/domain-rating-free':
      return json(res, 200, { domain_rating: { domain_rating: 47 } });
    case '/site-explorer/backlinks-stats':
      return json(res, 200, { metrics: { live: 18240, all_time: 52310, live_refdomains: 1342, all_time_refdomains: 3120 } });
    case '/site-explorer/metrics':
      return json(res, 200, { metrics: { org_traffic: 38400, org_keywords: 9120, org_keywords_1_3: 610, org_cost: 2210000 } });
    case '/site-explorer/top-pages':
      return json(res, 200, {
        pages: [
          { url: `${origin}/`, sum_traffic: 14200, keywords: 1830, top_keyword: b, top_keyword_volume: 22000, top_keyword_best_position: 1 },
          { url: `${origin}/collections/all`, sum_traffic: 3900, keywords: 640, top_keyword: `${b} shop`, top_keyword_volume: 2400, top_keyword_best_position: 2 },
          { url: `${origin}/products/sample-product`, sum_traffic: 1250, keywords: 210, top_keyword: 'sample product', top_keyword_volume: 5400, top_keyword_best_position: 6 },
        ],
      });
    case '/site-explorer/organic-keywords':
      return json(res, 200, {
        keywords: [
          { keyword: b, volume: 22000, best_position: 1, best_position_url: `${origin}/` },
          { keyword: 'sample product', volume: 5400, best_position: 6, best_position_url: `${origin}/products/sample-product` },
          { keyword: `${b} shop`, volume: 2400, best_position: 2, best_position_url: `${origin}/collections/all` },
        ],
      });
  }
  return json(res, 404, { error: `mock: unknown Ahrefs endpoint ${u.pathname}` });
}

// ── Semrush (SEO API v3 CSV, Backlinks API v4 JSON, units balance) ─────────────
function semrush(req, res, u) {
  if (u.pathname === '/semrush-www/users/countapiunits.html') return u.searchParams.get('key') === 'bad-key' ? text(res, 200, 'ERROR 120 :: WRONG KEY - ID PAIR') : text(res, 200, '48645');
  if (u.pathname.startsWith('/semrush/apis/v4/')) {
    if ((req.headers.authorization || '') === 'Apikey bad-key') return json(res, 403, { meta: { success: false, status_code: 403 }, error: { code: 403, message: 'wrong key' } });
    return json(res, 200, { meta: { success: true, status_code: 200 }, data: { score: 44, backlinks_count: 21530, domains_count: 1488 } });
  }
  if (u.searchParams.get('key') === 'bad-key') return text(res, 403, 'ERROR 120 :: WRONG KEY - ID PAIR');
  const domain = u.searchParams.get('domain') || '';
  const origin = `https://${domain}`;
  const b = brandOf(domain);
  const csv = {
    domain_rank: `Domain;Rank;Organic Keywords;Organic Traffic;Organic Cost\n${domain};48210;8740;35100;61200`,
    domain_organic: `Keyword;Position;Search Volume;Url;Traffic (%)\n${b};1;22200;${origin}/;41.30\nsample product;5;5400;${origin}/products/sample-product;4.12\n${b} sale;3;1900;${origin}/collections/sale;2.75`,
    domain_organic_unique: `Url;Number of Keywords;Traffic;Traffic (%)\n${origin}/;1640;15800;45.01\n${origin}/collections/sale;410;2900;8.26\n${origin}/products/sample-product;190;1450;4.13`,
  }[u.searchParams.get('type')];
  return csv ? text(res, 200, csv) : text(res, 200, 'ERROR 50 :: NOTHING FOUND');
}

// ── Google: OAuth token, Search Console, URL Inspection, GA4, Merchant API ──────
// Paths are /google/<real host>/<real path>, e.g. /google/www.googleapis.com/webmasters/v3/sites.
const G = {
  oauth: '/google/oauth2.googleapis.com',
  webmasters: '/google/www.googleapis.com/webmasters/v3',
  inspect: '/google/searchconsole.googleapis.com/v1/urlInspection/index:inspect',
  gaAdmin: '/google/analyticsadmin.googleapis.com/v1beta',
  gaData: '/google/analyticsdata.googleapis.com/v1beta',
  merchant: '/google/merchantapi.googleapis.com',
};

function google(req, res, u, body) {
  const p = u.pathname;
  if (p === `${G.oauth}/token`) {
    const assertion = new URLSearchParams(body).get('assertion') || '';
    return assertion.split('.').length === 3 ? json(res, 200, { access_token: 'mock-token', expires_in: 3600, token_type: 'Bearer' }) : json(res, 400, { error: 'invalid_grant', error_description: 'mock: malformed JWT' });
  }
  if ((req.headers.authorization || '') !== 'Bearer mock-token') return json(res, 401, { error: { code: 401, message: 'mock: missing token' } });
  const origin = `https://www.${SITE}`;
  const q = body ? JSON.parse(body) : {};

  // Search Console
  if (p === `${G.webmasters}/sites`) return json(res, 200, { siteEntry: SITE ? [{ siteUrl: `sc-domain:${SITE}`, permissionLevel: 'siteRestrictedUser' }] : [] });
  if (p.startsWith(`${G.webmasters}/sites/`) && p.endsWith('/searchAnalytics/query')) {
    const row = (keys, clicks, impressions, position) => ({ keys, clicks, impressions, ctr: clicks / impressions, position });
    const dim = (q.dimensions || [])[0];
    const f = q.dimensionFilterGroups?.[0]?.filters?.[0];
    const previous = q.endDate < day(20);
    if (f?.dimension === 'page' && !dim) {
      if (f.expression.includes('products')) return json(res, 200, { rows: [row([], 5200, 310000, 9.8)] });
      if (f.expression.includes('collections')) return json(res, 200, { rows: [row([], 6900, 280000, 8.1)] });
      return json(res, 200, { rows: [row([], 11800, 190000, 3.9)] });
    }
    if (f?.dimension === 'query') {
      const brandQ = f.operator === 'includingRegex';
      if (!dim) return json(res, 200, { rows: [brandQ ? row([], 17400, 61000, 1.4) : row([], 9400, 851000, 14.6)] });
      return json(res, 200, { rows: [row(['wool sneakers'], 1300, 88000, 6.2), row(['sustainable running shoes'], 940, 120000, 8.4), row(['merino socks'], 610, 41000, 5.9), row(['slip on shoes women'], 420, 65000, 11.2)] });
    }
    if (!dim) return json(res, 200, { rows: [row([], previous ? 23900 : 26800, previous ? 850000 : 912000, previous ? 12.1 : 11.4)] });
    if (dim === 'date') return json(res, 200, { rows: Array.from({ length: 28 }, (_, i) => row([day(30 - i)], 800 + Math.round(250 * Math.sin(i / 2.5)) + i * 8, 30000 + i * 150, 11.4)) });
    if (dim === 'query') return json(res, 200, { rows: [row([brandOf(SITE)], 7100, 16500, 1.2), row(['wool sneakers'], 1300, 88000, 6.2), row([`${brandOf(SITE)} sale`], 420, 9800, 3.1)] });
    if (dim === 'page') return json(res, 200, { rows: [row([`${origin}/`], 9300, 118000, 4.0), row([`${origin}/collections/sale`], 2100, 87000, 7.9), row([`${origin}/products/sample-product`], 870, 39000, 6.4)] });
    if (dim === 'device') return json(res, 200, { rows: [row(['MOBILE'], 18900, 690000, 12.0), row(['DESKTOP'], 7400, 205000, 9.2), row(['TABLET'], 500, 17000, 10.5)] });
    if (dim === 'country') return json(res, 200, { rows: [row(['usa'], 16100, 560000, 10.8), row(['gbr'], 4200, 150000, 11.9), row(['can'], 2300, 80000, 12.4)] });
  }
  if (p.startsWith(`${G.webmasters}/sites/`) && p.endsWith('/sitemaps')) return json(res, 200, { sitemap: [{ path: `${origin}/sitemap.xml`, lastSubmitted: `${day(40)}T08:00:00Z`, lastDownloaded: `${day(2)}T03:00:00Z`, isPending: false, isSitemapsIndex: true, type: 'sitemap', warnings: '2', errors: '0', contents: [{ type: 'web', submitted: '1840' }] }] });
  if (p === G.inspect) {
    const url = q.inspectionUrl || '';
    const base = { robotsTxtState: 'ALLOWED', indexingState: 'INDEXING_ALLOWED', pageFetchState: 'SUCCESSFUL', crawledAs: 'MOBILE', lastCrawlTime: `${day(3)}T10:00:00Z` };
    const link = 'https://search.google.com/search-console/inspect';
    if (url.includes('/products/')) return json(res, 200, { inspectionResult: { inspectionResultLink: link, indexStatusResult: { ...base, verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed' } } });
    if (url.includes('/collections/')) return json(res, 200, { inspectionResult: { inspectionResultLink: link, indexStatusResult: { ...base, verdict: 'PASS', coverageState: 'Submitted and indexed', userCanonical: `${url}?page=1`, googleCanonical: url } } });
    return json(res, 200, { inspectionResult: { inspectionResultLink: link, indexStatusResult: { ...base, verdict: 'PASS', coverageState: 'Submitted and indexed', userCanonical: url, googleCanonical: url }, richResultsResult: { verdict: 'PASS', detectedItems: [{ richResultType: 'Organization', items: [{ name: 'Organization', issues: [] }] }, { richResultType: 'Product snippets', items: [{ name: 'Product', issues: [{ issueMessage: 'Missing field "aggregateRating"', severity: 'WARNING' }] }] }] } } });
  }

  // GA4 Admin API: one property whose web stream is the store
  if (p === `${G.gaAdmin}/accountSummaries`) return json(res, 200, { accountSummaries: SITE ? [{ account: 'accounts/1', displayName: 'Mock account', propertySummaries: [{ property: 'properties/111', displayName: `${brandOf(SITE)} – GA4` }] }] : [] });
  if (p === `${G.gaAdmin}/properties/111/dataStreams`) return json(res, 200, { dataStreams: [{ name: 'properties/111/dataStreams/1', type: 'WEB_DATA_STREAM', webStreamData: { measurementId: 'G-MOCK123', defaultUri: origin } }] });
  // GA4 Data API runReport. Metric order: sessions, engagedSessions, keyEvents, sessionKeyEventRate, ecommercePurchases, purchaseRevenue
  if (p === `${G.gaData}/properties/111:runReport`) {
    const m = (...v) => v.map((x) => ({ value: String(x) }));
    const dim = q.dimensions?.[0]?.name;
    const field = q.dimensionFilter?.filter?.fieldName;
    const previous = q.dateRanges?.[0]?.endDate < day(20);
    if (!dim && field === 'sessionDefaultChannelGroup') return json(res, 200, { rows: [{ metricValues: previous ? m(29800, 19100, 980, 0.0329, 642, 61840.5) : m(31250, 20400, 1120, 0.0358, 731, 70415.25) }], rowCount: 1, metadata: {} });
    if (!dim && field === 'sessionSource') return json(res, 200, { rows: [{ metricValues: m(402, 301, 22, 0.0547, 14, 1420.0) }], rowCount: 1, metadata: {} });
    if (!dim) return json(res, 200, { rows: [{ metricValues: m(96400, 61000, 3010, 0.0312, 1802, 171230.75) }], rowCount: 1, metadata: {} });
    if (dim === 'sessionSource') return json(res, 200, { rows: [{ dimensionValues: [{ value: 'chatgpt.com' }], metricValues: m(388, 290, 25, 0.0644, 17, 1690.0) }, { dimensionValues: [{ value: 'perplexity.ai' }], metricValues: m(91, 70, 4, 0.044, 3, 260.0) }, { dimensionValues: [{ value: 'gemini.google.com' }], metricValues: m(37, 25, 1, 0.027, 1, 89.0) }], rowCount: 3, metadata: { subjectToThresholding: true } });
    if (dim === 'date') return json(res, 200, { rows: Array.from({ length: 28 }, (_, i) => ({ dimensionValues: [{ value: day(28 - i).replace(/-/g, '') }], metricValues: [{ value: String(10 + i + Math.round(5 * Math.sin(i))) }] })), rowCount: 28, metadata: {} });
    if (dim === 'landingPage') return json(res, 200, { rows: [['/', 12100, 301, 29800], ['/collections/sale', 5200, 140, 12900], ['/products/sample-product', 2900, 121, 11600], ['/collections/mens', 2600, 52, 5100], ['/blogs/news/how-to-wash-wool', 1400, 6, 410]].map(([page, s, pu, r]) => ({ dimensionValues: [{ value: page }], metricValues: m(s, Math.round(s * 0.65), Math.round(pu * 1.5), 0.03, pu, r) })), rowCount: 5, metadata: {} });
  }

  // Merchant API v1
  if (p === `${G.merchant}/accounts/v1/accounts`) return json(res, 200, { accounts: SITE ? [{ name: 'accounts/555', accountId: '555', accountName: `${brandOf(SITE)} store`, homePageUri: origin }] : [] });
  if (p === `${G.merchant}/reports/v1/accounts/555/reports:search`) {
    const query = q.query || '';
    const date = (s) => ({ year: Number(s.slice(0, 4)), month: Number(s.slice(5, 7)), day: Number(s.slice(8, 10)) });
    if (query.includes('FROM product_view')) {
      const prods = [
        ['online~en~US~1001', '1001', 'Sample Wool Runner', 'ELIGIBLE', []],
        ['online~en~US~1002', '1002', 'Sample Tree Dasher', 'ELIGIBLE', []],
        ['online~en~US~1003', '1003', 'Sample Merino Socks', 'ELIGIBLE_LIMITED', [['missing_item_attribute_for_product_type', 'gtin', 'DEMOTED']]],
        ['online~en~US~1004', '1004', 'Sample Lounger', 'NOT_ELIGIBLE_OR_DISAPPROVED', [['price_mismatch', 'price', 'DISAPPROVED']]],
        ['online~en~US~1005', '1005', 'Sample Gift Box', 'NOT_ELIGIBLE_OR_DISAPPROVED', [['image_link_broken', 'image_link', 'DISAPPROVED'], ['missing_item_attribute_for_product_type', 'gtin', 'DEMOTED']]],
        ['online~en~US~1006', '1006', 'Sample Slipper', 'PENDING', []],
      ];
      return json(res, 200, { results: prods.map(([id, offerId, title, st, issues]) => ({ productView: { id, offerId, title, aggregatedReportingContextStatus: st, itemIssues: issues.map(([code, attr, sev]) => ({ type: { code, canonicalAttribute: attr }, severity: { aggregatedSeverity: sev }, resolution: 'MERCHANT_ACTION' })) } })) });
    }
    if (query.includes('ORDER BY clicks')) return json(res, 200, { results: [['1001', 'Sample Wool Runner', 820, 41000], ['1002', 'Sample Tree Dasher', 510, 30500], ['1003', 'Sample Merino Socks', 230, 19000]].map(([offerId, title, clicks, imp]) => ({ productPerformanceView: { offerId, title, clicks: String(clicks), impressions: String(imp), clickThroughRate: clicks / imp } })) });
    if (query.includes('SELECT date')) return json(res, 200, { results: Array.from({ length: 28 }, (_, i) => ({ productPerformanceView: { date: date(day(28 - i)), clicks: String(50 + i * 2), impressions: String(2600 + i * 40), clickThroughRate: 0.02, conversions: 1.5 } })) });
    return json(res, 200, { results: [{ productPerformanceView: { clicks: '1310', impressions: '70100', clickThroughRate: 0.0187, conversions: 31 } }] });
  }
  return json(res, 404, { error: { code: 404, message: `mock: unknown Google endpoint ${p}` } });
}

// ── AI engines: OpenAI Responses, Perplexity Agent API, Gemini generateContent ──
// Answers are deterministic per question: some mention the brand, some cite the store, some
// mention the dummy competitors "Northwind Shoes" and "contoso.com".
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
function aiAnswer(engine, prompt) {
  const brand = brandOf(SITE).replace(/^./, (c) => c.toUpperCase());
  const h = hash(engine + prompt);
  const mention = /what is|vs|or /i.test(prompt) || h % 3 !== 0;
  const cite = h % 2 === 0;
  const competitor = h % 4 === 1;
  const lines = [`DUMMY ANSWER from the mock ${engine} API for: "${prompt}".`];
  if (mention) lines.push(`${brand} is a popular choice, known for comfortable shoes and the Sample Product line.`);
  if (competitor) lines.push('Northwind Shoes is another option, and Contoso also sells similar products.');
  if (!mention && !competitor) lines.push('Several independent retailers and marketplaces offer good options here.');
  const cites = [
    { url: 'https://www.example-reviews.com/best-shoes', title: 'Best shoes (dummy review site)' },
    ...(cite ? [{ url: `https://www.${SITE}/products/sample-product`, title: `${brand} Sample Product` }] : []),
    ...(competitor ? [{ url: 'https://www.contoso.com/shoes', title: 'Contoso shoes' }] : []),
    { url: 'https://www.reddit.com/r/shoes/comments/dummy', title: 'Reddit thread (dummy)' },
  ];
  return { text: lines.join('\n\n'), cites };
}

function aiEngines(req, res, u, body) {
  const auth = req.headers.authorization || req.headers['x-goog-api-key'] || '';
  if (/bad-key/.test(auth)) return json(res, 401, { error: { message: 'Incorrect API key provided (mock)' } });
  const q = body ? JSON.parse(body) : {};
  if (u.pathname === '/openai/v1/responses') {
    const a = aiAnswer('openai', String(q.input));
    return json(res, 200, { id: 'resp_mock', model: q.model, output: [{ type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'search', query: q.input } }, { type: 'message', id: 'msg_1', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: a.text, annotations: a.cites.map((c, i) => ({ type: 'url_citation', start_index: i, end_index: i + 1, url: c.url, title: c.title })) }] }] });
  }
  if (u.pathname === '/perplexity/v1/agent') {
    const a = aiAnswer('perplexity', String(q.input));
    return json(res, 200, { id: 'pplx_mock', object: 'response', status: 'completed', model: q.model || 'perplexity/fast', output: [{ type: 'search_results', results: a.cites.map((c, i) => ({ id: i + 1, url: c.url, title: c.title, snippet: '' })) }, { type: 'message', content: [{ type: 'output_text', text: a.text, annotations: [] }] }] });
  }
  const gm = u.pathname.match(/^\/gemini\/v1beta\/models\/([^:]+):generateContent$/);
  if (gm) {
    const a = aiAnswer('gemini', String(q.contents?.[0]?.parts?.[0]?.text));
    return json(res, 200, { candidates: [{ content: { parts: [{ text: a.text }], role: 'model' }, groundingMetadata: { webSearchQueries: ['mock query'], groundingChunks: a.cites.map((c) => ({ web: { uri: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${hash(c.url)}`, title: new URL(c.url).hostname.replace(/^www\./, '') } })) } }] });
  }
  return json(res, 404, { error: { message: `mock: unknown AI endpoint ${u.pathname}` } });
}

// ── DataForSEO SERP API (Google Organic Live Advanced) ──────────────────────────
function dataforseo(req, res, u, body) {
  const auth = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
  if (auth.startsWith('bad-key')) return json(res, 401, { status_code: 40100, status_message: 'You are not authorized to access this resource (mock).' });
  const task = (JSON.parse(body || '[]') || [])[0] || {};
  const kw = String(task.keyword || '');
  const h = hash(kw);
  const items = [];
  if (h % 3 !== 0) {
    const refs = [
      { type: 'ai_overview_reference', source: 'Example Reviews', domain: 'example-reviews.com', url: `https://example-reviews.com/${encodeURIComponent(kw)}`, title: `Best ${kw}`, text: null },
      ...(h % 2 === 0 ? [{ type: 'ai_overview_reference', source: brandOf(SITE), domain: `www.${SITE}`, url: `https://www.${SITE}/collections/all`, title: `${kw} | ${brandOf(SITE)}`, text: null }] : []),
      ...(h % 5 === 1 ? [{ type: 'ai_overview_reference', source: 'Contoso', domain: 'contoso.com', url: 'https://contoso.com/shop', title: 'Contoso', text: null }] : []),
    ];
    items.push({ type: 'ai_overview', rank_group: 1, rank_absolute: 1, asynchronous_ai_overview: false, markdown: `DUMMY AI Overview for ${kw}`, items: [{ type: 'ai_overview_element', title: null, text: `DUMMY AI Overview for ${kw}`, references: refs.slice(0, 1) }], references: refs });
  }
  items.push({ type: 'organic', rank_group: 1, domain: 'example-reviews.com', url: 'https://example-reviews.com/x' });
  items.push({ type: 'organic', rank_group: 2 + (h % 6), domain: `www.${SITE}`, url: `https://www.${SITE}/collections/all` });
  return json(res, 200, { version: '0.1.mock', status_code: 20000, status_message: 'Ok.', tasks_count: 1, tasks_error: 0, tasks: [{ status_code: 20000, status_message: 'Ok.', data: task, result: [{ keyword: kw, items }] }] });
}

// ── Otterly.AI public API ───────────────────────────────────────────────────────
function otterly(req, res, u) {
  if ((req.headers.authorization || '') === 'Bearer bad-key') return json(res, 401, { error: { message: 'Invalid API key (mock)' } });
  const p = u.pathname.replace('/otterly/v1', '');
  const brand = brandOf(SITE).replace(/^./, (c) => c.toUpperCase());
  if (p === '/reports/brand') return json(res, 200, { items: SITE ? [{ id: 'rep_mock_1', name: `${brand} (dummy report)`, brand: { brand, brandDomain: SITE } }] : [] });
  if (p === '/reports/brand/rep_mock_1/stats') {
    return json(res, 200, {
      id: 'rep_mock_1', status: 'ready', totalPrompts: 25, brand: { brand, brandDomain: SITE },
      summary: { averageRank: 2.1, averagePosition: 2.4, totalMentions: 61, totalSources: 140, shareOfVoice: 31.5, brandCoverage: 48, domainCoverage: 22 },
      competitorBrandsAnalysis: { brandMentions: [
        { brand, domain: SITE, isMainBrand: true, mentions: 61, shareOfVoice: 31.5, brandCoverage: 48, domainCitations: 19 },
        { brand: 'Northwind Shoes', domain: 'northwind.example', isMainBrand: false, mentions: 44, shareOfVoice: 22.7, brandCoverage: 36, domainCitations: 9 },
        { brand: 'Contoso', domain: 'contoso.com', isMainBrand: false, mentions: 38, shareOfVoice: 19.6, brandCoverage: 30, domainCitations: 12 },
      ] },
    });
  }
  if (p === '/reports/brand/rep_mock_1/citations') return json(res, 200, { items: [{ url: `https://www.${SITE}/`, domain: SITE, title: brand, citations: 14, isMyBrandDomain: true, domainCategory: 'Brand' }, { url: 'https://www.reddit.com/r/shoes/comments/dummy', domain: 'reddit.com', title: 'Reddit (dummy)', citations: 11, isMyBrandDomain: false, domainCategory: 'Community/Forum' }, { url: 'https://contoso.com/shop', domain: 'contoso.com', title: 'Contoso', citations: 6, isMyBrandDomain: false, domainCategory: 'Competitor' }], paging: { limit: 25, offset: 0, hasMore: false } });
  return json(res, 404, { error: { message: `mock: unknown Otterly endpoint ${p}` } });
}

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      const service = u.pathname.split('/')[1];
      console.log(`${new Date().toISOString().slice(11, 19)} ${req.method} ${u.pathname}${u.searchParams.get('type') ? ` type=${u.searchParams.get('type')}` : ''}`);
      try {
        if (service === 'ahrefs') return ahrefs(req, res, u);
        if (service === 'semrush' || service === 'semrush-www') return semrush(req, res, u);
        if (service === 'google') return google(req, res, u, body);
        if (service === 'openai' || service === 'perplexity' || service === 'gemini') return aiEngines(req, res, u, body);
        if (service === 'dataforseo') return dataforseo(req, res, u, body);
        if (service === 'otterly') return otterly(req, res, u);
        json(res, 404, { error: 'mock: unknown service' });
      } catch (e) {
        json(res, 500, { error: { message: `mock error: ${e.message}` } });
      }
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`Mock SEO / AI APIs on http://localhost:${PORT} (DUMMY data)`);
    console.log(SITE ? `Google (Search Console, GA4, Merchant Center) and Otterly access: ${SITE}` : 'Google and Otterly access: none (pass a store domain to grant it)');
    console.log(`Service account key for GOOGLE_SERVICE_ACCOUNT_FILE: ${path.relative(process.cwd(), keyFile)}`);
  });
