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
import { sendTelemetry } from '../telemetry';
import type { CodeMoreReport, Severity } from '../../../shared/report/types';
import { applyBaseline, isBaselineFile, isCountedForFailOn } from '../baselineDiff';
import { toSarif } from '../../../shared/report/sarif';
import { color, severityColor, scoreColor } from '../colors';

export type ExternalToolId =
  | 'ruff' | 'golangci' | 'clippy' | 'biome'
  | 'bandit' | 'gitleaks' | 'npm-audit' | 'pip-audit';
const VALID_EXTERNAL_TOOLS: ReadonlyArray<ExternalToolId> = [
  'ruff', 'golangci', 'clippy', 'biome',
  'bandit', 'gitleaks', 'npm-audit', 'pip-audit',
];

export interface ScanArgs {
  path: string;
  json: boolean;
  /** Machine output format for --json / --out. Default 'json'. */
  format: 'json' | 'sarif';
  out?: string;
  failOn?: Severity;
  packs?: string[];
  enableExperimental: boolean;
  frameworks: string[];
  /** Path to a baseline file produced by `codemore baseline create`. */
  baseline?: string;
  /** External tool adapters to engage. Empty/undefined = native pack only. */
  externalTools?: ExternalToolId[];
  /** Opt-in: send aggregate findings to telemetry endpoint. Default false. */
  telemetry: boolean;
  /** Print every external-tool diagnostic (including "ran ok" info lines). */
  verbose: boolean;
  /** Honor .gitignore even for secret-shaped filenames (.env*, *.pem,
   *  firebase-adminsdk*.json, etc.). Default false — we BYPASS .gitignore
   *  for those because devs often hide leaked secrets there. */
  respectGitignoreFully: boolean;
}

const SEVERITIES: ReadonlyArray<Severity> = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];

function isSeverity(value: string): value is Severity {
  return (SEVERITIES as ReadonlyArray<string>).includes(value);
}

export function parseScanArgs(argv: string[]): ScanArgs {
  let positional: string | undefined;
  let json = false;
  let format: 'json' | 'sarif' = 'json';
  let out: string | undefined;
  let failOn: Severity | undefined;
  let packs: string[] | undefined;
  let enableExperimental = false;
  let baseline: string | undefined;
  let externalTools: ExternalToolId[] | undefined;
  let telemetry = false;
  let verbose = false;
  let respectGitignoreFully = false;
  const frameworks: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--json':
        json = true;
        break;
      case '--format': {
        const v = (argv[++i] ?? '').toLowerCase();
        if (v !== 'json' && v !== 'sarif') throw new Error(`--format expects "json" or "sarif"; got "${v}"`);
        format = v;
        if (v === 'sarif') json = true; // SARIF is machine output; implies non-human stdout
        break;
      }
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
      case '--telemetry':
        telemetry = true;
        break;
      case '--no-telemetry':
        telemetry = false;
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--respect-gitignore-fully':
        respectGitignoreFully = true;
        break;
      case '--external-tools': {
        const v = (argv[++i] ?? '').trim();
        if (!v) throw new Error(
          '--external-tools expects a comma-separated list of tool names ' +
          `or "all" (one of: ${VALID_EXTERNAL_TOOLS.join(', ')})`);
        const names = v === 'all'
          ? [...VALID_EXTERNAL_TOOLS]
          : v.split(',').map(s => s.trim()).filter(Boolean);
        for (const name of names) {
          if (!(VALID_EXTERNAL_TOOLS as ReadonlyArray<string>).includes(name)) {
            throw new Error(
              `--external-tools: unknown tool "${name}" (expected one of: ${VALID_EXTERNAL_TOOLS.join(', ')})`);
          }
        }
        externalTools = names as ExternalToolId[];
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
    format,
    out,
    failOn,
    packs,
    enableExperimental,
    frameworks,
    baseline,
    externalTools,
    telemetry,
    verbose,
    respectGitignoreFully,
  };
}

function printHumanSummary(report: CodeMoreReport): void {
  const s = report.summary;
  const w = (n: number) => String(n).padStart(4);
  const sevLabel = (sev: Severity, n: number) => severityColor(sev)(`${sev}=${w(n)}`);

  process.stderr.write(
    `\n${color.bold('CodeMore scan')}: ${report.project.root}\n` +
    `  Score:       ${scoreColor(s.score)(`${s.score}/100`)}\n` +
    `  Files:       ${s.filesAnalyzed}  (${s.linesOfCode} LOC)\n` +
    `  Tech debt:   ${Math.round(s.technicalDebtMinutes)} min\n` +
    `  Severity:    ${sevLabel('BLOCKER', s.bySeverity.BLOCKER)} ${sevLabel('CRITICAL', s.bySeverity.CRITICAL)} ${sevLabel('MAJOR', s.bySeverity.MAJOR)} ${sevLabel('MINOR', s.bySeverity.MINOR)} ${sevLabel('INFO', s.bySeverity.INFO)}\n` +
    `  Rules run:   ${report.meta?.rulesEnabled ?? '?'}  Packs: ${(report.meta?.packsLoaded ?? []).join(', ') || '(none)'}\n\n`,
  );

  if (report.issues.length === 0) {
    process.stderr.write(`${color.green('✓ No issues found.')}\n`);
    return;
  }

  const max = 25;
  const shown = report.issues
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, max);

  const byFile = new Map<string, typeof shown>();
  for (const iss of shown) {
    const list = byFile.get(iss.evidence.file) ?? [];
    list.push(iss);
    byFile.set(iss.evidence.file, list);
  }

  process.stderr.write(`Top ${shown.length} of ${report.issues.length} issues, by file:\n`);
  for (const [file, issues] of byFile) {
    process.stderr.write(`\n  ${color.bold(file)} ${color.gray(`(${issues.length})`)}\n`);
    for (const iss of issues) {
      process.stderr.write(
        `    ${severityColor(iss.severity)(iss.severity.padEnd(8))} :${iss.evidence.line}  ${iss.title} ${color.gray(`[${iss.id}]`)}\n`,
      );
    }
  }
  if (report.issues.length > max) {
    process.stderr.write(`\n  ${color.gray(`... and ${report.issues.length - max} more (use --json for full output)`)}\n`);
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
    externalTools: args.externalTools,
    verbose: args.verbose,
    respectGitignoreFully: args.respectGitignoreFully,
  });

  // Telemetry: opt-in, best-effort. We await with a hard 3s cap so the
  // CLI exits even if the endpoint is unreachable — but we DO wait so the
  // fetch completes when the user explicitly asked us to send.
  if (args.telemetry) {
    try {
      const ok = await sendTelemetry(report, 'cli');
      if (!ok) process.stderr.write('codemore: telemetry not recorded (network or schema error)\n');
    } catch {
      /* swallow */
    }
  }

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

  const machineOutput = () =>
    JSON.stringify(args.format === 'sarif' ? toSarif(report) : report, null, 2);

  if (args.json) {
    process.stdout.write(machineOutput() + '\n');
  } else {
    printHumanSummary(report);
  }

  if (args.out) {
    fs.writeFileSync(args.out, machineOutput());
    process.stderr.write(`${args.format === 'sarif' ? 'SARIF report' : 'Report'} written to ${args.out}\n`);
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
