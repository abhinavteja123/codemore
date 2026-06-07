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

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.next', '.git', 'out', 'coverage',
  '.vscode', '.idea', '.cache', 'target', '.svelte-kit', '.turbo',
  // CodeMore-internal: the corpus dir holds intentionally-bad fixtures used
  // by the rule-PR validator. They must never be flagged by a normal scan.
  // The validator invokes the CLI with corpus/rules/<id>/{tp,fp} as the
  // explicit root, which bypasses this ignore.
  'corpus',
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
}

interface DiscoveredFile {
  absPath: string;
  relPath: string;
  extension: string;
  language: string;
}

function shouldIgnoreSegment(segment: string): boolean {
  if (DEFAULT_IGNORE_DIRS.has(segment)) return true;
  // Skip hidden dotfile directories (.git, .next, .cache) but not the current dir.
  // Note: we do NOT skip dotfile FILES here (.env, .codemorerc.json); files are
  // routed through detectLanguage() below.
  return segment.startsWith('.') && segment !== '.' && segment !== '..';
}

function matchesUserIgnore(relPath: string, patterns: ReadonlyArray<string>): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return patterns.some(p => norm.includes(p));
}

function walk(root: string, userIgnore: ReadonlyArray<string>): DiscoveredFile[] {
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
      const rel = path.relative(rootAbs, full);

      if (entry.isDirectory()) {
        if (shouldIgnoreSegment(entry.name)) continue;
        if (matchesUserIgnore(rel, userIgnore)) continue;
        recur(full);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      const language = detectLanguage(entry.name, ext);
      if (!language) continue;
      if (matchesUserIgnore(rel, userIgnore)) continue;

      out.push({ absPath: full, relPath: rel.replace(/\\/g, '/'), extension: ext, language });
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

function buildContext(
  discovered: DiscoveredFile,
  content: string,
  frameworks: ReadonlyArray<string>,
): RuleContext {
  return {
    filePath: discovered.relPath,
    extension: discovered.extension,
    language: discovered.language,
    content,
    lines: content.split('\n'),
    sourceFile: parseIfTypeScript(discovered.relPath, content, discovered.extension),
    frameworks,
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

export async function scanProject(opts: ScanOptions): Promise<CodeMoreReport> {
  const startedAt = Date.now();
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const userIgnore = opts.ignore ?? [];
  const frameworks = opts.frameworks ?? [];

  const discovered = walk(opts.root, userIgnore);
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

    const ctx = buildContext(file, content, frameworks);
    const result = globalRegistry.scanFile(ctx, opts);

    issues.push(...result.issues);
    linesOfCode += countMeaningfulLines(content);
    filesAnalyzed++;
  }

  const summary = summarise(issues, filesAnalyzed, linesOfCode);

  return {
    schemaVersion: SCHEMA_VERSION,
    scannedAt: new Date(startedAt).toISOString(),
    tool: { name: 'codemore', version: '1.1.0' },
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
  return walk(root, userIgnore).map(f => f.relPath);
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
