/**
 * Rule: core-quality-py-cyclomatic-complexity
 *
 * Python analogue of `core-quality-cyclomatic-complexity`. Counts McCabe
 * decision points per `def` / `async def` and flags those exceeding
 * threshold 15.
 *
 * Severity: MAJOR.
 *   High complexity is the single strongest predictor of latent bugs.
 *   Same threshold and reasoning as the TS rule.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree } from '../../rules/pythonAst';
import { findHighComplexityFunctions } from '../../rules/pythonHelpers';

const THRESHOLD = 15;

export const coreQualityPyCyclomaticComplexity: Rule = {
  id: 'core-quality-py-cyclomatic-complexity',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'maintainability',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.9,
  title: 'Function has high cyclomatic complexity',
  whyItMatters:
    'A function with > 15 decision points has usually accumulated paths across several pivots — ' +
    'the developer no longer mentally models all of them, and neither will the AI fixing the ' +
    'next bug. Any "improvement" it suggests is likely to break a path neither of you remembered.',
  citation: 'https://codemore.tech/rules/core-quality-py-cyclomatic-complexity',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];
    for (const hit of findHighComplexityFunctions(tree, THRESHOLD)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `complexity-${hit.complexity}`,
        },
        whyItMatters:
          `Function \`${hit.name}\` has cyclomatic complexity ${hit.complexity} (threshold ${THRESHOLD}). ` +
          `Split into smaller helpers OR replace if-chains with a dispatch dict.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Two refactors that consistently shrink Python complexity:\n\n` +
            `  # (a) Early-return guards instead of nested ifs.\n` +
            `  if not user: return None\n` +
            `  if not user.active: return None\n` +
            `  ...\n\n` +
            `  # (b) Dispatch dict instead of if/elif chains on a discriminant.\n` +
            `  HANDLERS = { 'a': do_a, 'b': do_b, 'c': do_c }\n` +
            `  return HANDLERS[kind]()`,
          verificationCriteria: [
            `Function \`${hit.name}\` has complexity ≤ ${THRESHOLD} after refactor`,
            'Re-scan reports core-quality-py-cyclomatic-complexity resolved for this function',
          ],
        },
      });
    }
    return findings;
  },
};
