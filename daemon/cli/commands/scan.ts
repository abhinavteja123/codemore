/**
 * `codemore scan <path>` — scan a project directory and emit a CodeMoreReport.
 *
 * Examples:
 *   codemore scan .
 *   codemore scan ./my-app --json
 *   codemore scan ./my-app --out report.json --fail-on BLOCKER
 *   codemore scan ./fixtures/tp --json --enable-experimental
 */

import * as fs from 'fs';
import * as path from 'path';

import { registerAllPacks } from '../registerPacks';
import { scanProject, reportExceeds } from '../projectScanner';
import type { CodeMoreReport, Severity } from '../../../shared/report/types';
import { applyBaseline, isBaselineFile, isCountedForFailOn } from '../baselineDiff';

export interface ScanArgs {
  path: string;
  json: boolean;
  out?: string;
  failOn?: Severity;
  packs?: string[];
  enableExperimental: boolean;
  frameworks: string[];
  /** Path to a baseline file produced by `codemore baseline create`. */
  baseline?: string;
}

const SEVERITIES: ReadonlyArray<Severity> = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];

function isSeverity(value: string): value is Severity {
  return (SEVERITIES as ReadonlyArray<string>).includes(value);
}

export function parseScanArgs(argv: string[]): ScanArgs {
  let positional: string | undefined;
  let json = false;
  let out: string | undefined;
  let failOn: Severity | undefined;
  let packs: string[] | undefined;
  let enableExperimental = false;
  let baseline: string | undefined;
  const frameworks: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--json':
        json = true;
        break;
      case '--out':
        out = argv[++i];
        break;
      case '--fail-on': {
        const v = (argv[++i] ?? '').toUpperCase();
        if (!isSeverity(v)) throw new Error(`--fail-on expects one of ${SEVERITIES.join(', ')}; got "${v}"`);
        failOn = v;
        break;
      }
      case '--packs': {
        const v = argv[++i] ?? '';
        packs = v.split(',').map(s => s.trim()).filter(Boolean);
        break;
      }
      case '--enable-experimental':
        enableExperimental = true;
        break;
      case '--framework': {
        const v = argv[++i] ?? '';
        for (const f of v.split(',').map(s => s.trim())) if (f) frameworks.push(f);
        break;
      }
      case '--baseline': {
        baseline = argv[++i];
        if (!baseline) throw new Error('--baseline expects a file path');
        break;
      }
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
        if (positional) throw new Error(`Unexpected positional: ${arg}`);
        positional = arg;
    }
  }

  if (!positional) throw new Error('Missing required <path> argument.\nUsage: codemore scan <path> [--json] [--out file] [--fail-on SEVERITY]');

  return {
    path: positional,
    json,
    out,
    failOn,
    packs,
    enableExperimental,
    frameworks,
    baseline,
  };
}

function printHumanSummary(report: CodeMoreReport): void {
  const s = report.summary;
  const w = (n: number) => String(n).padStart(4);

  process.stderr.write(
    `\nCodeMore scan: ${report.project.root}\n` +
    `  Score:       ${s.score}/100\n` +
    `  Files:       ${s.filesAnalyzed}  (${s.linesOfCode} LOC)\n` +
    `  Tech debt:   ${Math.round(s.technicalDebtMinutes)} min\n` +
    `  Severity:    BLOCKER=${w(s.bySeverity.BLOCKER)} CRITICAL=${w(s.bySeverity.CRITICAL)} MAJOR=${w(s.bySeverity.MAJOR)} MINOR=${w(s.bySeverity.MINOR)} INFO=${w(s.bySeverity.INFO)}\n` +
    `  Rules run:   ${report.meta?.rulesEnabled ?? '?'}  Packs: ${(report.meta?.packsLoaded ?? []).join(', ') || '(none)'}\n\n`,
  );

  if (report.issues.length === 0) {
    process.stderr.write('No issues found.\n');
    return;
  }

  const max = 25;
  process.stderr.write(`Top ${Math.min(max, report.issues.length)} of ${report.issues.length} issues:\n`);
  const sorted = report.issues
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  for (const iss of sorted.slice(0, max)) {
    process.stderr.write(
      `  [${iss.severity.padEnd(8)}] ${iss.evidence.file}:${iss.evidence.line}  ${iss.id}\n` +
      `             ${iss.title}\n`,
    );
  }
  if (report.issues.length > max) {
    process.stderr.write(`  ... and ${report.issues.length - max} more (use --json for full output)\n`);
  }
}

function severityRank(s: Severity): number {
  switch (s) {
    case 'BLOCKER': return 5;
    case 'CRITICAL': return 4;
    case 'MAJOR': return 3;
    case 'MINOR': return 2;
    case 'INFO': return 1;
  }
}

export async function runScan(args: ScanArgs): Promise<number> {
  registerAllPacks();

  const rootAbs = path.resolve(args.path);
  if (!fs.existsSync(rootAbs)) {
    process.stderr.write(`codemore: path not found: ${rootAbs}\n`);
    return 2;
  }

  const report = await scanProject({
    root: rootAbs,
    enabledPacks: args.packs,
    enableExperimental: args.enableExperimental,
    frameworks: args.frameworks,
  });

  let baselineApplied = false;
  if (args.baseline) {
    const baselineAbs = path.resolve(args.baseline);
    if (!fs.existsSync(baselineAbs)) {
      process.stderr.write(`codemore: baseline file not found: ${baselineAbs}\n`);
      return 2;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(baselineAbs, 'utf8'));
    } catch (err) {
      process.stderr.write(`codemore: baseline file is not valid JSON: ${(err as Error).message}\n`);
      return 2;
    }
    if (!isBaselineFile(parsed)) {
      process.stderr.write(`codemore: ${baselineAbs} is not a valid CodeMore baseline file\n`);
      return 2;
    }
    const r = applyBaseline(report, parsed);
    baselineApplied = true;
    process.stderr.write(
      `Baseline applied (${baselineAbs}):\n` +
      `  new:      ${r.newCount}\n` +
      `  baseline: ${r.baselineCount} (pre-existing, not failing CI)\n` +
      `  resolved: ${r.resolvedCount}\n\n`,
    );
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    printHumanSummary(report);
  }

  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
    process.stderr.write(`Report written to ${args.out}\n`);
  }

  if (args.failOn) {
    const exceeded = baselineApplied
      ? reportExceedsForFailOn(report, args.failOn)
      : reportExceeds(report, args.failOn);
    if (exceeded) {
      const scope = baselineApplied ? ' (new since baseline)' : '';
      process.stderr.write(`codemore: failing because at least one issue${scope} is >= ${args.failOn}\n`);
      return 1;
    }
  }
  return 0;
}

/**
 * Baseline-aware fail-on check: counts only issues with baselineStatus 'new'.
 * Used in place of `reportExceeds` when a baseline file is supplied.
 */
function reportExceedsForFailOn(report: CodeMoreReport, failOn: Severity): boolean {
  const threshold = severityRank(failOn);
  for (const iss of report.issues) {
    if (!isCountedForFailOn(iss)) continue;
    if (severityRank(iss.severity) >= threshold) return true;
  }
  return false;
}
