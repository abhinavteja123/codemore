/**
 * Rule: core-quality-unused-variable
 *
 * Detects `const` / `let` / `var` declarations whose name is never read
 * elsewhere in the same file. The single most common pivot artifact in
 * vibe-coded apps: a feature got rebuilt or removed, the surrounding code
 * was rewired, and the orphan variable was left behind.
 *
 * Severity: MAJOR. The variable itself is harmless, but the NAME often
 * reveals the removed concept (`oldServiceRoleKey`, `legacyAuthToken`,
 * `tempUserContext`). That dead noun confuses the next AI agent into
 * "improving" code that the runtime never sees.
 *
 * Coverage:
 *   - Simple identifier declarations: `const x = …`, `let y = …`.
 *   - Exported names are skipped (might be consumed across files).
 *   - `_`-prefixed names are skipped (TS convention for "deliberately unused").
 *   - Destructuring patterns (`const { a, b } = …`) are NOT flagged here
 *     — too noisy for an experimental rule.
 *   - Initializers with side effects (`const x = fetchData()`) are NOT
 *     flagged — the call still ran, deleting the binding would change
 *     behaviour.
 *
 * Coverage gap:
 *   - Cross-file unused exports are caught by `core-quality-unused-export`
 *     (Phase 2B, when ProjectIndex ships).
 *   - Unused function parameters are not flagged here — separate rule
 *     family; too noisy without rule-set tuning.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import { findUnusedVariables } from '../../rules/astHelpers';

export const coreQualityUnusedVariable: Rule = {
  id: 'core-quality-unused-variable',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  category: 'bug',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.85,
  title: 'Variable declared but never read',
  whyItMatters:
    'Variables whose name is never referenced are the cleanest signal of a vibe-coding pivot: ' +
    'the developer (or the AI) rewired the code around them and forgot to delete the leftover. ' +
    'The dead name (`oldServiceRoleKey`, `legacyAuthToken`, `tempCtx`) misleads the next reader ' +
    'about what state actually exists at runtime. A future AI fix may try to "use" the dead ' +
    'binding, locking the bug in place. Delete it or wire it in — do not leave it hanging.',
  citation: 'https://codemore.dev/rules/core-quality-unused-variable',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    const findings: RuleFinding[] = [];
    for (const hit of findUnusedVariables(ctx.sourceFile)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `${hit.kind}-unused`,
        },
        whyItMatters:
          `\`${hit.kind} ${hit.name}\` is declared but never read in this file. ` +
          `If the name describes a removed concept, delete the line; if the value is needed, ` +
          `wire it into the code that should consume it.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Two options for \`${hit.kind} ${hit.name}\`:\n\n` +
            `  // (a) The variable is genuine pivot debris — delete the line.\n` +
            `  // ${hit.kind} ${hit.name} = …;   ← remove\n\n` +
            `  // (b) The variable is supposed to be used but the wiring was lost.\n` +
            `  // Find the code that should consume \`${hit.name}\` and reconnect it.\n\n` +
            `If \`${hit.name}\` is intentionally unused (rare — usually a placeholder for a ` +
            `future feature), prefix the name with \`_\`: \`${hit.kind} _${hit.name} = …\`.`,
          verificationCriteria: [
            `The unused \`${hit.name}\` is either deleted OR consumed by other code OR renamed to start with \`_\``,
            `Re-scan reports core-quality-unused-variable resolved for this line`,
          ],
        },
      });
    }
    return findings;
  },
};
