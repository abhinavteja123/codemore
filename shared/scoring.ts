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
 * Calculate the overall health score across all analyzed files.
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

  return Math.round(sumScores / totalFilesInScore);
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
  return calculateFileHealthScore(normalized);
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
