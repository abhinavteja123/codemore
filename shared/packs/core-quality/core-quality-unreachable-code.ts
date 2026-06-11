/**
 * Rule: core-quality-unreachable-code
 *
 * Detects statements that can never execute because a prior statement in
 * the same block always exits the function (return / throw / break /
 * continue / process.exit). Pure pivot-debris signal — usually the
 * developer changed direction and forgot to clean up the trailing code.
 *
 * Severity: MAJOR. Unreachable code isn't an active bug yet, but every
 * one is a place where logic the author thought would run, doesn't.
 * Often the "fix" the AI is about to apply lives inside the dead branch.
 *
 * Coverage:
 *   - return / throw / break / continue / process.exit() followed by
 *     more statements in the same block.
 *   - Skips hoisted declarations (function declarations, plain `var`).
 *   - Only flags the FIRST unreachable statement per block to avoid
 *     screaming about long dead tails.
 *
 * Coverage gap:
 *   - `if (true)` / `if (false)` short-circuits aren't detected here
 *     (the `core-quality-dead-conditional` rule covers those).
 *   - Calls to other `never`-returning functions besides `process.exit`
 *     aren't detected (would need type information).
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import { findUnreachableStatements } from '../../rules/astHelpers';

const REASON_TEXT: Record<string, string> = {
  'after-return':       'follows a `return` — execution never reaches it',
  'after-throw':        'follows a `throw` — execution never reaches it',
  'after-break':        'follows a `break` — execution never reaches it',
  'after-continue':     'follows a `continue` — execution never reaches it',
  'after-process-exit': 'follows `process.exit()` — the process is already terminating',
};

export const coreQualityUnreachableCode: Rule = {
  id: 'core-quality-unreachable-code',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'bug',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.95,
  title: 'Unreachable code after a terminating statement',
  whyItMatters:
    'A statement after `return` / `throw` / `break` / `continue` / `process.exit()` in the same ' +
    'block can never run. In vibe-coded apps this is almost always pivot debris — the developer ' +
    'changed direction (or asked the AI to) and left the old code below the new exit. The risk: ' +
    'the AI now thinks logic exists that runs in production. The fix it suggests for the next ' +
    'bug may try to "improve" code that never actually executes.',
  citation: 'https://codemore.dev/rules/core-quality-unreachable-code',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    const findings: RuleFinding[] = [];
    for (const hit of findUnreachableStatements(ctx.sourceFile)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: hit.reason,
        },
        whyItMatters:
          `This statement ${REASON_TEXT[hit.reason] ?? 'is unreachable'}.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            'Two cases:\n\n' +
            '  // (a) The code is genuinely dead — delete it.\n' +
            '  function compute() {\n' +
            '    return result;\n' +
            '    // cleanup();  ← delete this line\n' +
            '  }\n\n' +
            '  // (b) The early exit was added in error and you do want this\n' +
            '  // code to run — move the exit to its real place (often inside a\n' +
            '  // guard above) or remove it.\n\n' +
            'If the line is intentionally kept for context (e.g. a TODO marker before\n' +
            'a return), move it ABOVE the terminating statement so it actually executes.',
          verificationCriteria: [
            'The unreachable statement is either deleted OR reordered above the terminating statement',
            'Re-scan reports core-quality-unreachable-code resolved for this function',
          ],
        },
      });
    }
    return findings;
  },
};
