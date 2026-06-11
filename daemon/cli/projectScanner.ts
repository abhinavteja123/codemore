/**
 * Project Scanner — discovers files, builds rule contexts, runs the
 * registry across the project, and assembles a CodeMoreReport.
 *
 * Designed to be the single core call used by the CLI, the MCP server,
 * and (eventually) the daemon. Side-effects are scoped to file I/O.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as ts from 'typescript';

import {
  globalRegistry,
  type RegistryOptions,
} from '../../shared/rules/registry';
import type { RuleContext } from '../../shared/rules/Rule';
import {
  SCHEMA_VERSION,
  type CodeMoreReport,
  type ReportIssue,
  type ReportSummary,
  type SeverityCounts,
  type Severity,
} from '../../shared/report/types';
import {
  calculateHealthScore,
  calculateTechnicalDebt,
  type IssueSeverityCounts,
} from '../../shared/scoring';
import { toolVersion } from '../../shared/toolVersion';
import { createIgnoreResolver, type IgnoreResolver } from './ignoreResolver';
import { detectFrameworks } from './frameworkDetect';
import { loadCodemorerc } from './codemorercLoader';
import { buildProjectIndex } from './projectIndex';
import type { ProjectIndex } from '../../shared/rules/Rule';
import { parsePython } from '../../shared/rules/pythonAst';
import { runExternalTools, type ExternalToolDiagnostic } from '../external';

// Pinned skip set used as a hard fail-safe even when an external project
// has no .gitignore. `IgnoreResolver` carries the same set plus the
// project's own .gitignore + tsconfig.outDir for full coverage.
const UNIVERSAL_IGNORE_DIRS = new Set([
  'node_modules', '.git',
]);

// Extensions the registry currently knows how to dispatch to a rule.
// Expand as more language packs are wired up.
const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.sql',
  '.json', '.jsonc',
  '.yaml', '.yml',
  '.md', '.markdown',
  '.sh', '.bash', '.zsh',
  '.py', '.pyi',
]);

// File-size cap. Vibe-coded apps rarely have >2 MB hand-written files —
// anything bigger is usually a bundle, lockfile, or generated artifact.
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/**
 * Map (filename, extension) -> normalised language label used for rule routing.
 * Returns null when the file shouldn't be scanned at all.
 *
 * Multiple file shapes can produce one language label (e.g. .env / .env.local
 * / .env.production all -> 'env'). This decouples rules from extension trivia.
 */
function detectLanguage(filename: string, extension: string): string | null {
  // Env files are detected by basename prefix; they have no normal extension.
  if (filename === '.env' || filename.startsWith('.env.')) return 'env';

  // Dockerfile detection by exact basename (no extension).
  if (filename === 'Dockerfile' || filename.toLowerCase() === 'dockerfile') return 'dockerfile';

  switch (extension) {
    case '.ts': case '.tsx': case '.cts': case '.mts': return 'typescript';
    case '.js': case '.jsx': case '.mjs': case '.cjs': return 'javascript';
    case '.sql':                                       return 'sql';
    case '.py': case '.pyi':                           return 'python';
    case '.json': case '.jsonc':                       return 'json';
    case '.yaml': case '.yml':                         return 'yaml';
    case '.md': case '.markdown':                      return 'markdown';
    case '.sh': case '.bash': case '.zsh':             return 'shell';
    default:                                           return null;
  }
}

export interface ScanOptions extends RegistryOptions {
  /** Project root (absolute or relative; resolved before walking). */
  root: string;
  /** Glob-ish ignore patterns from .codemorerc.json (literal substrings for now). */
  ignore?: ReadonlyArray<string>;
  /** Cap per file. Files larger than this are skipped. */
  maxBytes?: number;
  /** Framework hints to attach to every RuleContext. */
  frameworks?: ReadonlyArray<string>;
  /**
   * External tool adapters to run alongside the native pack. Each tool's
   * findings are merged into the final report with rule ids namespaced as
   * `ext:<tool>:<original-rule-id>`. Off by default — the CLI's
   * `--external-tools` flag is what populates this.
   *
   * Recognised values: 'ruff' | 'golangci' | 'clippy' | 'biome'.
   */
  externalTools?: ReadonlyArray<
    'ruff' | 'golangci' | 'clippy' | 'biome'
    | 'bandit' | 'gitleaks' | 'npm-audit' | 'pip-audit'
  >;
  /**
   * When true, print every external-tool diagnostic (including chatty
   * info-level ones like "ran ok — 0 findings"). Otherwise only warn and
   * error diagnostics surface, plus the per-tool summary if the tool
   * silent-skipped. Threaded from the CLI's `--verbose` flag.
   */
  verbose?: boolean;
}

interface DiscoveredFile {
  absPath: string;
  relPath: string;
  extension: string;
  language: string;
}

function shouldIgnoreSegment(segment: string): boolean {
  return UNIVERSAL_IGNORE_DIRS.has(segment);
}

function walk(
  root: string,
  userIgnore: ReadonlyArray<string>,
  resolver: IgnoreResolver,
): DiscoveredFile[] {
  const out: DiscoveredFile[] = [];
  const rootAbs = path.resolve(root);

  function recur(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(rootAbs, full).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (shouldIgnoreSegment(entry.name)) continue;
        if (resolver.shouldIgnore(rel, 'dir')) continue;
        // Legacy explicit ignore patterns passed via opts.ignore — kept as
        // a substring fallback for old call sites; new code should use the
        // resolver's .codemorerc layer.
        if (userIgnore.length > 0 && userIgnore.some(p => rel.includes(p))) continue;
        recur(full);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      const language = detectLanguage(entry.name, ext);
      if (!language) continue;
      if (resolver.shouldIgnore(rel, 'file')) continue;
      if (userIgnore.length > 0 && userIgnore.some(p => rel.includes(p))) continue;

      out.push({ absPath: full, relPath: rel, extension: ext, language });
    }
  }

  recur(rootAbs);
  return out;
}

function parseIfTypeScript(filePath: string, content: string, ext: string): ts.SourceFile | null {
  if (!TS_EXTENSIONS.has(ext)) return null;
  try {
    const target = ts.ScriptTarget.Latest;
    return ts.createSourceFile(filePath, content, target, /* setParentNodes */ true);
  } catch {
    return null;
  }
}

async function buildContext(
  discovered: DiscoveredFile,
  content: string,
  frameworks: ReadonlyArray<string>,
  projectIndex: ProjectIndex | undefined,
): Promise<RuleContext> {
  let pythonAst: unknown = null;
  if (discovered.language === 'python') {
    pythonAst = await parsePython(content);
  }
  return {
    filePath: discovered.relPath,
    extension: discovered.extension,
    language: discovered.language,
    content,
    lines: content.split('\n'),
    sourceFile: parseIfTypeScript(discovered.relPath, content, discovered.extension),
    frameworks,
    projectIndex,
    pythonAst,
  };
}

function emptySeverityCounts(): SeverityCounts {
  return { BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 };
}

function countMeaningfulLines(content: string): number {
  let n = 0;
  for (const line of content.split('\n')) {
    if (line.trim().length > 0) n++;
  }
  return n;
}

function fingerprintProject(files: DiscoveredFile[]): string {
  const hash = crypto.createHash('sha256');
  for (const f of files.slice().sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    hash.update(f.relPath);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function summarise(
  issues: ReportIssue[],
  filesAnalyzed: number,
  linesOfCode: number,
): ReportSummary {
  const bySeverity: SeverityCounts = emptySeverityCounts();
  const byCategory: Record<string, number> = {};
  const issuesByFile = new Map<string, IssueSeverityCounts>();

  for (const iss of issues) {
    bySeverity[iss.severity]++;
    byCategory[iss.category] = (byCategory[iss.category] ?? 0) + 1;

    const file = iss.evidence.file;
    const counts = issuesByFile.get(file) ?? {
      BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0,
    };
    counts[iss.severity]++;
    issuesByFile.set(file, counts);
  }

  return {
    score: calculateHealthScore(issuesByFile, filesAnalyzed),
    issuesTotal: issues.length,
    bySeverity,
    byCategory,
    filesAnalyzed,
    linesOfCode,
    technicalDebtMinutes: calculateTechnicalDebt(bySeverity as IssueSeverityCounts),
  };
}

// Reason: public Promise-returning entry point. Today's body is synchronous
// but the signature is part of the registry/CLI contract; making it sync
// would break every caller and reserve no room for async framework probes
// (planned for Phase 2B's projectIndex builder).
// codemore-ignore-next-line: core-quality-async-without-await
export async function scanProject(opts: ScanOptions): Promise<CodeMoreReport> {
  const startedAt = Date.now();
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  // Load .codemorerc.json from the scan root (may be missing — loader
  // returns an empty result). User overrides win over caller defaults
  // for ignore + rules; for packs and experimental, caller wins so CLI
  // flags can override the file.
  const rc = loadCodemorerc(opts.root);

  const userIgnore = Array.from(new Set([
    ...(opts.ignore ?? []),
    ...rc.ignore,
  ]));

  const enabledPacks = (opts.enabledPacks && opts.enabledPacks.length > 0)
    ? opts.enabledPacks
    : (rc.packs.length > 0 ? rc.packs : undefined);

  const ruleOverrides = {
    ...rc.ruleOverrides,
    ...(opts.ruleOverrides ?? {}),
  };

  const enableExperimental =
    typeof opts.enableExperimental === 'boolean' ? opts.enableExperimental :
    typeof rc.experimental === 'boolean' ? rc.experimental : undefined;

  // Frameworks: union the caller-supplied list (typically empty in CLI mode)
  // with auto-detected signals from package.json + structural cues. Rules
  // with `targetFrameworks` declared filter on this set.
  const autoFrameworks = detectFrameworks(opts.root);
  const callerFrameworks = opts.frameworks ?? [];
  const frameworks = Array.from(new Set([...callerFrameworks, ...autoFrameworks]));

  const resolver = createIgnoreResolver(opts.root, {
    extraPatterns: userIgnore.length > 0 ? userIgnore : undefined,
  });
  const discovered = walk(opts.root, userIgnore, resolver);

  // Build the cross-file ProjectIndex once. Rules that don't need it
  // simply ignore the optional field; rules that DO need it can rely
  // on the same import-graph / route-inventory snapshot.
  const projectIndex = buildProjectIndex(opts.root);

  // Kick off external tools in parallel with the native walk. They run
  // against the same project root on disk, so they don't need the AST
  // we're about to build. Awaited only at the merge point.
  const externalToolsList = opts.externalTools ?? [];
  const externalPromise = externalToolsList.length > 0
    ? runExternalTools({ root: opts.root, tools: externalToolsList })
    : Promise.resolve({ issues: [], diagnostics: [] as ExternalToolDiagnostic[] });

  const issues: ReportIssue[] = [];
  let linesOfCode = 0;
  let filesAnalyzed = 0;

  for (const file of discovered) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file.absPath);
    } catch {
      continue;
    }
    if (stat.size > maxBytes) continue;

    let content: string;
    try {
      content = fs.readFileSync(file.absPath, 'utf8');
    } catch {
      continue;
    }

    const ctx = await buildContext(file, content, frameworks, projectIndex);
    const result = globalRegistry.scanFile(ctx, {
      enabledPacks,
      ruleOverrides,
      enableExperimental,
    });

    issues.push(...result.issues);
    linesOfCode += countMeaningfulLines(content);
    filesAnalyzed++;
  }

  // Merge external-tool findings.
  const externalResult = await externalPromise;
  issues.push(...externalResult.issues);
  // Show warn/error diagnostics by default so users know when biome /
  // ruff / etc. fell over. Hide chatty info ('ran ok — N findings')
  // behind --verbose unless the tool silent-skipped, in which case the
  // info IS the signal and we still print it.
  const verbose = opts.verbose === true;
  for (const d of externalResult.diagnostics) {
    const isRanOk = d.level === 'info' && /^ran ok/.test(d.message);
    if (!verbose && isRanOk) continue;
    process.stderr.write(`codemore: [${d.tool}] ${d.message}\n`);
  }

  const summary = summarise(issues, filesAnalyzed, linesOfCode);

  return {
    schemaVersion: SCHEMA_VERSION,
    scannedAt: new Date(startedAt).toISOString(),
    tool: { name: 'codemore', version: toolVersion() },
    project: {
      root: opts.root,
      framework: frameworks[0] ?? null,
      language: null,
      fingerprint: fingerprintProject(discovered),
    },
    summary,
    issues,
    agentInstructions: {
      preamble:
        'You are fixing issues found by CodeMore. Apply patches one issue at a time. ' +
        'After each fix, re-scan to confirm the rule no longer fires before moving on.',
      orderingHint: 'blockers \u2192 criticals \u2192 majors',
      doNotTouch: ['node_modules/**', '*.lock', '.env*'],
      stopOn: 'first-validator-failure',
    },
    meta: {
      rulesEnabled: globalRegistry.size(),
      packsLoaded: globalRegistry.packs(),
      scanDurationMs: Date.now() - startedAt,
    },
  };
}

/** Helper for tests: a quick file count without running the registry. */
export function discoverFiles(root: string, userIgnore: ReadonlyArray<string> = []): string[] {
  return walk(root, userIgnore, createIgnoreResolver(root, { extraPatterns: userIgnore })).map(f => f.relPath);
}

/** Severity priority for fail-on threshold checks. */
const SEVERITY_RANK: Record<Severity, number> = {
  BLOCKER: 5, CRITICAL: 4, MAJOR: 3, MINOR: 2, INFO: 1,
};

export function reportExceeds(report: CodeMoreReport, failOn: Severity): boolean {
  const threshold = SEVERITY_RANK[failOn];
  for (const iss of report.issues) {
    if (SEVERITY_RANK[iss.severity] >= threshold) return true;
  }
  return false;
}
