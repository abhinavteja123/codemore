/**
 * Rule: core-quality-dead-conditional
 *
 * Detects `if (...)` whose condition is trivially constant — `if (true)`,
 * `if (false)`, `if (1 === 1)`, `if ('x' === 'x')`. These are pure pivot
 * debris: the developer wrapped code in a gate, then changed their mind
 * about whether the gate should fire, and left the now-constant expression
 * behind.
 *
 * Severity: MAJOR. Half of these mean "branch always runs" (dead wrapper,
 * confusing); the other half mean "branch never runs" (silently disabled
 * code path that the developer may still think is live).
 *
 * Coverage:
 *   - `if (true)` / `if (false)` literal keywords.
 *   - `if (0)` / `if (1)` / `if ('')` / `if ('x')` literal primitives.
 *   - `if (X === X)` / `if ('a' === 'a')` — same text on both sides.
 *
 * Coverage gap (intentional):
 *   - `if (env === 'dev')` / `if (process.env.NODE_ENV === 'production')`
 *     — these LOOK constant at compile time but are runtime gates.
 *     We don't flag them.
 *   - `if (CONFIG.debug)` — same reasoning, runtime config.
 *   - `if (typeof window === 'undefined')` — SSR guard, runtime.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import { findDeadConditionals } from '../../rules/astHelpers';

const KIND_REASON: Record<string, string> = {
  'literal-true':     'The condition is the literal `true` (or another truthy literal) — this branch ALWAYS runs.',
  'literal-false':    'The condition is the literal `false` (or another falsy literal) — this branch NEVER runs.',
  'tautological-eq':  'The two sides of the equality are identical text — this branch ALWAYS runs.',
  'always-falsy-eq':  'The two sides of the inequality are identical text — this branch NEVER runs.',
};

export const coreQualityDeadConditional: Rule = {
  id: 'core-quality-dead-conditional',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  category: 'bug',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.95,
  title: 'Conditional with a constant condition',
  whyItMatters:
    'An `if (true)` or `if (false)` is unambiguous pivot debris: the developer wrapped code in ' +
    'a conditional, decided the gate should always-fire or never-fire, and forgot to remove the ' +
    'wrapper. The branch either ALWAYS runs (so the wrapper is noise, hiding the intent) or ' +
    'NEVER runs (so the code inside is silently dead). Either case misleads the next reader — ' +
    'AI agent or human — about which logic is actually live.',
  citation: 'https://codemore.dev/rules/core-quality-dead-conditional',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    const findings: RuleFinding[] = [];
    for (const hit of findDeadConditionals(ctx.sourceFile)) {
      const reason = KIND_REASON[hit.kind] ?? 'The condition evaluates to a constant.';
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: hit.kind,
        },
        whyItMatters: `${reason} (condition: \`${hit.conditionText}\`)`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Decide what the gate was meant to do:\n\n` +
            `  // (a) Branch should ALWAYS run — drop the wrapper:\n` +
            `  doThing();        // was: if (true) { doThing(); }\n\n` +
            `  // (b) Branch should NEVER run — delete the whole block:\n` +
            `  // if (false) { … }   ← delete\n\n` +
            `  // (c) The gate was real but got over-simplified — restore it:\n` +
            `  if (config.flag) { doThing(); }   // was: if (true)\n\n` +
            `Whichever you pick, the AI now sees the actual intent rather than guessing.`,
          verificationCriteria: [
            'The conditional is either removed (always-true) OR the block is deleted (always-false) OR a real condition is restored',
            'Re-scan reports core-quality-dead-conditional resolved for this line',
          ],
        },
      });
    }
    return findings;
  },
};
