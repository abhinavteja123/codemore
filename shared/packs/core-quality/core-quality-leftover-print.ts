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

function isTestFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return TEST_PATH_RE.test(norm) || TEST_FILE_RE.test(norm);
}

export const coreQualityLeftoverPrint: Rule = {
  id: 'core-quality-leftover-print',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'experimental',
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
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];
    for (const hit of findPrintCalls(tree)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
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
