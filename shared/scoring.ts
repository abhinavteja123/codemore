/**
 * CodeMore Health Score Calculation
 *
 * Centralized health scoring logic used by both the daemon (contextMap.ts)
 * and the web app (productionAnalyzer.ts).
 *
 * Scoring model:
 * Each file starts at 100 and loses points per issue found.
 * The overall score is the AVERAGE across all files analyzed.
 * This scales correctly regardless of codebase size.
 *
 * Per-file deductions:
 *   BLOCKER:  -15 per issue
 *   CRITICAL: -10 per issue
 *   MAJOR:    -5  per issue
 *   MINOR:    -2  per issue
 *   INFO:     -0.5 per issue (reduced — style hints are low weight)
 *
 * Score of 100 = file/codebase has zero issues
 * Score of 0   = file/codebase has 7+ BLOCKERs or 10+ CRITICALs
 */

export interface IssueSeverityCounts {
  BLOCKER: number;
  CRITICAL: number;
  MAJOR: number;
  MINOR: number;
  INFO: number;
}

export const SEVERITY_WEIGHTS: Record<keyof IssueSeverityCounts, number> = {
  BLOCKER:  15,
  CRITICAL: 10,
  MAJOR:    5,
  MINOR:    2,
  INFO:     0.5,  // Reduced from 1 — INFO should not dominate the score
};

/**
 * Calculate the health score for a single file.
 *
 * @param counts - The count of issues by severity level
 * @returns A score from 0 to 100, where higher is better
 */
export function calculateFileHealthScore(
  counts: IssueSeverityCounts
): number {
  let score = 100;
  for (const [sev, weight] of Object.entries(SEVERITY_WEIGHTS)) {
    score -= (counts[sev as keyof IssueSeverityCounts] ?? 0) * weight;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Project-level severity cap.
 *
 * The per-file average alone is misleading on large codebases: hundreds of
 * clean files dilute the average, so a project with 300 findings — including
 * live BLOCKERs — can still read 96/100. A codebase with a BLOCKER anywhere
 * is not "excellent" no matter how many clean files surround it, so the
 * aggregate score is capped by the worst severity present:
 *
 *   any BLOCKER:   cap 59, −3 per additional BLOCKER, floor 25
 *   else CRITICAL: cap 79, −2 per additional CRITICAL, floor 45
 *   else:          no cap (MAJOR/MINOR/INFO density is already priced into
 *                  the per-file average)
 */
export function severityCap(totals: Pick<IssueSeverityCounts, 'BLOCKER' | 'CRITICAL'>): number {
  if (totals.BLOCKER > 0) {
    return Math.max(25, 59 - (totals.BLOCKER - 1) * 3);
  }
  if (totals.CRITICAL > 0) {
    return Math.max(45, 79 - (totals.CRITICAL - 1) * 2);
  }
  return 100;
}

/**
 * Calculate the overall health score across all analyzed files.
 *
 * Base score is the per-file average (scales with codebase size); the
 * result is then capped by `severityCap` so BLOCKERs/CRITICALs anywhere
 * always pull the headline number out of the "healthy" range.
 *
 * @param issuesByFile - Map of file paths to their issue counts
 * @param filesAnalyzed - Total number of files analyzed
 * @returns A score from 0 to 100, where higher is better
 */
export function calculateHealthScore(
  issuesByFile: Map<string, IssueSeverityCounts>,
  filesAnalyzed: number
): number {
  if (filesAnalyzed === 0) return 0;
  if (issuesByFile.size === 0) return 100;

  const fileScores = Array.from(issuesByFile.values())
    .map(calculateFileHealthScore);

  // Files with no issues contribute 100 to the average
  const totalFilesInScore = Math.max(filesAnalyzed, issuesByFile.size);
  const cleanFiles = totalFilesInScore - fileScores.length;
  const sumScores = fileScores.reduce((a, b) => a + b, 0) + (cleanFiles * 100);
  const base = Math.round(sumScores / totalFilesInScore);

  const totals = { BLOCKER: 0, CRITICAL: 0 };
  for (const counts of issuesByFile.values()) {
    totals.BLOCKER += counts.BLOCKER ?? 0;
    totals.CRITICAL += counts.CRITICAL ?? 0;
  }
  return Math.min(base, severityCap(totals));
}

/**
 * Legacy single-aggregate overload — kept for backward compatibility.
 * Prefer the per-file version above for accurate results.
 *
 * This function normalizes the total issue counts by dividing by file count
 * before scoring, which approximates a per-file average without requiring
 * per-file data.
 *
 * @param counts - The total count of issues across all files
 * @param filesAnalyzed - Number of files analyzed
 * @returns A score from 0 to 100, where higher is better
 */
export function calculateHealthScoreFromTotals(
  counts: IssueSeverityCounts,
  filesAnalyzed: number
): number {
  if (filesAnalyzed === 0) return 0;

  // Normalize by dividing total issues by file count before scoring
  const normalized: IssueSeverityCounts = {
    BLOCKER:  Math.ceil(counts.BLOCKER  / filesAnalyzed),
    CRITICAL: Math.ceil(counts.CRITICAL / filesAnalyzed),
    MAJOR:    Math.ceil(counts.MAJOR    / filesAnalyzed),
    MINOR:    Math.ceil(counts.MINOR    / filesAnalyzed),
    INFO:     Math.ceil(counts.INFO     / filesAnalyzed),
  };
  return Math.min(calculateFileHealthScore(normalized), severityCap(counts));
}

/**
 * Calculate technical debt in minutes based on issue severity.
 */
export function calculateTechnicalDebt(counts: IssueSeverityCounts): number {
  return (
    counts.BLOCKER * 120 +
    counts.CRITICAL * 60 +
    counts.MAJOR * 30 +
    counts.MINOR * 10 +
    counts.INFO * 5
  );
}
