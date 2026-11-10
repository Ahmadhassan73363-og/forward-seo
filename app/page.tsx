'use client';

import React, { useState, useEffect, useRef } from 'react';
import { buildReport } from '@/lib/audit/report';
import {
  Search,
  Zap,
  Globe,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Code2,
  Copy,
  Download,
  Printer,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  Layers,
  Sparkles,
  Activity,
  Eye,
  Image,
  Package,
  Clock,
  Link2,
  XCircle,
  AlertCircle,
  FileText,
  Cpu,
  ExternalLink,
  MapPin,
  HelpCircle,
  FileCode,
  Smartphone,
  Monitor,
  Gauge,
  Key,
} from 'lucide-react';

// ─── Type Definitions ─────────────────────────────────────────────────────────

interface DimensionDetail {
  score: number;
  weight: number;
  weighted_score: number;
  metrics?: Record<string, any>;
  deductions?: string[];
}

interface PageAuditResult {
  url: string;
  page_type: string;
  status_code: number;
  response_time_ms: number;
  content_size_bytes: number;
  title: string;
  title_length: number;
  meta_description: string;
  meta_description_length: number;
  h1: string;
  h2_count: number;
  h3_count: number;
  canonical_url: string;
  canonical_status: string;
  is_canonical_match: boolean;
  word_count: number;
  has_faq_content: boolean;
  has_definition_paragraph: boolean;
  json_ld_entities: any[];
  schema_score: number;
  schema_types: string[];
  schema_findings: string[];
  script_count: number;
  render_blocking_scripts: number;
  detected_apps: string[];
  total_images: number;
  images_missing_alt: number;
  dual_urls_found: string[];
  links_count: number;
  final_url?: string;
  fetch_error?: string | null;
  blocked?: boolean;
  rate_limited?: boolean;
  noindex?: boolean;
  h1_count?: number;
}

export interface PSIMetrics {
  strategy: 'mobile' | 'desktop';
  source: 'google_psi';
  tested_url?: string;
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  coreWebVitalsPassed: boolean | null;
  cwvBasis?: 'field' | 'lab';
  lab: {
    lcpMs: number | null;
    lcpDisplay: string;
    tbtMs: number | null;
    tbtDisplay: string;
    cls: number | null;
    clsDisplay: string;
    fcpMs: number | null;
    fcpDisplay: string;
    speedIndexMs: number | null;
    speedIndexDisplay: string;
  };
  field?: {
    overallCategory: 'FAST' | 'AVERAGE' | 'SLOW' | 'NO_DATA';
    lcpMs: number | null;
    inpMs: number | null;
    cls: number | null;
    fcpMs: number | null;
    ttfbMs: number | null;
  };
  opportunities: Array<{
    title: string;
    savingsMs?: number;
    savingsBytes?: number;
    description?: string;
  }>;
}

export interface AffectedUrlItem {
  url: string;
  issue: string;
  statusCode?: number;
  preview?: string;
}

export interface DeficitDetail {
  id: string;
  title: string;
  dimension: string;
  impact: string;
  location: string;
  action_guide: string;
  code_snippet?: string | null;
  file_path?: string | null;
  doc_link?: string | null;
  admin_link?: string | null;
  affected_urls?: AffectedUrlItem[];
}

interface ScriptsSummary {
  average_scripts_per_page: number;
  total_render_blocking_scripts: number;
  all_detected_apps: string[];
}

interface Competitor {
  name: string;
  global_score: number;
  grade: string;
  product_schema_health: number;
  collection_breadcrumbs: boolean;
  faceted_filter_governance: string;
  mobile_lcp_seconds: number;
  aeo_citation_density: string;
}

interface BenchmarkReport {
  store_url: string;
  global_score: number;
  grade: string;
  executive_assessment: string;
  dimension_scores: {
    technical: number | null;
    schema_entity: number | null;
    aeo_geo: number | null;
    architecture: number | null;
    core_web_vitals: number | null;
    intent_conversion: number | null;
  };
  warnings?: string[];
  crawl?: {
    discovered: { products: number; collections: number; pages: number; blogs: number; articles: number };
    sitemap_found: boolean;
    max_pages: number;
    attempted: number;
    succeeded: number;
    failed: number;
    blocked: number;
    skipped_for_time: number;
    duration_ms: number;
  };
  dimension_details?: Record<string, DimensionDetail>;
  critical_deficits?: string[];
  deficit_details?: DeficitDetail[];
  liquid_recommendations?: string[];
  competitors?: Competitor[];
  actionable_roadmap?: Record<string, string[]>;
  pages_audited?: PageAuditResult[];
  scripts_summary?: ScriptsSummary;
  pagespeed?: {
    mobile: PSIMetrics | null;
    desktop: PSIMetrics | null;
    errors?: { mobile: string | null; desktop: string | null };
  };
}

/** Rates a possibly-missing metric. Missing values are never shown as "Good". */
function rateMetric(v: number | null | undefined, good: number, mid: number | null) {
  if (v === null || v === undefined) return { label: 'No data', cls: 'bg-slate-500/10 text-slate-400' };
  if (v <= good) return { label: 'Good', cls: 'bg-emerald-500/10 text-emerald-300' };
  if (mid === null || v <= mid) return { label: 'Needs Work', cls: 'bg-amber-500/10 text-amber-300' };
  return { label: 'Poor', cls: 'bg-rose-500/10 text-rose-300' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const APP_CATEGORIES: Record<string, string> = {
  'Google Analytics (GA4)': 'Analytics',
  'Google Tag Manager': 'Analytics',
  'Meta Pixel (Facebook)': 'Analytics',
  'TikTok Pixel': 'Analytics',
  'Pinterest Tag': 'Analytics',
  'Microsoft Clarity': 'Analytics',
  'Hotjar': 'Analytics',
  'Triple Whale': 'Analytics',
  'Elevar': 'Analytics',
  'Klaviyo': 'Email',
  'Omnisend': 'Email',
  'Attentive': 'Email',
  'Postscript': 'Email',
  'Mailchimp': 'Email',
  'Judge.me': 'Reviews',
  'Yotpo Reviews': 'Reviews',
  'Loox Reviews': 'Reviews',
  'Okendo': 'Reviews',
  'Stamped.io': 'Reviews',
  'Junip': 'Reviews',
  'Gorgias': 'Support',
  'Zendesk': 'Support',
  'Tidio': 'Support',
  'Recharge': 'Subscriptions',
  'Bold Subscriptions': 'Subscriptions',
  'Appstle': 'Subscriptions',
  'Skio': 'Subscriptions',
  'Smile.io': 'Loyalty',
  'LoyaltyLion': 'Loyalty',
  'Algolia': 'Search',
  'Searchanise': 'Search',
  'Boost Commerce': 'Search',
  'Shopify Core': 'Platform',
};

const CATEGORY_COLORS: Record<string, string> = {
  Analytics: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  Email: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  Reviews: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Support: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  Subscriptions: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  Loyalty: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  Search: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  Platform: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

function getGradeColor(grade: string) {
  if (grade === 'Incomplete') return 'text-slate-300 border-slate-500/30 bg-slate-500/10';
  if (grade.includes('A')) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (grade.includes('B')) return 'text-sky-400 border-sky-500/30 bg-sky-500/10';
  if (grade.includes('C')) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
}

function getStatusColor(code: number) {
  if (code === 200) return 'text-emerald-400 bg-emerald-500/10';
  if (code >= 300 && code < 400) return 'text-amber-400 bg-amber-500/10';
  if (code >= 400) return 'text-rose-400 bg-rose-500/10';
  return 'text-slate-400 bg-slate-500/10';
}

function getLatencyColor(ms: number) {
  if (ms < 500) return 'text-emerald-400';
  if (ms < 1500) return 'text-amber-400';
  return 'text-rose-400';
}

function getSchemaScoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-rose-400';
}

function getScoreBadgeColor(score: number) {
  if (score >= 90) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (score >= 50) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Rows rendered per step in large tables/lists (a full crawl can return thousands). */
const PAGE_TABLE_STEP = 100;
const AFFECTED_URLS_SHOWN = 200;

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Page() {
  const [storeUrl, setStoreUrl] = useState('');
  const [psiApiKey, setPsiApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [pageTableFilter, setPageTableFilter] = useState('all');
  const [psiStrategy, setPsiStrategy] = useState<'mobile' | 'desktop'>('mobile');
  const [expandedDeficitUrls, setExpandedDeficitUrls] = useState<Record<string, boolean>>({});
  const [copiedUrlsId, setCopiedUrlsId] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const startTimeRef = useRef<number>(0);
  const finishNowRef = useRef(false);
  const [maxPages, setMaxPages] = useState<number | 'all'>(40);
  const [finishing, setFinishing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; waitUntil: number; detail: string; etaMs?: number }>({
    done: 0,
    total: 0,
    waitUntil: 0,
    detail: '',
  });
  const [pageTableLimit, setPageTableLimit] = useState(PAGE_TABLE_STEP);
  const [nowTick, setNowTick] = useState(Date.now());

  const loadingSteps = [
    'Loading homepage & reading sitemaps...',
    'Crawling pages at a pace Shopify allows...',
    'Waiting for Google PageSpeed Insights...',
    'Scoring and building the report...',
  ];

  useEffect(() => {
    let elapsed: NodeJS.Timeout;
    if (loading) {
      elapsed = setInterval(() => {
        setLoadingElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
        setNowTick(Date.now());
      }, 1000);
    }
    return () => clearInterval(elapsed);
  }, [loading]);

  const postJson = async (path: string, payload: any) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({ status: 'error', ok: false, message: `HTTP ${res.status}`, error: `HTTP ${res.status}` }));
    return { res, data };
  };

  /** Sleeps, but wakes early if the user clicks "Build report now". */
  const waitInterruptible = async (ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end && !finishNowRef.current) await new Promise((r) => setTimeout(r, 500));
  };

  // Give up if Shopify keeps us paused this long without a single page getting through.
  const MAX_STALLED_WAIT_MS = 10 * 60_000;
  // Targets sent per /crawl call; the browser holds the full queue (can be thousands of URLs).
  const CRAWL_CHUNK = 60;
  // Keep full JSON-LD only for this many pages so huge crawls don't exhaust browser memory.
  const KEEP_JSONLD_PAGES = 200;

  const handleAudit = async (url: string) => {
    const target = url.trim();
    if (!target) return;

    setLoading(true);
    setFinishing(false);
    finishNowRef.current = false;
    setLoadingStep(0);
    setLoadingElapsed(0);
    setProgress({ done: 0, total: 0, waitUntil: 0, detail: '' });
    setReport(null);
    setError(null);
    startTimeRef.current = Date.now();

    try {
      // 1. Discover
      const disc = await postJson('/api/audit/discover', { url: target, maxPages });
      if (!disc.res.ok || disc.data.status !== 'ok') {
        setError(disc.data.message || 'Could not load the store.');
        return;
      }
      const ctx = disc.data.ctx;

      // 2. PageSpeed runs in parallel with the crawl (each call is its own serverless request)
      const psiCall = (strategy: 'mobile' | 'desktop') =>
        postJson('/api/audit/psi', { url: ctx.baseUrl + '/', strategy, psiApiKey: psiApiKey.trim() })
          .then((r) => r.data)
          .catch((e: any) => ({ ok: false, error: `PSI request failed: ${e.message}` }));
      const psiPromise = Promise.all([psiCall('mobile'), psiCall('desktop')]);

      // 3. Crawl in batches, honouring Shopify's Retry-After between batches
      setLoadingStep(1);
      let queue: Array<{ url: string; type: string }> = ctx.targets;
      const pages: any[] = [];
      let limiter: any = undefined;
      let stalledWait = 0;
      let skippedReason: string | undefined;
      const crawlStart = Date.now();
      setProgress({ done: 0, total: queue.length, waitUntil: 0, detail: '', etaMs: 0 });

      while (queue.length > 0 && !finishNowRef.current) {
        const chunk = queue.slice(0, CRAWL_CHUNK);
        const cr = await postJson('/api/audit/crawl', { host: ctx.host, targets: chunk, limiter });
        if (!cr.res.ok || cr.data.status !== 'ok') {
          skippedReason = `crawl request failed (${cr.data.message || cr.res.status})`;
          break;
        }
        for (const r of cr.data.results) {
          if (pages.length >= KEEP_JSONLD_PAGES) r.json_ld_entities = [];
          pages.push(r);
        }
        // Unfinished items from this chunk go back to the front of the queue.
        queue = [...cr.data.remaining, ...queue.slice(CRAWL_CHUNK)];
        limiter = cr.data.limiter;
        if (cr.data.results.length > 0) stalledWait = 0;
        const elapsed = Date.now() - crawlStart;
        const etaMs = pages.length > 0 ? Math.round((elapsed / pages.length) * queue.length) : 0;
        setProgress((p) => ({ ...p, done: pages.length, waitUntil: 0, detail: '', etaMs }));

        if (cr.data.waitMs > 0 && queue.length > 0) {
          if (stalledWait + cr.data.waitMs > MAX_STALLED_WAIT_MS) {
            skippedReason = `Shopify was still rate-limiting after ${Math.round(stalledWait / 1000)}s of waiting with no progress`;
            break;
          }
          stalledWait += cr.data.waitMs;
          setProgress((p) => ({
            ...p,
            waitUntil: Date.now() + cr.data.waitMs,
            detail: 'Shopify asked us to pause (HTTP 429 with Retry-After). Waiting, then continuing where we left off.',
          }));
          await waitInterruptible(cr.data.waitMs + 500);
          setProgress((p) => ({ ...p, waitUntil: 0, detail: '' }));
        }
      }
      if (queue.length > 0 && !skippedReason) skippedReason = finishNowRef.current ? 'stopped early by user' : 'crawl stopped';

      // 4. PageSpeed + report
      setLoadingStep(2);
      const [mobile, desktop] = await psiPromise;
      setLoadingStep(3);
      // Scored in the browser: thousands of page results would exceed serverless body limits.
      const built = buildReport({
        ctx,
        pages,
        psiMobileRes: mobile,
        psiDesktopRes: desktop,
        skippedCount: queue.length,
        skippedReason,
      });
      setPageTableLimit(PAGE_TABLE_STEP);
      setReport(built as unknown as BenchmarkReport);
    } catch (e: any) {
      setError(`Network error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const copyUrlsList = (id: string, urls: AffectedUrlItem[]) => {
    const text = urls.map((u) => `${u.url} (${u.issue})`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedUrlsId(id);
    setTimeout(() => setCopiedUrlsId(null), 2000);
  };

  const copySnippetCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const toggleDeficitUrls = (id: string) => {
    setExpandedDeficitUrls((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `forward-shopify-audit-${safeHostname(report.store_url)}.json`;
    a.click();
  };

  const downloadMarkdown = () => {
    if (!report) return;
    let md = `# Forward Shopify Organic Health Audit\n\n`;
    md += `**Store:** ${report.store_url}\n`;
    md += `**SOHGI Score:** ${report.global_score} / 100 (${report.grade})\n`;
    md += `**Assessment:** ${report.executive_assessment}\n\n`;
    md += `## Dimension Scores\n`;
    Object.entries(report.dimension_scores).forEach(([k, v]) => {
      md += `- **${k}**: ${v === null ? 'Not scored' : `${v}/100`}\n`;
    });
    if (report.warnings?.length) {
      md += `\n## Data Quality Notes\n`;
      report.warnings.forEach((w) => (md += `- ${w}\n`));
    }
    md += `\n## Critical Deficits\n`;
    report.critical_deficits?.forEach((d) => {
      md += `- ⚠️ ${d}\n`;
    });
    md += `\n## Liquid Fixes\n`;
    report.liquid_recommendations?.forEach((r) => {
      md += `- [ ] ${r}\n`;
    });
    if (report.pages_audited?.length) {
      md += `\n## Pages Audited (${report.pages_audited.length} pages)\n\n`;
      md += `| URL | Type | Status | Response | Schema | Apps |\n|---|---|---|---|---|---|\n`;
      report.pages_audited.forEach((p) => {
        md += `| ${p.url} | ${p.page_type} | ${p.status_code} | ${p.response_time_ms}ms | ${p.schema_score.toFixed(0)}% | ${p.detected_apps.join(', ')} |\n`;
      });
    }
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `forward-shopify-audit-${safeHostname(report.store_url)}.md`;
    a.click();
  };

  // Derived stats from pages_audited
  const pages = report?.pages_audited ?? [];
  const totalImages = pages.reduce((s, p) => s + (p.total_images || 0), 0);
  const totalMissingAlt = pages.reduce((s, p) => s + (p.images_missing_alt || 0), 0);
  const canonicalIssues = pages.filter((p) => !p.is_canonical_match);
  const avgResponseMs = pages.length
    ? Math.round(pages.reduce((s, p) => s + p.response_time_ms, 0) / pages.length)
    : 0;
  const minMs = pages.length ? Math.min(...pages.map((p) => p.response_time_ms)) : 0;
  const maxMs = pages.length ? Math.max(...pages.map((p) => p.response_time_ms)) : 0;

  const filteredPages =
    pageTableFilter === 'all'
      ? pages
      : pages.filter((p) => p.page_type === pageTableFilter);
  const pageTypes = ['all', ...Array.from(new Set(pages.map((p) => p.page_type)))];

  const score = report?.global_score ?? 0;
  const circumference = 2 * Math.PI * 46;
  const strokeDashoffset = circumference - (circumference * score) / 100;

  // Current active PSI metrics
  const activePsi = report?.pagespeed ? report.pagespeed[psiStrategy] : null;
  const activePsiError = report?.pagespeed?.errors?.[psiStrategy] ?? null;
  const mobileLcpRating = rateMetric(report?.pagespeed?.mobile?.lab.lcpMs, 2500, 4000);

  return (
    <div className="min-h-screen text-slate-100 flex flex-col bg-slate-950 font-sans antialiased">
      {/* ── Header ── */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Zap className="w-5 h-5 text-emerald-400 fill-emerald-400/20" />
              </div>
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-emerald-400 bg-clip-text text-transparent">
                FORWARD SHOPIFY
              </span>
              <span className="hidden sm:inline-block text-[11px] font-semibold text-slate-400 ml-2 px-2 py-0.5 rounded-full border border-slate-800 bg-slate-900/80 uppercase tracking-wider">
                Enterprise SEO &amp; Core Web Vitals Suite v3.0
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Crawl &amp; PSI Engine Ready
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 w-full space-y-10">
        {/* ── Hero URL Input ── */}
        <div className="text-center max-w-3xl mx-auto space-y-5">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Audit Any Shopify Store&rsquo;s{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Organic Growth &amp; PageSpeed
            </span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Extracts real store pages from Shopify XML sitemaps and public catalog APIs. Audits Google Merchant Center Schema,
            Core Web Vitals (LCP, TBT, CLS), third-party app bloat, and delivers verifiable links for every deficit found.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (storeUrl.trim()) handleAudit(storeUrl);
            }}
          >
            <div className="relative flex items-center bg-slate-900/90 border border-slate-700/80 rounded-2xl p-2 shadow-2xl shadow-emerald-950/30 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-400/20 transition-all">
              <div className="pl-3 pr-2 text-slate-400">
                <Globe className="w-5 h-5 text-emerald-400" />
              </div>
              <input
                type="text"
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="https://your-store.myshopify.com  or  https://allbirds.com"
                className="w-full bg-transparent border-none text-white text-sm sm:text-base placeholder-slate-500 focus:outline-none px-2"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !storeUrl.trim()}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-5 sm:px-7 py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Crawling...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Run Live Audit</span>
                  </>
                )}
              </button>
            </div>

            {/* Optional PSI API Key toggle + page limit */}
            <div className="pt-2 text-left">
              <div className="float-right text-xs text-slate-400 flex items-center gap-1.5">
                <label htmlFor="max-pages">Pages to crawl</label>
                <select
                  id="max-pages"
                  value={maxPages}
                  onChange={(e) => setMaxPages(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  disabled={loading}
                  className="bg-slate-900 border border-slate-700 rounded-md px-1.5 py-0.5 text-slate-200"
                >
                  {[40, 100, 250, 500, 1000].map((n) => (
                    <option key={n} value={n}>
                      {n} (sample)
                    </option>
                  ))}
                  <option value="all">All pages</option>
                </select>
              </div>
              {maxPages === 'all' && (
                <p className="clear-both text-[11px] text-amber-300/80 text-right pt-1">
                  Crawls every URL in the sitemap. Shopify allows about one catalog page per second, so large stores can take an hour or more. Keep this tab open.
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                className="text-xs text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1 transition-colors"
              >
                <Key className="w-3.5 h-3.5" />
                <span>{showApiKeyInput ? 'Hide Google PSI API Key' : 'Add Google PSI API Key (Optional)'}</span>
                <span className="text-[10px] text-slate-500">
                  {showApiKeyInput ? '▲' : '▼'}
                </span>
              </button>
              {showApiKeyInput && (
                <div className="mt-2 p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs space-y-1.5">
                  <label className="text-slate-300 font-semibold block">Google Cloud PageSpeed API Key</label>
                  <input
                    type="password"
                    value={psiApiKey}
                    onChange={(e) => setPsiApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Recommended. Without a key, Google&rsquo;s shared quota often returns HTTP 429 and PageSpeed results will be marked unavailable (they are never estimated). You can also set PSI_API_KEY on the server.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs">
              <span className="text-slate-500 font-medium">Try a live store:</span>
              {['https://allbirds.com', 'https://gymshark.com', 'https://tentree.com'].map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => {
                    setStoreUrl(url);
                    handleAudit(url);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:border-emerald-500/50 text-slate-300 transition-colors"
                >
                  {url.replace('https://', '')}
                </button>
              ))}
            </div>
          </form>
        </div>

        {/* ── Loading State ── */}
        {loading && (
          <div className="border border-slate-800 bg-slate-900/80 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-2xl relative overflow-hidden backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />
            <div className="relative z-10 space-y-6">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 border-4 border-slate-800 rounded-full" />
                <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <div className="absolute inset-2 flex items-center justify-center font-mono text-sm font-bold text-emerald-400">
                  {loadingElapsed}s
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">Live Store Audit in Progress</h3>
                <p className="text-sm font-medium text-emerald-400 animate-pulse">
                  {loadingSteps[loadingStep]}
                </p>
                {progress.total > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-xs text-slate-300 font-mono">
                      {progress.done} / {progress.total} pages crawled
                      {progress.etaMs ? ` · ~${formatDuration(progress.etaMs)} left` : ''}
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden max-w-xs mx-auto">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-500"
                        style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {progress.waitUntil > 0 && (
                  <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 max-w-md mx-auto">
                    {progress.detail} Resuming in{' '}
                    <span className="font-mono font-bold">{Math.max(0, Math.ceil((progress.waitUntil - nowTick) / 1000))}s</span>.
                  </div>
                )}
                {loadingStep === 1 && (
                  <button
                    type="button"
                    disabled={finishing}
                    onClick={() => {
                      finishNowRef.current = true;
                      setFinishing(true);
                    }}
                    className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 hover:border-emerald-500/50 text-slate-300 disabled:opacity-50"
                  >
                    {finishing ? 'Finishing current batch…' : 'Build report now with pages crawled so far'}
                  </button>
                )}
              </div>
              <div className="flex justify-center gap-1.5">
                {loadingSteps.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i <= loadingStep ? 'w-6 bg-emerald-400' : 'w-2 bg-slate-800'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Error State ── */}
        {error && (
          <div className="border border-rose-500/30 bg-rose-500/10 rounded-2xl p-6 text-center max-w-2xl mx-auto space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <h3 className="text-base font-bold text-white">Audit Execution Error</h3>
            <p className="text-xs text-rose-300 leading-relaxed font-mono">{error}</p>
          </div>
        )}

        {/* ── Audit Report Results ── */}
        {report && (
          <div className="space-y-10 animate-fade-in">
            {/* ── SECTION 1: Overview Score & KPIs ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Score Gauge */}
              <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    SOHGI Composite Score
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${getGradeColor(
                      report.grade
                    )}`}
                  >
                    Grade {report.grade}
                  </span>
                </div>

                <div className="flex items-center justify-center py-4">
                  <div className="relative w-44 h-44 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="46"
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth="8"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="46"
                        fill="none"
                        stroke={
                          score >= 85
                            ? '#10b981'
                            : score >= 70
                            ? '#38bdf8'
                            : score >= 55
                            ? '#f59e0b'
                            : '#f43f5e'
                        }
                        strokeWidth="8"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-black text-white">{score}</span>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        / 100
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <div className="text-xs font-mono text-emerald-400 truncate">
                    Target: {report.store_url}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {report.executive_assessment}
                  </p>
                </div>
              </div>

              {/* Quick KPIs */}
              <div className="lg:col-span-7 grid grid-cols-2 gap-4">
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-400">Pages Audited</span>
                  <div className="my-2">
                    <span className="text-3xl font-black text-emerald-400">
                      {report.crawl ? report.crawl.succeeded : pages.length}
                    </span>
                    {report.crawl && report.crawl.failed > 0 && (
                      <span className="text-sm font-bold text-rose-400 ml-2">+{report.crawl.failed} failed</span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {report.crawl
                      ? `of ${
                          report.crawl.discovered.products +
                          report.crawl.discovered.collections +
                          report.crawl.discovered.pages +
                          report.crawl.discovered.articles +
                          report.crawl.discovered.blogs +
                          1
                        } discovered URLs (${report.crawl.discovered.products} products, ${report.crawl.discovered.collections} collections)`
                      : 'Real sitemap & catalog URLs'}
                  </span>
                </div>
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-400">Product Schema Coverage</span>
                  <div className="my-2">
                    <span className="text-3xl font-black text-amber-400">
                      {report.dimension_details?.schema_entity?.metrics?.product_schema_ratio ?? '—'}
                      {report.dimension_details?.schema_entity?.metrics?.product_schema_ratio != null && '%'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Complete schema · {report.dimension_details?.schema_entity?.metrics?.product_required_ok_ratio ?? '—'}% meet Google&rsquo;s required fields
                  </span>
                </div>
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-400">Mobile Speed &amp; LCP</span>
                  <div className="my-2">
                    <span className={`text-3xl font-black ${mobileLcpRating.label === 'Good' ? 'text-emerald-400' : mobileLcpRating.label === 'No data' ? 'text-slate-500' : 'text-amber-400'}`}>
                      {report.pagespeed?.mobile?.lab.lcpMs != null ? report.pagespeed.mobile.lab.lcpDisplay : 'N/A'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {report.pagespeed?.mobile
                      ? `CWV: ${
                          report.pagespeed.mobile.coreWebVitalsPassed === null
                            ? 'no data'
                            : report.pagespeed.mobile.coreWebVitalsPassed
                            ? '✓ Passed'
                            : '⚠️ Needs Work'
                        } (${report.pagespeed.mobile.cwvBasis === 'field' ? 'real-user data' : 'lab data'})`
                      : 'PageSpeed unavailable this run'}
                  </span>
                </div>
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-400">App Script Bloat</span>
                  <div className="my-2">
                    <span className="text-3xl font-black text-amber-400">
                      {report.scripts_summary?.average_scripts_per_page ?? report.dimension_details?.core_web_vitals?.metrics?.third_party_scripts ?? '—'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {report.scripts_summary?.total_render_blocking_scripts ?? 0} render-blocking tags
                  </span>
                </div>
              </div>
            </div>

            {/* ── Data quality warnings ── */}
            {report.warnings && report.warnings.length > 0 && (
              <div className="border border-amber-500/30 bg-amber-500/5 rounded-2xl p-5 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 text-sm font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  Data quality notes ({report.warnings.length})
                </div>
                <ul className="space-y-1">
                  {report.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-200/80 flex items-start gap-1.5">
                      <span className="text-amber-400 mt-0.5">•</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── SECTION 2: 6 Dimensions ── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  6 Organic Growth Dimensions
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  SOHGI = 0.20·Tech + 0.20·Schema + 0.20·AEO + 0.15·Arch + 0.15·CWV + 0.10·Intent
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[
                  { key: 'technical', label: 'Technical Health & Crawl', weight: '20%', color: 'bg-cyan-400', desc: 'Sitemap integrity, HTTP status ratios, faceted filter parameter governance.' },
                  { key: 'schema_entity', label: 'Structured Data & Entities', weight: '20%', color: 'bg-emerald-400', desc: 'Product/Offer completeness, shipping, return policy, app schema conflicts.' },
                  { key: 'aeo_geo', label: 'AEO & GEO Readiness', weight: '20%', color: 'bg-indigo-400', desc: 'Definition answer blocks, FAQPage accordions, entity citation grounding.' },
                  { key: 'architecture', label: 'Taxonomy & Internal Linking', weight: '15%', color: 'bg-amber-400', desc: 'Dual-URL collection link traps, click depth, breadcrumb trails.' },
                  { key: 'core_web_vitals', label: 'Speed & Core Web Vitals', weight: '15%', color: 'bg-rose-400', desc: 'Mobile LCP, Cumulative Layout Shift, Total Blocking Time, script bloat.' },
                  { key: 'intent_conversion', label: 'Intent & Conversion Alignment', weight: '10%', color: 'bg-teal-400', desc: 'Above-fold product visibility, trust proofs, commercial query alignment.' },
                ].map(({ key, label, weight, color, desc }) => {
                  const rawScore = report.dimension_scores[key as keyof typeof report.dimension_scores];
                  const notScored = rawScore === null || rawScore === undefined;
                  const dimScore = rawScore ?? 0;
                  const detail = report.dimension_details?.[key];
                  return (
                    <div key={key} className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 ${notScored ? 'opacity-70' : ''}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">{weight}</span>
                        {notScored ? (
                          <span className="text-sm font-bold text-slate-500">Not scored</span>
                        ) : (
                          <span className={`text-lg font-black ${dimScore >= 80 ? 'text-emerald-400' : dimScore >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{dimScore}/100</span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-200 text-sm">{label}</h4>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${notScored ? 0 : dimScore}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
                      {detail?.deductions && detail.deductions.length > 0 && (
                        <ul className="space-y-1 pt-1 border-t border-slate-800">
                          {detail.deductions.map((d, i) => (
                            <li key={i} className="text-[11px] text-rose-300/80 flex items-start gap-1">
                              <span className="text-rose-400 mt-0.5">•</span>
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── SECTION 2.5: Real Google PageSpeed Insights & Core Web Vitals Engine ── */}
            {report.pagespeed && (
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <Gauge className="w-6 h-6 text-emerald-400" />
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        Google PageSpeed Insights &amp; Core Web Vitals
                        {activePsi ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Live Google PSI result
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Unavailable
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {activePsi
                          ? `Tested ${activePsi.tested_url || 'homepage'} · CWV verdict from ${activePsi.cwvBasis === 'field' ? 'real-user (CrUX) 75th percentile data' : 'lab data (no CrUX field data for this site)'}.`
                          : 'Homepage only. Scores are never estimated when Google does not return a result.'}
                      </p>
                    </div>
                  </div>

                  {/* Mobile / Desktop switcher tabs */}
                  <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPsiStrategy('mobile')}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        psiStrategy === 'mobile'
                          ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Mobile (SEO Factor)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPsiStrategy('desktop')}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        psiStrategy === 'desktop'
                          ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>Desktop</span>
                    </button>
                  </div>
                </div>

                {!activePsi ? (
                  <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 text-xs text-rose-200 space-y-1">
                    <div className="font-bold text-rose-300">No {psiStrategy} PageSpeed data for this run</div>
                    <div className="font-mono">{activePsiError || 'Unknown error'}</div>
                    <div className="text-rose-200/70">
                      The Core Web Vitals dimension was excluded from the overall score. Add a Google PSI API key and re-run to get real data.
                    </div>
                  </div>
                ) : (
                <>
                {/* 4 Category Gauges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Performance', score: activePsi.performanceScore },
                    { label: 'Accessibility', score: activePsi.accessibilityScore },
                    { label: 'Best Practices', score: activePsi.bestPracticesScore },
                    { label: 'SEO', score: activePsi.seoScore },
                  ].map(({ label, score: catScore }) => (
                    <div
                      key={label}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-center space-y-2"
                    >
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        {label}
                      </span>
                      <div className="text-3xl font-black">
                        <span className={catScore === null ? 'text-slate-500' : catScore >= 90 ? 'text-emerald-400' : catScore >= 50 ? 'text-amber-400' : 'text-rose-400'}>
                          {catScore ?? '—'}
                        </span>
                        <span className="text-xs text-slate-500">/100</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${catScore === null ? '' : catScore >= 90 ? 'bg-emerald-400' : catScore >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`}
                          style={{ width: `${catScore ?? 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Core Web Vitals Pass / Fail Banner */}
                <div
                  className={`p-4 rounded-xl border flex items-center justify-between flex-wrap gap-3 ${
                    activePsi.coreWebVitalsPassed
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {activePsi.coreWebVitalsPassed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                    )}
                    <div>
                      <h4 className="text-xs font-bold text-white">
                        {activePsi.coreWebVitalsPassed === null
                          ? 'Core Web Vitals Assessment: NOT ENOUGH DATA'
                          : activePsi.coreWebVitalsPassed
                          ? 'Core Web Vitals Assessment: PASSED'
                          : 'Core Web Vitals Assessment: FAILED / REQUIRES OPTIMIZATION'}
                      </h4>
                      <p className="text-[11px] opacity-80">
                        {activePsi.coreWebVitalsPassed
                          ? 'All primary user experience metrics (LCP, TBT/INP, CLS) meet Google’s top ranking thresholds.'
                          : 'Store experiences main-thread execution delays or slow Largest Contentful Paint impacting search rank.'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                      activePsi.coreWebVitalsPassed
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {activePsi.coreWebVitalsPassed ? 'Pass' : 'Needs Work'}
                  </span>
                </div>

                {/* Lab Metrics Scorecards (LCP, TBT, CLS, FCP, SI) */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Lighthouse Lab Diagnostics ({psiStrategy === 'mobile' ? 'Emulated Moto G Power, slow 4G' : 'Desktop'})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                    {[
                      { label: 'LCP', target: 'Target ≤ 2.5s', display: activePsi.lab.lcpDisplay, rating: rateMetric(activePsi.lab.lcpMs, 2500, 4000) },
                      { label: 'TBT (INP Proxy)', target: 'Target ≤ 200ms', display: activePsi.lab.tbtDisplay, rating: rateMetric(activePsi.lab.tbtMs, 200, 600) },
                      { label: 'CLS', target: 'Target ≤ 0.1', display: activePsi.lab.clsDisplay, rating: rateMetric(activePsi.lab.cls, 0.1, 0.25) },
                      { label: 'FCP', target: 'Target ≤ 1.8s', display: activePsi.lab.fcpDisplay, rating: rateMetric(activePsi.lab.fcpMs, 1800, 3000) },
                      { label: 'Speed Index', target: 'Target ≤ 3.4s', display: activePsi.lab.speedIndexDisplay, rating: rateMetric(activePsi.lab.speedIndexMs, 3400, 5800) },
                    ].map((m) => (
                      <div key={m.label} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="font-bold">{m.label}</span>
                          <span className="text-[10px] text-slate-500">{m.target}</span>
                        </div>
                        <div className="text-xl font-black text-white">{m.display}</div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${m.rating.cls}`}>{m.rating.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Opportunities */}
                {activePsi.opportunities && activePsi.opportunities.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Top Performance Opportunities &amp; Estimated Savings
                    </h4>
                    <div className="space-y-2">
                      {activePsi.opportunities.map((opp, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="text-slate-200 font-medium">{opp.title}</span>
                          {opp.savingsMs && (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px] font-bold whitespace-nowrap">
                              ~{opp.savingsMs} ms savings
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </>
                )}
              </div>
            )}

            {/* ── SECTION 3: Detected Apps Grid ── */}
            {(report.scripts_summary?.all_detected_apps?.length ?? 0) > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-violet-400" />
                  <h3 className="font-bold text-white text-base">
                    Detected Third-Party Apps &amp; Trackers ({report.scripts_summary!.all_detected_apps.length})
                  </h3>
                  <span className="ml-auto text-xs text-slate-400">
                    {report.scripts_summary!.total_render_blocking_scripts} render-blocking scripts detected across crawled pages
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {report.scripts_summary!.all_detected_apps.map((app) => {
                    const cat = APP_CATEGORIES[app] || 'Other';
                    const colorClass = CATEGORY_COLORS[cat] || CATEGORY_COLORS['Platform'];
                    return (
                      <span
                        key={app}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${colorClass}`}
                      >
                        <span>{app}</span>
                        <span className="text-[10px] opacity-60">({cat})</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── SECTION 4: Image Alt & Canonical Summary ── */}
            {pages.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Images */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Image className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-bold text-white text-base">Image Alt Attribute Coverage</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-950/60 rounded-xl px-4 py-3 border border-slate-800">
                      <div className="text-2xl font-black text-white">{totalImages}</div>
                      <div className="text-xs text-slate-400">Total Images</div>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl px-4 py-3 border border-slate-800">
                      <div className="text-2xl font-black text-emerald-400">
                        {totalImages > 0 ? Math.round(((totalImages - totalMissingAlt) / totalImages) * 100) : 0}%
                      </div>
                      <div className="text-xs text-slate-400">Alt Coverage Rate</div>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl px-4 py-3 border border-slate-800">
                      <div className="text-2xl font-black text-amber-400">
                        {totalImages > 0 ? Math.round(totalMissingAlt / pages.length) : 0}
                      </div>
                      <div className="text-xs text-slate-400">Avg Missing / Page</div>
                    </div>
                  </div>
                  {totalMissingAlt > 0 && (
                    <p className="text-xs text-amber-300/80 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                      ⚠️ {totalMissingAlt} images lack descriptive alt attributes — this suppresses Google Image search rankings and accessibility scores.
                    </p>
                  )}
                </div>

                {/* Canonical Issues */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-rose-400" />
                    <h3 className="font-bold text-white text-base">Canonical Issues ({canonicalIssues.length})</h3>
                  </div>
                  {canonicalIssues.length === 0 ? (
                    <div className="flex items-center gap-2 text-emerald-400 text-sm p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                      <CheckCircle2 className="w-4 h-4" />
                      All crawled pages have matching canonical URLs ✓
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {canonicalIssues.slice(0, AFFECTED_URLS_SHOWN).map((p, i) => (
                        <div key={i} className="bg-slate-950/60 border border-rose-500/20 rounded-xl p-3 space-y-1">
                          <div className="text-xs font-mono text-rose-300 truncate">{p.url}</div>
                          <div className="text-[11px] text-slate-400">
                            Canonical &rarr; <span className="text-slate-300 font-mono">{p.canonical_url || 'missing'}</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            {p.canonical_status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── SECTION 5: Per-Page Crawl Table ── */}
            {pages.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-bold text-white text-base">
                      Page-by-Page Crawl Results ({pages.length} pages)
                    </h3>
                  </div>
                  {/* Type filter pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {pageTypes.map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setPageTableFilter(t);
                          setPageTableLimit(PAGE_TABLE_STEP);
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          pageTableFilter === t
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        {t === 'all' ? `All (${pages.length})` : t}{' '}
                        {t !== 'all' && `(${pages.filter((p) => p.page_type === t).length})`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-950/80 text-slate-400 uppercase font-bold text-[10px] border-b border-slate-800">
                        <th className="py-3 px-4 w-[280px]">URL</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Response</th>
                        <th className="py-3 px-4">Words</th>
                        <th className="py-3 px-4">Schema</th>
                        <th className="py-3 px-4">Schemas</th>
                        <th className="py-3 px-4">Apps</th>
                        <th className="py-3 px-4">Images</th>
                        <th className="py-3 px-4">Dual URLs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredPages.slice(0, pageTableLimit).map((p, i) => (
                        <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                          <td className="py-2.5 px-4 font-mono max-w-[280px]">
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-300 hover:text-emerald-400 truncate flex items-center gap-1 transition-colors"
                              title={p.url}
                            >
                              <span className="truncate">{p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
                              <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-50" />
                            </a>
                            {p.title && (
                              <span className="text-[10px] text-slate-500 truncate block" title={p.title}>
                                {p.title}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                              {p.page_type}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusColor(p.status_code)}`}>
                              {p.status_code || 'ERR'}
                            </span>
                            {p.fetch_error && (
                              <span className="block text-[9px] text-rose-400/80 mt-0.5" title={p.fetch_error}>
                                {p.blocked ? 'bot challenge' : p.rate_limited ? 'rate limited' : p.fetch_error}
                              </span>
                            )}
                          </td>
                          <td className={`py-2.5 px-4 font-mono font-bold ${getLatencyColor(p.response_time_ms)}`}>
                            {p.response_time_ms}ms
                          </td>
                          <td className="py-2.5 px-4 text-slate-300">{p.word_count}</td>
                          <td className={`py-2.5 px-4 font-bold ${getSchemaScoreColor(p.schema_score)}`}>
                            {p.schema_score.toFixed(0)}%
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex flex-wrap gap-1">
                              {p.schema_types.slice(0, 3).map((s) => (
                                <span
                                  key={s}
                                  className="text-[9px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 rounded border border-emerald-500/20"
                                >
                                  {s}
                                </span>
                              ))}
                              {p.schema_types.length > 3 && (
                                <span className="text-[9px] text-slate-500">+{p.schema_types.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            {p.detected_apps.length > 0 ? (
                              <span className="text-[10px] text-violet-300 font-semibold">{p.detected_apps.length} apps</span>
                            ) : (
                              <span className="text-[10px] text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="text-slate-300">{p.total_images}</span>
                            {p.images_missing_alt > 0 && (
                              <span className="text-rose-400 ml-1">({p.images_missing_alt}✗)</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            {p.dual_urls_found?.length > 0 ? (
                              <span className="text-rose-400 font-bold">{p.dual_urls_found.length}</span>
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredPages.length > pageTableLimit && (
                  <div className="flex items-center justify-center gap-3 text-xs">
                    <span className="text-slate-500">
                      Showing {pageTableLimit} of {filteredPages.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPageTableLimit((n) => n + PAGE_TABLE_STEP)}
                      className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-800/60 hover:border-emerald-500/50 text-slate-300"
                    >
                      Show {Math.min(PAGE_TABLE_STEP, filteredPages.length - pageTableLimit)} more
                    </button>
                    <button
                      type="button"
                      onClick={() => setPageTableLimit(filteredPages.length)}
                      className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-800/60 hover:border-emerald-500/50 text-slate-300"
                    >
                      Show all
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── SECTION 6: Actionable Deficits with Affected URLs Drawer & Fix Guides ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                    <h3 className="font-bold text-white text-base">Critical Deficits &amp; Exact Link Details</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {report.deficit_details?.length ?? report.critical_deficits?.length ?? 0} issues
                  </span>
                </div>

                <div className="space-y-4">
                  {report.deficit_details && report.deficit_details.length > 0 ? (
                    report.deficit_details.map((item, i) => {
                      const defId = item.id || `deficit-${i}`;
                      const isExpanded = Boolean(expandedDeficitUrls[defId]);
                      const affectedUrls = item.affected_urls || [];

                      return (
                        <div
                          key={defId}
                          className="p-4 rounded-xl bg-slate-950/70 border-l-4 border-l-rose-500 border border-slate-800 space-y-3 transition-all hover:border-slate-700"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-xs font-bold text-white leading-snug">{item.title}</h4>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0 ${
                                item.impact === 'Critical'
                                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                  : item.impact === 'High'
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                              }`}
                            >
                              {item.impact}
                            </span>
                          </div>

                          {/* Location Pill */}
                          <div className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20 font-mono">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                            <span className="truncate"><strong>Location:</strong> {item.location}</span>
                          </div>

                          {/* Step-by-Step Action Guide */}
                          <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                            <strong className="text-emerald-400">Fix Action:</strong> {item.action_guide}
                          </p>

                          {/* Code Snippet if present */}
                          {item.code_snippet && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span className="font-mono text-emerald-400 font-semibold">Ready-to-Deploy Code:</span>
                                <button
                                  type="button"
                                  onClick={() => copySnippetCode(defId, item.code_snippet!)}
                                  className="inline-flex items-center gap-1 text-[10px] text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
                                >
                                  {copiedCodeId === defId ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copy Code</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <pre className="text-[10px] font-mono text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800 overflow-x-auto max-h-36">
                                {item.code_snippet}
                              </pre>
                            </div>
                          )}

                          {/* ── AFFECTED URLS EXPANDABLE DRAWER ── */}
                          {affectedUrls.length > 0 && (
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => toggleDeficitUrls(defId)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-xs text-rose-300 font-semibold transition-colors"
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <Eye className="w-3.5 h-3.5 text-rose-400" />
                                  <span>View Affected URLs ({affectedUrls.length})</span>
                                </span>
                                <span className="text-slate-400 text-xs">
                                  {isExpanded ? '▲ Hide' : '▼ Show Exact URLs'}
                                </span>
                              </button>

                              {isExpanded && (
                                <div className="mt-2 p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-slate-400 font-medium">
                                      Affected Page URLs ({affectedUrls.length}):
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => copyUrlsList(defId, affectedUrls)}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                                      >
                                        {copiedUrlsId === defId ? (
                                          <>
                                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                            <span className="text-emerald-400 font-bold">Copied!</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3 h-3" />
                                            <span>Copy All URLs</span>
                                          </>
                                        )}
                                      </button>
                                      {item.admin_link && (
                                        <a
                                          href={item.admin_link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30"
                                        >
                                          <span>Shopify Admin</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                    {affectedUrls.slice(0, AFFECTED_URLS_SHOWN).map((aff, affIdx) => (
                                      <div
                                        key={affIdx}
                                        className="p-2 rounded bg-slate-900/80 border border-slate-800/80 flex items-start justify-between gap-2 text-[11px]"
                                      >
                                        <a
                                          href={aff.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-mono text-slate-300 hover:text-emerald-400 truncate flex items-center gap-1 transition-colors"
                                          title={aff.url}
                                        >
                                          <span className="truncate">{aff.url}</span>
                                          <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
                                        </a>
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 whitespace-nowrap flex-shrink-0">
                                          {aff.issue}
                                        </span>
                                      </div>
                                    ))}
                                    {affectedUrls.length > AFFECTED_URLS_SHOWN && (
                                      <div className="text-[11px] text-slate-500 text-center py-1">
                                        +{affectedUrls.length - AFFECTED_URLS_SHOWN} more — use Copy All URLs or Download JSON for the full list
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Footer Tags */}
                          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                            {item.file_path && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                                <FileCode className="w-3 h-3 text-emerald-400" />
                                {item.file_path}
                              </span>
                            )}
                            {item.doc_link && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                                <FileText className="w-3 h-3 text-cyan-400" />
                                {item.doc_link}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-500 ml-auto uppercase tracking-wider font-semibold">
                              {item.dimension}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : report.critical_deficits && report.critical_deficits.length > 0 ? (
                    report.critical_deficits.map((deficit, i) => (
                      <div
                        key={i}
                        className="text-xs text-slate-300 p-3 rounded-xl bg-slate-950/60 border-l-4 border-l-rose-500 border border-slate-800/80 leading-relaxed"
                      >
                        {deficit}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-emerald-400 flex items-center gap-2 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                      <CheckCircle2 className="w-4 h-4" />
                      No critical organic growth deficits detected.
                    </div>
                  )}
                </div>
              </div>

              {/* High-Priority Liquid Theme Fixes */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-white text-base">High-Priority Liquid Theme Fixes</h3>
                </div>
                <div className="space-y-2.5">
                  {report.liquid_recommendations?.map((fix, i) => (
                    <div
                      key={i}
                      className="text-xs font-mono text-emerald-300 p-3.5 rounded-xl bg-slate-950/60 border-l-4 border-l-emerald-500 border border-slate-800/80 flex items-start justify-between gap-3"
                    >
                      <span>{fix}</span>
                      <button
                        onClick={() => copyToClipboard(fix, i)}
                        className="text-slate-400 hover:text-white p-1 flex-shrink-0 transition-colors"
                        title="Copy fix command"
                      >
                        {copiedIndex === i ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── SECTION 7: Competitor Matrix ── */}
            {report.competitors && report.competitors.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Competitor Benchmarking Matrix</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                        <th className="py-3 px-4">Store</th>
                        <th className="py-3 px-4">SOHGI</th>
                        <th className="py-3 px-4">Product Schema</th>
                        <th className="py-3 px-4">Breadcrumbs</th>
                        <th className="py-3 px-4">Filter Governance</th>
                        <th className="py-3 px-4">Mobile LCP</th>
                        <th className="py-3 px-4">AEO Density</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      <tr className="bg-emerald-500/5 font-semibold text-white">
                        <td className="py-3 px-4 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          {safeHostname(report.store_url)} (Client)
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded font-bold ${getGradeColor(report.grade)}`}>
                            {report.global_score} ({report.grade})
                          </span>
                        </td>
                        <td className="py-3 px-4">{report.dimension_details?.schema_entity?.metrics?.product_schema_ratio ?? '—'}%</td>
                        <td className="py-3 px-4 text-rose-400">
                          {report.dimension_details?.schema_entity?.metrics?.has_breadcrumbs ? '✓ Present' : '✗ Missing'}
                        </td>
                        <td className="py-3 px-4 text-amber-400">
                          {(report.dimension_scores.technical ?? 0) > 85 ? 'Clean' : 'Needs Fix'}
                        </td>
                        <td className="py-3 px-4">
                          {activePsi ? activePsi.lab.lcpDisplay : `${avgResponseMs}ms`}
                        </td>
                        <td className="py-3 px-4">{(report.dimension_scores.aeo_geo ?? 0) > 80 ? 'High' : 'Medium'}</td>
                      </tr>
                      {report.competitors.map((comp, idx) => (
                        <tr key={idx} className="text-slate-300 hover:bg-slate-800/30">
                          <td className="py-3 px-4 font-medium">{comp.name}</td>
                          <td className="py-3 px-4 font-bold text-white">{comp.global_score} ({comp.grade})</td>
                          <td className="py-3 px-4">{comp.product_schema_health}%</td>
                          <td className={`py-3 px-4 ${comp.collection_breadcrumbs ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {comp.collection_breadcrumbs ? '✓ Present' : '✗ Missing'}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{comp.faceted_filter_governance}</td>
                          <td className="py-3 px-4">{comp.mobile_lcp_seconds}s</td>
                          <td className="py-3 px-4 font-medium text-emerald-400">{comp.aeo_citation_density}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── SECTION 8: 30/60/90 Roadmap ── */}
            {report.actionable_roadmap && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  30 / 60 / 90-Day Execution Roadmap
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {Object.entries(report.actionable_roadmap).map(([phase, tasks], idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                        {phase.split(':')[0]}
                      </span>
                      <h4 className="text-sm font-bold text-white">{phase.split(':')[1]?.trim() || phase}</h4>
                      <ul className="text-xs text-slate-400 space-y-2">
                        {tasks.map((t, ti) => (
                          <li key={ti} className="flex items-start gap-1.5">
                            <ChevronRight className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 9: Export Bar ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-white">Export Audit Deliverables</h4>
                <p className="text-xs text-slate-400">
                  Save structured snapshots for dev teams or executive presentations.
                  {pages.length > 0 && ` Includes ${pages.length} real crawled pages.`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={downloadJson}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 border border-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export JSON
                </button>
                <button
                  onClick={downloadMarkdown}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 border border-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Markdown
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500">
        Forward Shopify &bull; Enterprise Shopify Organic Growth Audit Suite &bull; Real Live Crawl &amp; PSI Engine v3.0
      </footer>
    </div>
  );
}
