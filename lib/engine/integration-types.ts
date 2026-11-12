// Shared, dependency-free types for the SEO + AI SEO integrations (server and browser).
// Every value is exactly what its source returned; undefined means "not returned" (shown as "—").

export type IntegrationStatus = 'ok' | 'partial' | 'no_access' | 'unavailable';

/** Optional audit inputs for the AI visibility checks. */
export interface AiInput {
  /** Brand name as people say it (default: from the domain). */
  brand?: string;
  /** Competitor brand names or domains. */
  competitors?: string[];
  /** Your own buyer questions; asked first. */
  prompts?: string[];
}

// ─── GA4 ────────────────────────────────────────────────────────────────────

export interface Ga4Metrics {
  sessions?: number;
  engagedSessions?: number;
  keyEvents?: number;
  /** GA4's own session key event rate (fraction). */
  keyEventRate?: number;
  purchases?: number;
  revenue?: number;
}

export interface Ga4Data {
  serviceAccount?: string;
  property?: string; // "properties/123"
  propertyName?: string;
  matchedBy?: 'GA4_PROPERTIES' | 'web stream URL';
  fetchedAt: string;
  status: IntegrationStatus;
  message?: string;
  errors: string[];
  range?: { start: string; end: string; days: number };
  previousRange?: { start: string; end: string };
  /** Sessions whose default channel group is "Organic Search". */
  organic?: Ga4Metrics;
  organicPrevious?: Ga4Metrics;
  allTraffic?: Ga4Metrics;
  /** Organic purchases ÷ organic sessions (computed here; GA4's keyEventRate is shown alongside). */
  organicConversionRate?: number;
  organicConversionRatePrevious?: number;
  aiReferrals?: {
    sources: string[]; // the source list matched
    total: Ga4Metrics;
    previousTotal?: Ga4Metrics;
    bySource: Array<Ga4Metrics & { source: string }>;
    daily: Array<{ date: string; sessions?: number }>;
  };
  landingPages?: {
    byTemplate: Array<Ga4Metrics & { template: 'home' | 'product' | 'collection' | 'other' }>;
    top: Array<Ga4Metrics & { page: string }>;
  };
  /** GA4 caveats from the response metadata (thresholding, "(other)" row, sampling). */
  notes: string[];
}

// ─── Merchant Center ────────────────────────────────────────────────────────

export interface MerchantData {
  serviceAccount?: string;
  account?: string; // "accounts/123"
  accountName?: string;
  matchedBy?: 'MERCHANT_ACCOUNTS' | 'homepage URL';
  fetchedAt: string;
  status: IntegrationStatus;
  message?: string;
  errors: string[];
  range?: { start: string; end: string; days: number };
  /** Free listings (marketing method ORGANIC). */
  freeListings?: { clicks?: number; impressions?: number; ctr?: number; conversions?: number };
  freeListingsPrevious?: { clicks?: number; impressions?: number; ctr?: number; conversions?: number };
  daily?: Array<{ date: string; clicks?: number; impressions?: number }>;
  topProducts?: Array<{ offerId?: string; title?: string; clicks?: number; impressions?: number; ctr?: number }>;
  products?: { total: number; eligible: number; limited: number; pending: number; disapproved: number; truncated: boolean };
  topIssues?: Array<{ code: string; attribute?: string; severity?: string; count: number }>;
  disapprovedSample?: Array<{ offerId?: string; title?: string; issues: string[] }>;
}

// ─── AI visibility (our own probes) ─────────────────────────────────────────

export interface AiCitation {
  url: string;
  title?: string;
  domain: string;
}

export interface AiPrompt {
  text: string;
  group: 'brand' | 'shopping' | 'comparison' | 'custom';
  /** Where it came from, e.g. 'your prompt', 'Search Console query "wool shoes"', 'collection "Sale"'. */
  source: string;
}

export interface AiAnswer {
  engine: string;
  promptIndex: number;
  ok: boolean;
  /** Request failed: the reason. */
  error?: string;
  /** Not sent (time limit or cost cap): the reason. */
  notRun?: string;
  model?: string;
  text?: string;
  citations: AiCitation[];
  brandMentioned: boolean;
  storeCited: boolean;
  competitorsMentioned: string[];
  productsMentioned: string[];
}

export interface AiEngineSummary {
  engine: string;
  label: string;
  model?: string;
  /** Prompts answered (the denominator for every rate). */
  answered: number;
  failed: number;
  notRun: number;
  brandMentions: number;
  storeCitations: number;
  shoppingAnswered: number;
  productRecommendations: number;
  competitorMentions: Record<string, number>;
}

export interface AiVisibilityData {
  fetchedAt: string;
  status: 'ok' | 'partial' | 'unavailable';
  message?: string;
  errors: string[];
  brand: string;
  brandTerms: string[];
  competitors: Array<{ name: string; terms: string[] }>;
  productNamesChecked: number;
  prompts: AiPrompt[];
  engines: AiEngineSummary[];
  answers: AiAnswer[];
  citedDomains: Array<{ domain: string; count: number; engines: string[]; isStore: boolean; competitor?: string }>;
  storeUrlsCited: Array<{ url: string; count: number }>;
  /** Mentions across all engines: the store and each competitor. */
  shareOfVoice: Array<{ name: string; mentions: number; isStore: boolean }>;
}

// ─── Google AI Overviews (SERP provider) ────────────────────────────────────

export interface AiOverviewKeyword {
  keyword: string;
  source: string;
  ok: boolean;
  error?: string;
  notRun?: string;
  hasAio?: boolean;
  storeCited?: boolean;
  references: Array<{ url: string; domain: string; title?: string; source?: string }>;
  competitorsCited: string[];
  /** The store's best organic position on the same results page (1 = first). */
  storeOrganicPosition?: number;
}

export interface AiOverviewsData {
  provider: 'dataforseo';
  location: string;
  locationCode: number;
  language: string;
  device: 'desktop' | 'mobile';
  fetchedAt: string;
  status: 'ok' | 'partial' | 'unavailable';
  message?: string;
  errors: string[];
  keywords: AiOverviewKeyword[];
}

// ─── Otterly.AI ─────────────────────────────────────────────────────────────

export interface OtterlyData {
  fetchedAt: string;
  status: 'ok' | 'partial' | 'no_report' | 'unavailable';
  message?: string;
  errors: string[];
  reportId?: string;
  reportName?: string;
  matchedBy?: 'OTTERLY_REPORTS' | 'brand domain';
  range?: { start: string; end: string };
  country?: string;
  totalPrompts?: number;
  summary?: { shareOfVoice?: number; brandCoverage?: number; domainCoverage?: number; totalMentions?: number; averagePosition?: number; averageRank?: number };
  brands?: Array<{ brand: string; isMainBrand: boolean; mentions?: number; shareOfVoice?: number; brandCoverage?: number; domainCitations?: number }>;
  citations?: Array<{ url: string; domain: string; title?: string; citations?: number; isMyBrandDomain?: boolean; category?: string }>;
}
