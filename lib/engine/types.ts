// Shared, dependency-free types for the audit engine. Imported by both server and browser code.

export type Strategy = 'mobile' | 'desktop';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type ModuleId =
  | 'speed'
  | 'apps'
  | 'technical_seo'
  | 'url_architecture'
  | 'structured_data'
  | 'product_quality'
  | 'ai_readiness'
  | 'international'
  | 'accessibility'
  | 'conversion'
  | 'security';

export interface ModuleInfo {
  id: ModuleId;
  label: string;
  description: string;
  weight: number; // share of the overall score
  sources: string[];
}

export const MODULES: ModuleInfo[] = [
  { id: 'speed', label: 'Speed & Core Web Vitals', description: 'Lighthouse performance, lab metrics and real-user Core Web Vitals.', weight: 0.18, sources: ['PageSpeed Insights', 'CrUX'] },
  { id: 'apps', label: 'App & Script Cost', description: 'What each third-party app costs in main-thread time and bytes.', weight: 0.08, sources: ['PageSpeed Insights'] },
  { id: 'technical_seo', label: 'Technical SEO', description: 'Status codes, titles, meta descriptions, H1s, canonicals, indexability, robots and sitemaps.', weight: 0.14, sources: ['Lighthouse SEO', 'HTML crawl'] },
  { id: 'url_architecture', label: 'Shopify URL Architecture', description: 'Collection-scoped product URLs, variant/filter/tag URLs, myshopify leaks, broken sitemap URLs.', weight: 0.08, sources: ['HTML crawl', 'Sitemaps'] },
  { id: 'structured_data', label: 'Structured Data', description: 'Product/Offer, Breadcrumb, Collection, Organization, WebSite and Article schema against Google requirements.', weight: 0.12, sources: ['HTML crawl'] },
  { id: 'product_quality', label: 'Product Content Quality', description: 'Thin content, missing meta, image alt text and identifiers on product pages.', weight: 0.08, sources: ['HTML crawl'] },
  { id: 'ai_readiness', label: 'AI Search Readiness', description: 'AI crawler access, llms.txt, entity schema, FAQ and definition content.', weight: 0.06, sources: ['robots.txt', 'HTML crawl'] },
  { id: 'international', label: 'International', description: 'hreflang coverage, x-default and locale sitemaps.', weight: 0.04, sources: ['HTML crawl'] },
  { id: 'accessibility', label: 'Accessibility', description: 'Lighthouse accessibility audits (axe-core rules).', weight: 0.1, sources: ['Lighthouse'] },
  { id: 'conversion', label: 'Conversion & Trust', description: 'Add-to-cart presence, policy pages, reviews, search page hygiene.', weight: 0.06, sources: ['HTML crawl'] },
  { id: 'security', label: 'Security & Best Practices', description: 'HTTPS, security headers, Lighthouse best-practices audits, consent banner.', weight: 0.06, sources: ['Lighthouse', 'Response headers'] },
];

export interface EvidenceItem {
  page?: string; // which audited page the evidence came from
  url?: string; // resource URL (script, image, link target)
  selector?: string;
  snippet?: string;
  label?: string;
  value?: string; // human readable, e.g. "320 ms", "45 KB"
  wastedMs?: number;
  wastedBytes?: number;
}

export interface Finding {
  id: string; // stable within a run: `${source}:${checkId}`
  module: ModuleId;
  checkId: string;
  title: string;
  description: string;
  severity: Severity;
  source: 'lighthouse' | 'crawl' | 'site' | 'crux' | 'apps' | 'browser' | 'owner' | 'catalog';
  pagesAffected: string[];
  pagesChecked: number;
  /** Real number of affected items when `pagesAffected` is a capped list (catalog checks) */
  affectedTotal?: number;
  /** Every source that reported this issue (after merging) */
  sources?: Array<Finding['source']>;
  impact?: { savingsMs?: number; savingsBytes?: number; note?: string };
  evidence: EvidenceItem[];
  fix?: FixGuide;
  learnMore?: string;
}

export interface FixGuide {
  id: string;
  summary: string;
  steps: string[];
  where?: string; // theme file or admin area
  snippet?: string;
  adminPath?: string; // appended to https://admin.shopify.com/store/{handle}/
  docs?: string;
}

// ─── PageSpeed Insights (normalized Lighthouse) ─────────────────────────────

export interface LabMetrics {
  lcpMs: number | null;
  fcpMs: number | null;
  tbtMs: number | null;
  cls: number | null;
  siMs: number | null;
  ttiMs: number | null;
}

export interface FieldMetrics {
  category: string | null; // FAST | AVERAGE | SLOW
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
  passed: boolean | null;
}

export interface NormalizedAudit {
  id: string;
  title: string;
  description: string;
  category: 'performance' | 'accessibility' | 'best-practices' | 'seo' | 'agentic-browsing' | 'other';
  score: number | null;
  scoreDisplayMode: string;
  displayValue?: string;
  weight: number;
  savingsMs: number;
  savingsBytes: number;
  items: EvidenceItem[];
}

export interface ThirdPartyCost {
  entity: string;
  mainThreadMs: number;
  blockingMs: number;
  transferBytes: number;
}

export interface PageSpeedResult {
  url: string;
  finalUrl: string;
  strategy: Strategy;
  fetchedAt: string;
  lighthouseVersion: string;
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
  lab: LabMetrics;
  field: FieldMetrics | null; // this URL
  originField: FieldMetrics | null; // whole origin
  failedAudits: NormalizedAudit[];
  thirdParties: ThirdPartyCost[];
  lcpElement?: { selector?: string; snippet?: string };
  screenshot?: string; // file key served by /api/runs/[id]/screenshot
}

export interface PageSpeedTest {
  url: string;
  type: string;
  strategy: Strategy;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  error?: string;
  result?: PageSpeedResult;
}

// ─── CrUX ───────────────────────────────────────────────────────────────────

export interface CruxSnapshot {
  formFactor: 'PHONE' | 'DESKTOP';
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
  period?: string;
}

export interface CruxHistoryPoint {
  end: string; // yyyy-mm-dd
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
}

/** Which Ahrefs key is configured: AHREFS_FREE_API_KEY or AHREFS_PAID_API_KEY. */
export type AhrefsPlan = 'free' | 'paid';

/** Ahrefs Site Explorer data (paid plan with API access only). */
export interface SiteExplorerData {
  status: 'ok' | 'partial' | 'no_api_access' | 'failed';
  message?: string;
  backlinks?: { live?: number; liveRefdomains?: number; allTime?: number; allTimeRefdomains?: number };
  organic?: { traffic?: number; keywords?: number; keywordsTop3?: number };
  topPages?: Array<{ url: string; traffic?: number; keywords?: number; topKeyword?: string; topKeywordVolume?: number; topKeywordPosition?: number }>;
  keywords?: Array<{ keyword: string; volume?: number; position?: number; url?: string }>;
}

/** Search visibility and authority from Ahrefs API v3. Values are exactly what Ahrefs returned. */
export interface AhrefsData {
  plan: AhrefsPlan;
  target: string;
  fetchedAt: string;
  status: 'ok' | 'partial' | 'unavailable';
  message?: string;
  /** Free endpoint (any key). Must be credited "Domain Rating by Ahrefs". */
  domainRating: { value?: number; error?: string; keyRejected?: boolean };
  /** Only present with a paid key. */
  siteExplorer?: SiteExplorerData;
}

export interface CruxData {
  status: 'ok' | 'no_data' | 'unavailable';
  message?: string;
  phone?: CruxSnapshot;
  desktop?: CruxSnapshot;
  history?: CruxHistoryPoint[]; // phone
}

// ─── Crawl & site checks ────────────────────────────────────────────────────

export interface CrawledPage {
  url: string;
  type: string;
  status: number;
  error: string | null;
  rateLimited: boolean;
  /** Set when this page was blocked in this run and its data comes from an earlier run's crawl */
  cachedFrom?: { runId: string; crawledAt: string };
  blocked: boolean;
  responseMs: number;
  title: string;
  metaDescription: string;
  metaRobots: string;
  noindex: boolean;
  h1Count: number;
  h1: string;
  canonical: string;
  canonicalStatus: string;
  wordCount: number;
  schemaTypes: string[];
  schemaFindings: string[];
  invalidJsonLd: number;
  hasFaq: boolean;
  definitionWords: number;
  totalImages: number;
  imagesMissingAlt: number;
  dualUrls: string[];
  internalLinks: number;
  scriptCount: number;
  thirdPartyScripts: number;
  renderBlockingScripts: number;
  detectedApps: string[];
  intentSignals?: Record<string, boolean>;
  hreflangs?: string[];
  myshopifyLinks?: number;
}

export interface SiteChecks {
  robots: { found: boolean; status: number; hasSitemap: boolean; aiBots: Record<string, 'allowed' | 'blocked' | 'partial'>; raw?: string };
  llmsTxt: { found: boolean; status: number };
  headers: Record<string, string | null>;
  https: boolean;
  policies: Record<string, number>; // path → status
  searchPage: { status: number; noindex: boolean; disallowed: boolean } | null;
  consentBanner: string | null;
  hreflang: { count: number; hasXDefault: boolean; selfReference: boolean; codes: string[] };
}

export interface AppCost {
  name: string;
  category: string;
  pages: number;
  pagesTested: number;
  /** Tested pages the app was seen on */
  pageUrls?: string[];
  avgMainThreadMs: number;
  avgBlockingMs: number;
  avgTransferKb: number;
  detectedBy: Array<'lighthouse' | 'html'>;
}

// ─── Run ────────────────────────────────────────────────────────────────────

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RunInput {
  url: string;
  pages: number;
  strategies: Strategy[];
  customUrls?: string[];
  browserTests?: boolean; // Playwright: axe after load, rendered schema, console errors (default true)
  cartFlow?: boolean; // Playwright: add to cart → cart → checkout reachability (default false)
  groupId?: string; // competitor benchmark group
  role?: 'primary' | 'competitor';
  scheduleId?: string;
}

// ─── Browser worker (Playwright) ────────────────────────────────────────────

export interface AxeViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null;
  help: string;
  helpUrl: string;
  nodes: Array<{ target: string; html: string }>;
  count: number;
}

export interface BrowserPage {
  url: string;
  type: string;
  context: string; // "loaded" | "menu open"
  ok: boolean;
  error?: string;
  loadMs?: number;
  axe: AxeViolation[];
  consoleErrors: string[];
  renderedSchemaTypes: string[];
  serverSchemaTypes: string[];
  jsInjectedSchema: string[];
  screenshot?: string;
}

export interface FlowStep {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
  screenshot?: string;
}

export interface FlowResult {
  productUrl: string;
  steps: FlowStep[];
  addedToCart: boolean;
  reachedCheckout: boolean;
  error?: string;
}

export interface BrowserResults {
  status: 'ok' | 'skipped' | 'failed';
  message?: string;
  browser?: string;
  pages: BrowserPage[];
  flow?: FlowResult;
}

// ─── Owner mode (Shopify Admin API) ─────────────────────────────────────────

export interface OwnerProductIssue {
  handle: string;
  title: string;
  url: string;
  issue: string;
}

export interface OwnerResults {
  status: 'ok' | 'failed' | 'skipped';
  message?: string;
  /** admin = Shopify Admin API (owner token); feed = public /products.json + /collections.json */
  via?: 'admin' | 'feed';
  shop?: { name: string; myshopifyDomain: string; primaryDomain: string; plan?: string };
  counts?: { products: number; productsScanned: number; activeProducts: number; collections: number; collectionsScanned: number; redirects: number | null };
  issues?: Record<string, OwnerProductIssue[]>; // check id → affected items
  themeScripts?: Array<{ file: string; domain: string; app?: string }>;
  themeName?: string;
  truncated?: boolean;
  /** Real number of affected items per check (issue lists are capped for size) */
  totals?: Record<string, number>;
}

// ─── Monitoring ─────────────────────────────────────────────────────────────

export interface RunComparison {
  previousId: string;
  previousAt: string;
  overallDelta: number | null;
  moduleDeltas: Array<{ id: ModuleId; from: number | null; to: number | null }>;
  mobilePerfDelta: number | null;
  newFindings: Array<{ id: string; title: string; severity: Severity }>;
  resolvedFindings: Array<{ id: string; title: string; severity: Severity }>;
  regression: boolean;
  /** Why some differences were not counted (new data sources, different modules scored) */
  notes?: string[];
  reasons: string[];
}

export interface Schedule {
  id: string;
  url: string;
  pages: number;
  strategies: Strategy[];
  browserTests: boolean;
  frequency: 'daily' | 'weekly';
  webhookUrl?: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastRunId?: string;
}

export interface PlatformInfo {
  id: 'shopify' | 'headless' | 'woocommerce' | 'wordpress' | 'wix' | 'squarespace' | 'webflow' | 'bigcommerce' | 'magento' | 'nextjs' | 'nuxt' | 'gatsby' | 'react' | 'unknown';
  name: string;
  /** What was actually seen in the HTML/headers */
  evidence: string[];
}

export interface ModuleScore {
  id: ModuleId;
  score: number | null; // null = not measured or not applicable this run
  basis: string;
  /** false = the module does not apply to this site (e.g. Shopify URL checks on a WordPress site) */
  applicable?: boolean;
  findings: number;
}

export interface Run {
  id: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  status: RunStatus;
  input: RunInput;
  error?: string;
  store?: { inputHost: string; baseUrl: string; host: string; handle: string; platform?: PlatformInfo };
  /** Per-run API key or owner token was supplied (held in memory only), so the run can't be resumed after a restart */
  hasRunSecrets?: boolean;
  /** Times this run was re-queued after a server restart */
  restarts?: number;
  progress: {
    stage: string;
    psiDone: number;
    psiTotal: number;
    crawlDone: number;
    crawlTotal: number;
    message?: string;
    waitUntil?: number;
  };
  discovery?: { products: number; collections: number; pages: number; articles: number; blogs: number; sitemapFound: boolean; brokenSitemaps: number };
  targets: Array<{ url: string; type: string }>;
  psiTests: PageSpeedTest[];
  crux?: CruxData;
  /** Ahrefs data (only when AHREFS_FREE_API_KEY or AHREFS_PAID_API_KEY is set). */
  ahrefs?: AhrefsData;
  crawl: CrawledPage[];
  site?: SiteChecks;
  apps: AppCost[];
  browser?: BrowserResults;
  owner?: OwnerResults;
  /** Whole-catalog checks from the public JSON feed (used when owner mode is not available) */
  catalog?: OwnerResults;
  findings: Finding[];
  scores?: { overall: number | null; grade: string; modules: ModuleScore[]; google: { mobile: GoogleScores | null; desktop: GoogleScores | null } };
  comparison?: RunComparison;
  alert?: { sent: boolean; target?: string; error?: string };
  warnings: string[];
}

export interface GoogleScores {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  pages: number;
}

export interface RunSummary {
  id: string;
  createdAt: string;
  status: RunStatus;
  url: string;
  host?: string;
  overall: number | null;
  grade?: string;
  findings: number;
  groupId?: string;
  role?: 'primary' | 'competitor';
  scheduleId?: string;
  platform?: string;
}
