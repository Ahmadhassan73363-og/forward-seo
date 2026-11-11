import { MODULES, type Finding, type GoogleScores, type ModuleId, type ModuleScore, type PageSpeedTest, type Severity, type Strategy } from './types';

const SEV_PENALTY: Record<Severity, number> = { critical: 30, high: 18, medium: 9, low: 4, info: 0 };

export function median(xs: number[]): number | null {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

export function googleScores(tests: PageSpeedTest[], strategy: Strategy): GoogleScores | null {
  const res = tests.filter((t) => t.strategy === strategy && t.status === 'done' && t.result).map((t) => t.result!);
  if (!res.length) return null;
  return {
    performance: median(res.map((r) => r.scores.performance as number)),
    accessibility: median(res.map((r) => r.scores.accessibility as number)),
    bestPractices: median(res.map((r) => r.scores.bestPractices as number)),
    seo: median(res.map((r) => r.scores.seo as number)),
    pages: res.length,
  };
}

/** 100 minus severity penalties, each scaled by the share of checked pages affected. */
function penaltyScore(findings: Finding[]): number {
  let s = 100;
  for (const f of findings) {
    const affected = f.affectedTotal ?? f.pagesAffected.length;
    const ratio = f.pagesChecked > 0 && affected ? Math.min(1, affected / f.pagesChecked) : 1;
    s -= SEV_PENALTY[f.severity] * (0.4 + 0.6 * ratio);
  }
  return Math.max(0, Math.round(s));
}

export interface ScoringInput {
  findings: Finding[];
  tests: PageSpeedTest[];
  measured: Partial<Record<ModuleId, boolean>>; // modules with enough data to score
  /** Modules that don't apply to this site, with the reason shown instead of a score */
  notApplicable?: Partial<Record<ModuleId, string>>;
  /** Why a module could not be measured this run */
  notMeasuredReason?: Partial<Record<ModuleId, string>>;
}

export function scoreRun({ findings, tests, measured, notApplicable = {}, notMeasuredReason = {} }: ScoringInput) {
  const mobile = googleScores(tests, 'mobile');
  const desktop = googleScores(tests, 'desktop');
  const g = mobile || desktop;
  const byModule = (id: ModuleId) => findings.filter((f) => f.module === id);

  const modules: ModuleScore[] = MODULES.map((m) => {
    const fs = byModule(m.id);
    if (notApplicable[m.id]) return { id: m.id, score: null, basis: `Not applicable: ${notApplicable[m.id]}`, findings: fs.length, applicable: false };
    const pen = measured[m.id] ? penaltyScore(fs) : null;
    let score: number | null = null;
    let basis = `Not scored: ${notMeasuredReason[m.id] || 'not enough data this run'}${fs.length ? '. Issues found on other pages are still listed' : ''}`;
    switch (m.id) {
      case 'speed':
        if (g?.performance != null) {
          score = g.performance;
          basis = `Median Lighthouse performance (${mobile ? 'mobile' : 'desktop'}, ${g.pages} pages)`;
        }
        break;
      case 'accessibility':
        if (g?.accessibility != null && pen !== null && fs.some((f) => f.source === 'browser')) {
          score = Math.round((g.accessibility + pen) / 2);
          basis = `Average of median Lighthouse accessibility (${g.pages} pages) and browser axe checks`;
        } else if (g?.accessibility != null) {
          score = g.accessibility;
          basis = `Median Lighthouse accessibility (${g.pages} pages)`;
        } else if (pen !== null) {
          score = pen;
          basis = 'Browser axe checks (no Lighthouse data)';
        }
        break;
      case 'technical_seo':
        if (g?.seo != null && pen !== null) {
          score = Math.round((g.seo + pen) / 2);
          basis = 'Average of median Lighthouse SEO score and crawl checks';
        } else if (g?.seo != null) {
          score = g.seo;
          basis = 'Median Lighthouse SEO score';
        } else if (pen !== null) {
          score = pen;
          basis = 'Crawl checks';
        }
        break;
      case 'security':
        if (g?.bestPractices != null && pen !== null) {
          score = Math.round((g.bestPractices + pen) / 2);
          basis = 'Average of median Lighthouse best-practices score and header checks';
        } else if (g?.bestPractices != null) {
          score = g.bestPractices;
          basis = 'Median Lighthouse best-practices score';
        } else if (pen !== null) {
          score = pen;
          basis = 'Header and consent checks';
        }
        break;
      default:
        if (pen !== null) {
          score = pen;
          basis = `${fs.length} finding(s), weighted by severity and pages affected`;
        }
    }
    return { id: m.id, score, basis, findings: fs.length, applicable: true };
  });

  const scored = modules.filter((m) => m.score !== null);
  const weightOf = (id: ModuleId) => MODULES.find((m) => m.id === id)!.weight;
  const w = scored.reduce((s, m) => s + weightOf(m.id), 0);
  // Completeness is judged against the modules that apply to this site.
  const applicableWeight = modules.filter((m) => m.applicable !== false).reduce((s, m) => s + weightOf(m.id), 0) || 1;
  const overall = w > 0 ? Math.round(scored.reduce((s, m) => s + (m.score as number) * weightOf(m.id), 0) / w) : null;
  const grade =
    overall === null || w / applicableWeight < 0.5 ? 'Incomplete' : overall >= 90 ? 'A' : overall >= 80 ? 'B' : overall >= 70 ? 'C' : overall >= 55 ? 'D' : 'F';

  return { overall, grade, modules, google: { mobile, desktop } };
}
