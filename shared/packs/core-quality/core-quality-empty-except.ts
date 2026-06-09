/**
 * Rule: core-quality-empty-except
 *
 * Python analogue of `core-quality-empty-catch`. Detects `except ...:`
 * clauses whose body is `pass` only (or an Ellipsis statement). The
 * classic "silently swallowed exception" pattern.
 *
 * Severity: MAJOR.
 *   The bug is hidden state: an exception happens, nobody logs it, the
 *   call site believes the operation succeeded. In vibe-coded FastAPI
 *   apps this is the #1 reason 500-class errors look like 200s.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree } from '../../rules/pythonAst';
import { findEmptyExcepts } from '../../rules/pythonHelpers';

export const coreQualityEmptyExcept: Rule = {
  id: 'core-quality-empty-except',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'experimental',
  languages: ['python'],
  category: 'bug',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.95,
  title: '`except: pass` swallows the exception',
  whyItMatters:
    'An `except` clause whose body is `pass` (or `...`) silently discards every exception ' +
    'that crosses it. The call site believes the operation succeeded, the failure mode is ' +
    'invisible, and the AI fixing the next bug has no diagnostic to read. At minimum log the ' +
    'exception; better, narrow the except clause to the specific exception type you mean to ' +
    'recover from.',
  citation: 'https://codemore.dev/rules/core-quality-empty-except',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];
    for (const hit of findEmptyExcepts(tree)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `except-pass`,
        },
        whyItMatters:
          'This `except` block silently discards the exception. Add a logger call OR narrow ' +
          'the clause to the specific exception type you actually want to recover from.',
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Three options:\n\n` +
            `  # (a) Log the exception so somebody knows it happened.\n` +
            `  except Exception as e:\n` +
            `      logger.exception('operation failed: %s', e)\n\n` +
            `  # (b) Narrow the except to the exact class you want to handle.\n` +
            `  except FileNotFoundError:\n` +
            `      pass    # ← here \`pass\` is fine: missing-file is the expected branch.\n\n` +
            `  # (c) Re-raise after logging if the recovery isn't real.\n` +
            `  except Exception:\n` +
            `      logger.exception('unrecoverable')\n` +
            `      raise`,
          verificationCriteria: [
            'The except block either logs OR narrows to a specific exception class OR re-raises',
            'Re-scan reports core-quality-empty-except resolved for this block',
          ],
        },
      });
    }
    return findings;
  },
};
