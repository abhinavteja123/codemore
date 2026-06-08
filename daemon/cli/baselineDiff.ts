/**
 * Baseline / diff mode — the adoption gate for existing projects.
 *
 * A baseline file lists "issues that already existed when the project
 * adopted CodeMore". When `--baseline <file>` is given to `scan`, every
 * issue is annotated with one of:
 *
 *   'baseline' — present in baseline AND in current scan (pre-existing,
 *                informational)
 *   'new'      — absent from baseline, present in current scan
 *                (actionable; gates `--fail-on`)
 *   'resolved' — present in baseline, absent from current scan
 *                (synthetic issue prepended so consumers can celebrate)
 *
 * Bucketing key: { ruleId, file, lineBucket } where lineBucket = floor(line/5).
 * The bucket tolerates trivial line drift (imports added, reformatting)
 * without breaking the match. We deliberately ignore the snippet to avoid
 * brittle string-equality matches.
 */

import type { CodeMoreReport, ReportIssue, BaselineStatus } from '../../shared/report/types';

const LINE_BUCKET_SIZE = 5;

export interface BaselineFileV1 {
  schemaVersion: '1.0.0';
  baseline: 'codemore';
  createdAt: string;
  /** Stable, normalised keys; sorted for diff-friendliness. */
  keys: string[];
  /** Counts kept so consumers don't need to re-derive. */
  summary: {
    totalKeys: number;
    byRule: Record<string, number>;
  };
}

function lineBucket(line: number): number {
  return Math.floor(Math.max(0, line) / LINE_BUCKET_SIZE);
}

/** Normalise a file path so baselines survive being committed across OSes. */
function normaliseFile(file: string): string {
  return file.replace(/\\/g, '/');
}

export function issueKey(iss: { id: string; evidence: { file: string; line: number } }): string {
  return `${iss.id}|${normaliseFile(iss.evidence.file)}|${lineBucket(iss.evidence.line)}`;
}

/**
 * Build a baseline file payload from a report. Sorted output so two scans
 * of the same project produce identical bytes — clean git diffs.
 */
export function buildBaseline(report: CodeMoreReport): BaselineFileV1 {
  const keySet = new Set<string>();
  for (const iss of report.issues) keySet.add(issueKey(iss));

  // Derive byRule from deduped keys so totalKeys == sum(byRule).
  const byRule: Record<string, number> = {};
  for (const key of keySet) {
    const ruleId = key.split('|', 1)[0];
    byRule[ruleId] = (byRule[ruleId] ?? 0) + 1;
  }

  const keys = Array.from(keySet).sort();
  return {
    schemaVersion: '1.0.0',
    baseline: 'codemore',
    createdAt: new Date().toISOString(),
    keys,
    summary: {
      totalKeys: keys.length,
      byRule,
    },
  };
}

/** Shape-check a loaded JSON blob before treating it as a baseline. */
export function isBaselineFile(v: unknown): v is BaselineFileV1 {
  if (!v || typeof v !== 'object') return false;
  const o = v as Partial<BaselineFileV1>;
  return o.baseline === 'codemore'
    && typeof o.schemaVersion === 'string'
    && Array.isArray(o.keys);
}

export interface ApplyBaselineResult {
  /** Total issues classified as 'new'. Used to gate `--fail-on`. */
  newCount: number;
  /** Total issues classified as 'baseline' (pre-existing). */
  baselineCount: number;
  /** Synthetic 'resolved' issues injected for keys missing from current scan. */
  resolvedCount: number;
}

/**
 * Mutates `report.issues` to set `baselineStatus` on every entry, and
 * appends synthetic 'resolved' placeholders for keys in the baseline that
 * are no longer present. Returns the counts.
 */
export function applyBaseline(report: CodeMoreReport, baseline: BaselineFileV1): ApplyBaselineResult {
  const baselineKeys = new Set(baseline.keys);
  const currentKeys = new Set<string>();

  let newCount = 0;
  let baselineCount = 0;

  for (const iss of report.issues) {
    const key = issueKey(iss);
    currentKeys.add(key);
    if (baselineKeys.has(key)) {
      iss.baselineStatus = 'baseline';
      baselineCount++;
    } else {
      iss.baselineStatus = 'new';
      newCount++;
    }
  }

  // Synthetic 'resolved' entries — keys in baseline but not in current
  // scan. These let the consumer celebrate progress without re-running
  // the prior baseline scan.
  let resolvedCount = 0;
  for (const key of baselineKeys) {
    if (currentKeys.has(key)) continue;
    const [ruleId, file, bucketStr] = key.split('|');
    const synthetic: ReportIssue = {
      id: ruleId,
      ruleVersion: '0.0.0',
      instanceId: `resolved:${key}`,
      severity: 'INFO',
      confidence: 1,
      category: 'best-practice',
      title: `Resolved: ${ruleId}`,
      evidence: {
        file,
        line: Number(bucketStr) * LINE_BUCKET_SIZE,
        column: 1,
        snippet: '(no longer present)',
      },
      whyItMatters: 'This finding was in the baseline but is no longer reported. Nothing to do.',
      citation: `https://codemore.dev/rules/${ruleId}`,
      baselineStatus: 'resolved' satisfies BaselineStatus,
    };
    report.issues.push(synthetic);
    resolvedCount++;
  }

  return { newCount, baselineCount, resolvedCount };
}

/**
 * Filter helper used by `--fail-on` once a baseline is present: only
 * 'new' issues count toward the threshold.
 */
export function isCountedForFailOn(iss: ReportIssue): boolean {
  // When baselineStatus is absent, scanning was run without --baseline:
  // every issue counts (legacy behaviour).
  if (iss.baselineStatus === undefined) return true;
  return iss.baselineStatus === 'new';
}
