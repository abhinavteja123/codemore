/**
 * Rule: core-quality-py-unreachable-code
 *
 * Python analogue of `core-quality-unreachable-code`. Statements that
 * follow `return` / `raise` / `sys.exit()` / `continue` / `break` in the
 * same block can never execute. Pivot debris.
 *
 * Severity: MAJOR. Same reasoning as the TS rule: the AI thinks logic
 * runs there when it doesn't.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree } from '../../rules/pythonAst';
import { findUnreachableStatements } from '../../rules/pythonHelpers';

const REASON_TEXT: Record<string, string> = {
  'after-return':    'follows a `return` — execution never reaches it',
  'after-raise':     'follows a `raise` — execution never reaches it',
  'after-sys-exit':  'follows `sys.exit()` — the process is already terminating',
  'after-continue':  'follows a `continue` — execution never reaches it',
  'after-break':     'follows a `break` — execution never reaches it',
};

export const coreQualityPyUnreachableCode: Rule = {
  id: 'core-quality-py-unreachable-code',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'bug',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.95,
  title: 'Unreachable code after a terminating statement',
  whyItMatters:
    'A statement after `return` / `raise` / `sys.exit()` / `continue` / `break` in the same ' +
    'block can never run. The risk is that the AI now thinks logic exists where it doesn\'t, ' +
    'and the next fix it suggests may try to "improve" code that never executes.',
  citation: 'https://codemore.tech/rules/core-quality-py-unreachable-code',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];
    for (const hit of findUnreachableStatements(tree)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: hit.reason,
        },
        whyItMatters: `This statement ${REASON_TEXT[hit.reason] ?? 'is unreachable'}.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Two cases:\n\n` +
            `  # (a) Genuinely dead — delete the trailing lines.\n` +
            `  def compute():\n` +
            `      return result\n` +
            `      # cleanup()   ← delete\n\n` +
            `  # (b) The exit was added in error — move it above the code\n` +
            `  # that should actually run.`,
          verificationCriteria: [
            'The unreachable statement is deleted OR reordered before the terminator',
            'Re-scan reports core-quality-py-unreachable-code resolved for this function',
          ],
        },
      });
    }
    return findings;
  },
};
