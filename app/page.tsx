'use client';

import React, { useState, useEffect, useRef } from 'react';
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

interface DeficitDetail {
  title: string;
  dimension: string;
  impact: string;
  location: string;
  action_guide: string;
  file_path?: string | null;
  doc_link?: string | null;
}

interface BenchmarkReport {
  store_url: string;
  global_score: number;
  grade: string;
  executive_assessment: string;
  dimension_scores: {
    technical: number;
    schema_entity: number;
    aeo_geo: number;
    architecture: number;
    core_web_vitals: number;
    intent_conversion: number;
  };
  dimension_details?: Record<string, DimensionDetail>;
  critical_deficits?: string[];
  liquid_recommendations?: string[];
  competitors?: Competitor[];
  actionable_roadmap?: Record<string, string[]>;
  pages_audited?: PageAuditResult[];
  scripts_summary?: ScriptsSummary;
  deficit_details?: DeficitDetail[];
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

function safeHostname(url: string) {
  try { return new URL(url).hostname; } catch { return url; }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ForwardShopifyApp() {
  const [storeUrl, setStoreUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [pageTableFilter, setPageTableFilter] = useState('all');
  const startTimeRef = useRef<number>(0);

  const loadingSteps = [
    '🔍 Resolving DNS & connecting to Shopify CDN...',
    '🗺️ Parsing XML Sitemaps — Products, Collections, Blogs, Pages...',
    '🕷️ Multi-threaded DOM crawl (6 workers) in progress...',
    '🏷️ Validating Google Rich Schemas & Merchant Center eligibility...',
    '🔗 Scanning internal links for dual-URL /collections/*/products/* traps...',
    '📱 Detecting third-party apps, render-blocking scripts & image audits...',
    '📊 Computing 6-Dimension SOHGI Composite Index (0–100)...',
  ];

  useEffect(() => {
    let timer: NodeJS.Timeout;
    let elapsed: NodeJS.Timeout;
    if (loading) {
      let step = 0;
      timer = setInterval(() => {
        step = Math.min(step + 1, loadingSteps.length - 1);
        setLoadingStep(step);
      }, 1800);
      elapsed = setInterval(() => {
        setLoadingElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }
    return () => { clearInterval(timer); clearInterval(elapsed); };
  }, [loading]);

  const handleAudit = async (url: string) => {
    const target = url.trim();
    if (!target) return;

    setLoading(true);
    setLoadingStep(0);
    setLoadingElapsed(0);
    setReport(null);
    setError(null);
    startTimeRef.current = Date.now();

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: target,
          maxPages: 50,
          maxProducts: 25,
          maxCollections: 15,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.status === 'error') {
        setError(data.message || 'Audit failed. The store may be blocking automated crawlers (Cloudflare / bot protection).');
        return;
      }

      if (data.status === 'ok' && data.report) {
        setReport(data.report);
      } else {
        setError('No report data received from the audit engine.');
      }
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
    Object.entries(report.dimension_scores).forEach(([k, v]) => { md += `- **${k}**: ${v}/100\n`; });
    md += `\n## Critical Deficits\n`;
    report.critical_deficits?.forEach((d) => { md += `- ⚠️ ${d}\n`; });
    md += `\n## Liquid Fixes\n`;
    report.liquid_recommendations?.forEach((r) => { md += `- [ ] ${r}\n`; });
    if (report.pages_audited?.length) {
      md += `\n## Pages Audited (${report.pages_audited.length} pages)\n\n`;
      md += `| URL | Type | Status | Response | Schema | Apps |\n|---|---|---|---|---|---|\n`;
      report.pages_audited.slice(0, 50).forEach((p) => {
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

  const filteredPages = pageTableFilter === 'all'
    ? pages
    : pages.filter((p) => p.page_type === pageTableFilter);
  const pageTypes = ['all', ...Array.from(new Set(pages.map((p) => p.page_type)))];

  const score = report?.global_score ?? 0;
  const circumference = 2 * Math.PI * 46;
  const strokeDashoffset = circumference - (circumference * score) / 100;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-slate-100 flex flex-col">
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
                Growth Engine v2.9
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Crawl Engine Ready
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 w-full space-y-10">

        {/* ── Hero URL Input ── */}
        <div className="text-center max-w-3xl mx-auto space-y-5">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Audit Any Shopify Store&rsquo;s{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Organic Growth Stack
            </span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Paste any Shopify store URL. The engine crawls all pages via sitemaps, audits every product,
            collection &amp; blog in real-time, detects 30+ apps, validates Google Merchant Center schema,
            and delivers a full SOHGI score breakdown.
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

            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs">
              <span className="text-slate-500 font-medium">Try a live store:</span>
              {['https://allbirds.com', 'https://gymshark.com', 'https://tentree.com'].map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => { setStoreUrl(url); handleAudit(url); }}
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
                <div className="absolute inset-0 rounded-full border-4 border-slate-800 border-t-emerald-400 animate-spin" />
                <div className="absolute inset-3 rounded-full border-4 border-slate-800 border-b-cyan-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">Crawling Shopify Store Architecture...</h3>
                <p className="text-sm text-emerald-400 font-mono transition-all duration-500 min-h-[24px]">
                  {loadingSteps[loadingStep]}
                </p>
                <p className="text-xs text-slate-500 font-mono">
                  {loadingElapsed}s elapsed — large stores take 60–180 seconds
                </p>
              </div>
              <div className="flex justify-center gap-1.5 pt-2">
                {loadingSteps.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-500 ${i <= loadingStep ? 'w-8 bg-emerald-400' : 'w-2 bg-slate-800'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Error State ── */}
        {!loading && error && (
          <div className="max-w-2xl mx-auto border border-rose-500/30 bg-rose-500/5 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-rose-400">
              <XCircle className="w-5 h-5" />
              <span className="font-bold text-base">Crawl Failed</span>
            </div>
            <p className="text-sm text-slate-300">{error}</p>
            <p className="text-xs text-slate-500">
              Some stores use Cloudflare Bot Management which blocks server-side crawlers. Try a store that
              doesn&rsquo;t use aggressive bot protection, or run the Python CLI directly:
            </p>
            <code className="block text-xs font-mono bg-slate-900 text-emerald-300 px-4 py-3 rounded-xl border border-slate-800">
              {`.venv\\Scripts\\python.exe scripts/run_shopify_benchmark.py --url ${storeUrl || 'https://your-store.com'}`}
            </code>
          </div>
        )}

        {/* ── RESULTS DASHBOARD ── */}
        {!loading && report && (
          <div className="space-y-8 animate-in fade-in duration-500">

            {/* ── SECTION 1: Composite Score + KPI Tiles ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* SOHGI Gauge */}
              <div className="lg:col-span-7 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800/80 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
                <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                  <div className="relative w-36 h-36 flex-shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="46" className="stroke-slate-800" strokeWidth="8" fill="none" />
                      <circle
                        cx="50" cy="50" r="46"
                        className="stroke-emerald-400 transition-all duration-1000 ease-out"
                        strokeWidth="8"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black tracking-tight text-white">{report.global_score}</span>
                      <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">/ 100 SOHGI</span>
                    </div>
                  </div>
                  <div className="space-y-3 text-center sm:text-left flex-1">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Shopify Organic Health Index</span>
                      <span className={`text-xs font-extrabold px-3 py-0.5 rounded-full border ${getGradeColor(report.grade)}`}>
                        Grade {report.grade}
                      </span>
                      {pages.length > 0 && (
                        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                          {pages.length} pages crawled
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                      {score >= 85 ? 'Healthy Organic Engine' : score >= 70 ? 'Moderate Growth Opportunity' : 'Critical Technical Deficit'}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{report.executive_assessment}</p>
                    <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs font-mono text-slate-500">
                      <span className="px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/50">{report.store_url}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI Tiles */}
              <div className="lg:col-span-5 grid grid-cols-2 gap-4">
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-400">Dual-URL Traps</span>
                  <div className="my-2">
                    <span className="text-3xl font-black text-rose-400">
                      {report.dimension_details?.architecture?.metrics?.dual_url_count ?? '—'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">/collections/*/products/*</span>
                </div>
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-400">Schema Health</span>
                  <div className="my-2">
                    <span className="text-3xl font-black text-amber-400">
                      {report.dimension_details?.schema_entity?.metrics?.product_schema_ratio ?? '—'}%
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">Google Rich Snippet eligible</span>
                </div>
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-400">Avg. Response Time</span>
                  <div className="my-2">
                    <span className={`text-3xl font-black ${getLatencyColor(avgResponseMs)}`}>
                      {pages.length ? `${avgResponseMs}ms` : (report.dimension_details?.core_web_vitals?.metrics?.mobile_lcp_seconds ?? '—') + 's'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {pages.length ? `Min ${minMs}ms / Max ${maxMs}ms` : 'Mobile LCP estimate'}
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
                    {report.scripts_summary?.total_render_blocking_scripts ?? 0} render-blocking
                  </span>
                </div>
              </div>
            </div>

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
                  { key: 'core_web_vitals', label: 'Speed & Core Web Vitals', weight: '15%', color: 'bg-rose-400', desc: 'Mobile LCP, Cumulative Layout Shift, third-party app script bloat.' },
                  { key: 'intent_conversion', label: 'Intent & Conversion Alignment', weight: '10%', color: 'bg-teal-400', desc: 'Above-fold product visibility, trust proofs, commercial query alignment.' },
                ].map(({ key, label, weight, color, desc }) => {
                  const dimScore = report.dimension_scores[key as keyof typeof report.dimension_scores] ?? 0;
                  const detail = report.dimension_details?.[key];
                  return (
                    <div key={key} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">{weight}</span>
                        <span className={`text-lg font-black ${dimScore >= 80 ? 'text-emerald-400' : dimScore >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{dimScore}/100</span>
                      </div>
                      <h4 className="font-bold text-slate-200 text-sm">{label}</h4>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${dimScore}%` }} />
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

            {/* ── SECTION 3: Detected Apps Grid ── */}
            {(report.scripts_summary?.all_detected_apps?.length ?? 0) > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-violet-400" />
                  <h3 className="font-bold text-white text-base">
                    Detected Third-Party Apps & Trackers ({report.scripts_summary!.all_detected_apps.length})
                  </h3>
                  <span className="ml-auto text-xs text-slate-400">
                    {report.scripts_summary!.total_render_blocking_scripts} render-blocking scripts detected across all pages
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {report.scripts_summary!.all_detected_apps.map((app) => {
                    const cat = APP_CATEGORIES[app] || 'Other';
                    const colorClass = CATEGORY_COLORS[cat] || CATEGORY_COLORS['Platform'];
                    return (
                      <span key={app} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${colorClass}`}>
                        <span>{app}</span>
                        <span className="text-[10px] opacity-60">({cat})</span>
                      </span>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {Object.entries(
                    report.scripts_summary!.all_detected_apps.reduce<Record<string, number>>((acc, app) => {
                      const cat = APP_CATEGORIES[app] || 'Other';
                      acc[cat] = (acc[cat] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([cat, count]) => (
                    <div key={cat} className={`rounded-xl px-4 py-3 border ${CATEGORY_COLORS[cat] || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                      <div className="text-xl font-black">{count}</div>
                      <div className="text-[11px] font-semibold opacity-80">{cat}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 4: Image Audit + Canonical Issues ── */}
            {pages.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Image Audit */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Image className="w-5 h-5 text-amber-400" />
                    <h3 className="font-bold text-white text-base">Image Audit Summary</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-950/60 rounded-xl px-4 py-3 border border-slate-800">
                      <div className="text-2xl font-black text-white">{totalImages}</div>
                      <div className="text-xs text-slate-400">Total Images Scanned</div>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl px-4 py-3 border border-rose-500/20">
                      <div className="text-2xl font-black text-rose-400">{totalMissingAlt}</div>
                      <div className="text-xs text-slate-400">Missing Alt Text</div>
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
                      <div className="text-xs text-slate-400">Avg Missing Alt / Page</div>
                    </div>
                  </div>
                  {totalMissingAlt > 0 && (
                    <p className="text-xs text-amber-300/80 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                      ⚠️ {totalMissingAlt} images lack descriptive alt attributes — this suppresses image search rankings and accessibility scores.
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
                      {canonicalIssues.map((p, i) => (
                        <div key={i} className="bg-slate-950/60 border border-rose-500/20 rounded-xl p-3 space-y-1">
                          <div className="text-xs font-mono text-rose-300 truncate">{p.url}</div>
                          <div className="text-[11px] text-slate-400">
                            Canonical → <span className="text-slate-300 font-mono">{p.canonical_url || 'missing'}</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">{p.canonical_status}</span>
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
                        onClick={() => setPageTableFilter(t)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          pageTableFilter === t
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        {t === 'all' ? `All (${pages.length})` : t} {t !== 'all' && `(${pages.filter(p => p.page_type === t).length})`}
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
                      {filteredPages.map((p, i) => (
                        <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                          <td className="py-2.5 px-4 font-mono max-w-[280px]">
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-300 hover:text-emerald-400 truncate block transition-colors"
                              title={p.url}
                            >
                              {p.url.replace(/^https?:\/\/[^/]+/, '')}
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
                              {p.status_code}
                            </span>
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
                                <span key={s} className="text-[9px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 rounded border border-emerald-500/20">
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
              </div>
            )}

            {/* ── SECTION 6: Actionable Deficits with Location & Guides + Liquid Fixes ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                    <h3 className="font-bold text-white text-base">Critical Deficits & Exact Action Guides</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {report.deficit_details?.length ?? report.critical_deficits?.length ?? 0} issues
                  </span>
                </div>

                <div className="space-y-3.5">
                  {/* Rich Deficit Details when available */}
                  {report.deficit_details && report.deficit_details.length > 0 ? (
                    report.deficit_details.map((item, i) => (
                      <div
                        key={i}
                        className="p-4 rounded-xl bg-slate-950/70 border-l-4 border-l-rose-500 border border-slate-800 space-y-2.5 transition-all hover:border-slate-700"
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

                        {/* Linked Files & Playbooks */}
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
                    ))
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
                          {pages.length ? `${avgResponseMs}ms` : (report.dimension_details?.core_web_vitals?.metrics?.mobile_lcp_seconds ?? '—') + 's'}
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
                <button onClick={downloadJson} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 border border-slate-700">
                  <Download className="w-3.5 h-3.5" />Export JSON
                </button>
                <button onClick={downloadMarkdown} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 border border-slate-700">
                  <Download className="w-3.5 h-3.5" />Export Markdown
                </button>
                <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" />Print / PDF
                </button>
              </div>
            </div>

          </div>
        )}
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500">
        Forward Shopify &bull; Enterprise Shopify Organic Growth Audit Suite &bull; Real Live Crawl Engine v2.9
      </footer>
    </div>
  );
}
