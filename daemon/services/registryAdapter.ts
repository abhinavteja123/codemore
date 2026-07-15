/**
 * Registry adapter — the bridge that lets the VS Code extension consume
 * the new rule-registry pipeline (shared/rules/, shared/packs/) while
 * still using the legacy CodeIssue protocol shape.
 *
 * Why this exists:
 *   - The new registry produces ReportIssue records (typed, schema-stable).
 *   - The extension webview + diagnostic collection were built against the
 *     legacy CodeIssue shape (CodeIssue.location.startLine, etc.).
 *   - Mapping in one place lets us swap the underlying scanner without
 *     touching the extension UI. The legacy `staticAnalyzer.ts` monolith
 *     becomes dead code once the per-file path also moves over.
 *
 * Severity mapping is the only non-obvious piece: the new pipeline emits
 * the canonical Severity (BLOCKER..INFO); the legacy CodeIssue carries
 * both `severity` (canonical) and `oldSeverity` for back-compat — we set
 * both so any UI still reading the old field keeps working.
 */

import * as path from 'path';
import * as ts from 'typescript';
import { scanProject } from '../cli/projectScanner';
import { registerAllPacks } from '../cli/registerPacks';
import { buildProjectIndex } from '../cli/projectIndex';
import { globalRegistry } from '../../shared/rules/registry';
import type { ProjectIndex, RuleContext } from '../../shared/rules/Rule';
import type { CodeMoreReport, ReportIssue, Severity } from '../../shared/report/types';
import type { CodeIssue, OldSeverity, IssueCategory } from '../../shared/protocol';

/**
 * Most-recently-built ProjectIndex per workspace root. The per-file save
 * hot path can't afford to rebuild the index every keystroke (~200ms on a
 * 1k-file project), so we cache the one produced by the last full scan
 * and serve it stale. When the cache is empty (no full scan has run yet
 * this session), project-level rules simply skip on file-save and fire
 * on the next workspace scan instead.
 */
const projectIndexCache = new Map<string, ProjectIndex>();

const CANONICAL_TO_OLD: Record<Severity, OldSeverity> = {
  BLOCKER: 'error',
  CRITICAL: 'error',
  MAJOR: 'warning',
  MINOR: 'warning',
  INFO: 'info',
};

let registryReady = false;
function ensureRegistry(): void {
  if (registryReady) return;
  registerAllPacks();
  registryReady = true;
}

/**
 * Map a single ReportIssue → CodeIssue. The CodeIssue.location uses
 * absolute paths (the extension's diagnostic collection works that way),
 * so we resolve evidence.file against the scan root.
 *
 * When `rootAbs` is omitted, evidence.file is kept as-is (relative) —
 * the web surface scans a throwaway temp dir and must not leak server
 * filesystem paths into issue locations.
 */
export function reportIssueToCodeIssue(
  iss: ReportIssue,
  rootAbs?: string,
): CodeIssue {
  const fileAbs = rootAbs === undefined
    ? iss.evidence.file
    : path.isAbsolute(iss.evidence.file)
      ? iss.evidence.file
      : path.resolve(rootAbs, iss.evidence.file);

  const startLine = iss.evidence.line;
  const startColumn = iss.evidence.column;
  const endLine = iss.evidence.endLine ?? startLine;
  const endColumn = iss.evidence.endColumn ?? (startColumn + 1);

  return {
    id: iss.instanceId,
    title: iss.title,
    description: iss.whyItMatters,
    category: iss.category as IssueCategory,
    severity: iss.severity,
    oldSeverity: CANONICAL_TO_OLD[iss.severity],
    location: {
      filePath: fileAbs,
      range: {
        start: { line: startLine, column: startColumn },
        end:   { line: endLine,   column: endColumn },
      },
    },
    codeSnippet: iss.evidence.snippet,
    confidence: Math.round(iss.confidence * 100),
    // The legacy `impact` was a 0-100 score the AI emitted; we use the
    // severity rank as a coarse stand-in so the UI's sort-by-impact path
    // still puts the right things on top.
    impact: severityImpact(iss.severity),
    createdAt: Date.now(),
  };
}

function severityImpact(s: Severity): number {
  switch (s) {
    case 'BLOCKER':  return 100;
    case 'CRITICAL': return 85;
    case 'MAJOR':    return 65;
    case 'MINOR':    return 35;
    case 'INFO':     return 15;
  }
}

export interface RegistryScanOptions {
  enableExperimental?: boolean;
  enabledPacks?: string[];
  frameworks?: string[];
}

export interface RegistryScanResult {
  issues: CodeIssue[];
  report: CodeMoreReport;
}

/**
 * Run a full registry scan of `workspacePath` and return both the
 * legacy-shape CodeIssue[] (for the webview) and the full schema-stable
 * report (for the MCP-compatible export path).
 *
 * Side-effect: ensures all rule packs are registered on first call.
 */
export async function runRegistryScan(
  workspacePath: string,
  opts: RegistryScanOptions = {},
): Promise<RegistryScanResult> {
  ensureRegistry();
  const rootAbs = path.resolve(workspacePath);
  const report = await scanProject({
    root: rootAbs,
    enableExperimental: opts.enableExperimental,
    enabledPacks: opts.enabledPacks,
    frameworks: opts.frameworks ?? [],
  });
  // Refresh the ProjectIndex cache so subsequent file-save scans benefit.
  try {
    projectIndexCache.set(rootAbs, buildProjectIndex(rootAbs));
  } catch {
    // Index build failures degrade silently — file-save scans just lose
    // the project-level rules until the next full scan succeeds.
  }
  const issues = report.issues.map(i => reportIssueToCodeIssue(i, rootAbs));
  return { issues, report };
}

// ---------------------------------------------------------------------------
// Per-file registry scan (used by analyzeFile + the file-watcher queue)
// ---------------------------------------------------------------------------

const TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function detectLanguageForRegistry(filename: string, ext: string): string | null {
  if (filename === '.env' || filename.startsWith('.env.')) return 'env';
  if (filename.toLowerCase() === 'dockerfile') return 'dockerfile';
  switch (ext) {
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

/**
 * Scan a single file via the rule registry (no walker, no sibling files).
 * Used by the file-save / file-watcher hot paths. Same code the CLI runs
 * inside its per-file loop — different entry point so it's cheap to call
 * one file at a time without re-walking the whole workspace.
 */
export function scanFileWithRegistry(
  workspacePath: string,
  absFilePath: string,
  content: string,
  opts: RegistryScanOptions = {},
): CodeIssue[] {
  ensureRegistry();
  const rootAbs = path.resolve(workspacePath);
  const relPath = path.relative(rootAbs, absFilePath).replace(/\\/g, '/') || path.basename(absFilePath);
  const ext = path.extname(absFilePath).toLowerCase();
  const language = detectLanguageForRegistry(path.basename(absFilePath), ext);
  if (!language) return [];

  let sourceFile: ts.SourceFile | null = null;
  if (TS_EXTS.has(ext)) {
    try {
      sourceFile = ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, /* setParentNodes */ true);
    } catch {
      sourceFile = null;
    }
  }

  const ctx: RuleContext = {
    filePath: relPath,
    extension: ext,
    language,
    content,
    lines: content.split('\n'),
    sourceFile,
    frameworks: opts.frameworks ?? [],
    projectIndex: projectIndexCache.get(rootAbs),
  };
  const result = globalRegistry.scanFile(ctx, {
    enabledPacks: opts.enabledPacks,
    enableExperimental: opts.enableExperimental ?? true,
  });
  return result.issues.map(i => reportIssueToCodeIssue(i, rootAbs));
}
