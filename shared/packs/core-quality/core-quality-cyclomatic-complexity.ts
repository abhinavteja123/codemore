/**
 * Rule: core-quality-cyclomatic-complexity
 *
 * Flags functions, methods, and arrow functions whose cyclomatic
 * complexity exceeds a threshold (default 15). The McCabe metric counts
 * decision points: each `if`, `case`, `&&`, `||`, `??`, ternary, loop,
 * and `catch` adds 1 to the base of 1.
 *
 * Severity: MAJOR. High complexity is the single strongest predictor of
 * latent bugs in vibe-coded apps — functions with > 20 branches have
 * usually accumulated paths from several pivots and the developer no
 * longer mentally models all of them.
 *
 * Coverage:
 *   - All function-like nodes: function declarations, function
 *     expressions, arrow functions, methods, constructors.
 *   - Nested function-likes get their OWN score (we don't double-count
 *     into the parent).
 *
 * Coverage gap (intentional):
 *   - Switch statements with many `case` clauses naturally inflate the
 *     score; we don't special-case them. A 30-case switch is genuinely
 *     complex from a "can the AI safely refactor this?" perspective.
 *   - We don't flag based on lines-of-code (separate rule, deferred).
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import { findHighComplexityFunctions } from '../../rules/astHelpers';

const COMPLEXITY_THRESHOLD = 15;

export const coreQualityCyclomaticComplexity: Rule = {
  id: 'core-quality-cyclomatic-complexity',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'maintainability',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.9,
  title: 'Function has high cyclomatic complexity',
  whyItMatters:
    `Cyclomatic complexity over ${COMPLEXITY_THRESHOLD} means the function has more than ` +
    `${COMPLEXITY_THRESHOLD} independent decision points (ifs, loops, &&, ||, ternaries, catches). ` +
    'In vibe-coded apps that usually means the function accumulated paths across multiple ' +
    'feature iterations and the developer no longer mentally models all of them. The AI agent ' +
    'won\'t either: any "improvement" it suggests is likely to break a path neither of you ' +
    'remembered. Decompose into smaller named helpers before adding new branches.',
  citation: 'https://codemore.tech/rules/core-quality-cyclomatic-complexity',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    const findings: RuleFinding[] = [];
    for (const hit of findHighComplexityFunctions(ctx.sourceFile, COMPLEXITY_THRESHOLD)) {
      const named = hit.name ? `\`${hit.name}\`` : `anonymous ${hit.kind}`;
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `complexity-${hit.complexity}`,
        },
        whyItMatters:
          `${named} has cyclomatic complexity ${hit.complexity} ` +
          `(threshold ${COMPLEXITY_THRESHOLD}). Each new branch compounds the surface for ` +
          'subtle regressions, and AI-driven refactors are increasingly likely to miss a path.',
        suggestedFix: {
          type: 'code-patch',
          instructions:
            'Two refactors usually shrink complexity dramatically:\n\n' +
            '  // (a) Extract guard clauses into early returns:\n' +
            '  function compute(x) {\n' +
            '    if (!x) return null;\n' +
            '    if (x.disabled) return null;\n' +
            '    // … main happy-path body here, no longer nested …\n' +
            '  }\n\n' +
            '  // (b) Replace `if/else if/else if` chains with a lookup\n' +
            '  // table or a strategy map keyed on the discriminant.\n\n' +
            '  // (c) If a switch has many cases per discriminant, split per\n' +
            '  // case into its own handler function.\n\n' +
            'Aim for branches ≤ 10 per function. Anything higher should be the\n' +
            'explicit exception, with a comment explaining why.',
          verificationCriteria: [
            'The function is decomposed into helpers, OR refactored to reduce branch count to ≤ 10',
            'Re-scan reports core-quality-cyclomatic-complexity resolved for this function',
          ],
        },
      });
    }
    return findings;
  },
};
