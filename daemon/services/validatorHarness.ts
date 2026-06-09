/**
 * Validator Harness — closes the agentic-loop with a sandboxed re-scan.
 *
 * The agent applies a fix and hands us:
 *   - the instanceId of the issue it tried to fix
 *   - the proposed new content of the file
 *
 * The harness re-runs the same rule registry over the new content in
 * memory (no disk write — the agent stays in control of whether to
 * commit the patch). It returns a structured pass/fail diagnostic the
 * agent uses as a stop signal for the loop:
 *
 *   passed=true   → the targeted rule no longer fires on the file. Apply
 *                   the patch and move on to the next issue.
 *   passed=false  → the rule still fires (or fires more times) on the
 *                   file. The agent should retry — feed the diagnostic
 *                   back into its planner.
 *
 * Phase 1 limitations (documented; expanded in Phase 2.1):
 *   - Single-file scope. Cross-file consequences of a patch are not
 *     evaluated. A future tempdir-sandbox version will apply the patch
 *     to a copy of the project and re-run the full scan + the file's
 *     test suite.
 *   - Replacement-only patches. We accept the full new file content,
 *     not unified diffs. A `diff`-based applicator is straightforward
 *     to add (the `diff` package is already a project dep).
 */

import * as ts from 'typescript';
import { globalRegistry } from '../../shared/rules/registry';
import type { RuleContext } from '../../shared/rules/Rule';
import type { ReportIssue } from '../../shared/report/types';

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export interface ValidationOptions {
  enableExperimental?: boolean;
  /** Limit re-scan to specific packs. Default: all registered packs. */
  packs?: ReadonlyArray<string>;
  /**
   * When true, the result includes findings from OTHER rules as well —
   * useful for "did my fix introduce a new issue?" checks. Default false.
   */
  includeOtherRules?: boolean;
}

export interface ValidationResult {
  /**
   * Whether the **targeted issue** (specific rule + specific line) was
   * resolved. Other instances of the same rule on other lines do not
   * affect this — the agent fixes one issue at a time and should only
   * see PASS when its specific patch worked.
   */
  passed: boolean;
  /** Convenience inverse; `true` means the agent should retry. */
  ruleStillFires: boolean;
  /** Whether the rule fires anywhere on the file after the patch. */
  ruleFiresElsewhere: boolean;
  /** Total count of findings of the targeted rule still present in the file. */
  remainingForRule: number;
  /**
   * Findings still present. By default contains only the targeted rule's
   * findings. With includeOtherRules=true, contains every finding the
   * registry would produce on the new content.
   */
  remainingFindings: ReportIssue[];
  /** Rule diagnostics surfaced by the registry (rule-throw etc.). */
  diagnostics: string[];
  /** Single-line human-readable verdict. */
  summary: string;
}

/**
 * Tolerance for line drift when comparing the original issue line against
 * post-patch findings. A small fix can shift surrounding line numbers by a
 * few lines without changing the underlying problem; a large fix can shift
 * by more. We use 3 as a balance — large enough to absorb edits inside a
 * statement, small enough not to mask a separate issue on a nearby line.
 */
const LINE_DRIFT_TOLERANCE = 3;

function inferLanguage(filePath: string, extension: string): string {
  const basename = filePath.replace(/^.*[/\\]/, '');
  if (basename === '.env' || basename.startsWith('.env.')) return 'env';
  if (basename === 'Dockerfile' || basename.toLowerCase() === 'dockerfile') return 'dockerfile';
  switch (extension) {
    case '.ts': case '.tsx': case '.cts': case '.mts': return 'typescript';
    case '.js': case '.jsx': case '.mjs': case '.cjs': return 'javascript';
    case '.sql': return 'sql';
    case '.py': case '.pyi': return 'python';
    case '.json': case '.jsonc': return 'json';
    case '.yaml': case '.yml': return 'yaml';
    case '.md': case '.markdown': return 'markdown';
    case '.sh': case '.bash': case '.zsh': return 'shell';
    default: return 'unknown';
  }
}

function buildContext(issue: ReportIssue, newContent: string): RuleContext {
  const filePath = issue.evidence.file;
  const dot = filePath.lastIndexOf('.');
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const extension = dot > slash ? filePath.slice(dot).toLowerCase() : '';
  const language = inferLanguage(filePath, extension);
  // Parse a sourceFile for TS/JS so AST-based rules can re-evaluate the
  // patched content. Without this every AST rule silently returns no
  // findings → passed=true → the loop accepts broken patches.
  let sourceFile: ts.SourceFile | null = null;
  if (TS_EXTENSIONS.has(extension)) {
    try {
      sourceFile = ts.createSourceFile(filePath, newContent, ts.ScriptTarget.Latest, true);
    } catch {
      sourceFile = null;
    }
  }
  return {
    filePath,
    extension,
    language,
    content: newContent,
    lines: newContent.split('\n'),
    sourceFile,
    frameworks: [],
  };
}

/**
 * Re-run the rule registry on a single file's proposed new content.
 *
 * Caller is responsible for registering rule packs before invoking (via
 * registerAllPacks() once at process start). The harness does not register
 * packs itself — that would couple it to the CLI's pack list and prevent
 * unit-testing the harness with a subset.
 */
export function validateFix(
  issue: ReportIssue,
  newContent: string,
  opts: ValidationOptions = {},
): ValidationResult {
  const ctx = buildContext(issue, newContent);
  const result = globalRegistry.scanFile(ctx, {
    enabledPacks: opts.packs ? Array.from(opts.packs) : undefined,
    enableExperimental: opts.enableExperimental ?? true,
  });

  const remainingForRule = result.issues.filter(f => f.id === issue.id);
  const ruleFiresElsewhere = remainingForRule.length > 0;

  // The targeted issue is considered resolved when no remaining finding
  // for the same rule appears within LINE_DRIFT_TOLERANCE of the original
  // line. A finding at exactly the original line — or within a few lines —
  // means the patch didn't fix the specific problem.
  const stillAtTargetLine = remainingForRule.some(
    f => Math.abs(f.evidence.line - issue.evidence.line) <= LINE_DRIFT_TOLERANCE,
  );
  const passed = !stillAtTargetLine;

  const remainingFindings = opts.includeOtherRules ? result.issues : remainingForRule;

  let summary: string;
  if (passed && !ruleFiresElsewhere) {
    summary = `PASS — issue at ${issue.evidence.file}:${issue.evidence.line} resolved; rule ${issue.id} no longer fires anywhere on this file.`;
  } else if (passed) {
    summary =
      `PASS — issue at ${issue.evidence.file}:${issue.evidence.line} resolved. ` +
      `(Rule ${issue.id} still fires elsewhere on the file at ${remainingForRule
        .map(f => f.evidence.line)
        .join(', ')}; address those next.)`;
  } else {
    summary =
      `FAIL — rule ${issue.id} still fires at ${remainingForRule
        .map(f => `line ${f.evidence.line}`)
        .join(', ')} on ${issue.evidence.file}. The targeted issue at line ${issue.evidence.line} ` +
      `was not resolved (within ${LINE_DRIFT_TOLERANCE}-line tolerance). Inspect remainingFindings and retry.`;
  }

  return {
    passed,
    ruleStillFires: !passed,
    ruleFiresElsewhere,
    remainingForRule: remainingForRule.length,
    remainingFindings,
    diagnostics: result.diagnostics.map(d => `${d.ruleId}: ${d.message}`),
    summary,
  };
}
