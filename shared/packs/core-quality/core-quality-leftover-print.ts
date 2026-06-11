/**
 * Rule: core-quality-leftover-print
 *
 * Python analogue of `core-quality-leftover-console`. Detects bare
 * `print(...)` (and `pprint.pprint(...)`) call sites — usually
 * debug output that leaked into production.
 *
 * Severity: MINOR.
 *   `print` is a legitimate logging mechanism in scripts and CLI tools,
 *   so we run at MINOR + experimental. Apps that ship `print` to
 *   structured logs (datadog, cloudwatch) can promote via .codemorerc.json.
 *
 * Detection:
 *   - Requires `ctx.pythonAst` (set by the scanner when language === 'python').
 *   - Walks every Call node; flags those whose callee is `print` or
 *     `pprint.pprint`.
 *   - Skips files under conventional test paths (test_*.py / *_test.py
 *     / tests/, conftest.py) — print-debugging during tests is fine.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree } from '../../rules/pythonAst';
import { findPrintCalls } from '../../rules/pythonHelpers';

const TEST_PATH_RE = /(?:^|\/)(?:tests?|__tests__|test|spec)\//;
const TEST_FILE_RE = /(?:^|\/)(?:test_|conftest)|_test\.py$/;
// CLI / build / CI scripts where print() IS the intended output channel.
// Exempting these eliminates the dominant FP class on real Python projects
// (see PART 4 §1 D3 — claw-code had 77% FPs in .github/scripts).
const SCRIPT_PATH_RE = /(?:^|\/)(?:scripts|bin|tools|\.github|cli|tasks)\//;
// Conventional CLI entry-point filenames. By Python tradition, `main.py`,
// `__main__.py`, `cli.py`, and `manage.py` (Django) are user-facing entry
// points whose `print()` writes the user's stdout output. Treating them
// as production-debug residue produces overwhelming FP rates on real CLI
// projects (claw-code's src/main.py had 32 FPs after the path exemption).
const ENTRY_FILE_RE = /(?:^|\/)(?:main|__main__|cli|manage)\.py$/;
// Recognised stderr / stdout aliases. If a print() routes to stderr/stdout
// explicitly, the author has thought about the channel — not residue.
const STDERR_STDOUT_KWARG_RE = /\bfile\s*=\s*(?:sys\.std(?:err|out)|stderr|stdout)\b/;

function isTestFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return TEST_PATH_RE.test(norm) || TEST_FILE_RE.test(norm);
}

function isScriptFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return SCRIPT_PATH_RE.test(norm) || ENTRY_FILE_RE.test(norm);
}

/**
 * Heuristic: does the `print` at `lineIdx` (1-based) sit inside an
 * `if __name__ == "__main__":` block? We scan up the file for such a
 * line; if found AND the print line is indented MORE than the if-line,
 * we treat the print as CLI entry-point output and exempt it.
 */
function isUnderDunderMain(lines: ReadonlyArray<string>, lineIdx: number): boolean {
  const target = lines[lineIdx - 1] ?? '';
  const targetIndent = target.match(/^[\t ]*/)?.[0].length ?? 0;
  if (targetIndent === 0) return false;
  for (let i = lineIdx - 2; i >= 0; i--) {
    const ln = lines[i];
    if (/^\s*if\s+__name__\s*==\s*['"]__main__['"]\s*:/.test(ln)) {
      const blockIndent = ln.match(/^[\t ]*/)?.[0].length ?? 0;
      return targetIndent > blockIndent;
    }
  }
  return false;
}

export const coreQualityLeftoverPrint: Rule = {
  id: 'core-quality-leftover-print',
  version: '1.2.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'code-smell',
  defaultSeverity: 'MINOR',
  defaultConfidence: 0.75,
  title: 'Leftover `print(...)` call in production code',
  whyItMatters:
    'A bare `print(...)` in a Python module is almost always a debug breadcrumb that someone ' +
    'forgot to remove. In a vibe-coded FastAPI / Streamlit / Modal app it lands in stdout, ' +
    'sometimes carrying sensitive payload, and contributes nothing to structured logging. ' +
    'Switch to `logging.<level>(...)` (with redaction) or remove the line.',
  citation: 'https://codemore.dev/rules/core-quality-leftover-print',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    if (isTestFile(ctx.filePath)) return [];
    if (isScriptFile(ctx.filePath)) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];
    for (const hit of findPrintCalls(tree)) {
      const lineText = ctx.lines[hit.line - 1] ?? '';
      // print(..., file=sys.stderr) is intentional output, not leftover debug.
      if (STDERR_STDOUT_KWARG_RE.test(lineText)) continue;
      // print inside `if __name__ == '__main__':` is CLI entry output.
      if (isUnderDunderMain(ctx.lines, hit.line)) continue;
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: lineText.trim(),
          matchedPattern: `print-call`,
        },
        whyItMatters:
          `\`${hit.callee}(...)\` is called from production code. Move to a logger or remove.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Two options:\n\n` +
            `  # (a) Replace with a structured logger.\n` +
            `  import logging\n` +
            `  logger = logging.getLogger(__name__)\n` +
            `  logger.info('thing happened')\n\n` +
            `  # (b) Delete the line if it was a debug breadcrumb.\n\n` +
            `Tests are exempt — print() during tests is fine.`,
          verificationCriteria: [
            'The print/pprint call is removed OR replaced with a logger call',
            'Re-scan reports core-quality-leftover-print resolved for this line',
          ],
        },
      });
    }
    return findings;
  },
};
