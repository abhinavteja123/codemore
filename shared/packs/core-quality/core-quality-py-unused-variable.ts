/**
 * Rule: core-quality-py-unused-variable
 *
 * Python analogue of `core-quality-unused-variable`. Local-assignment
 * LHS identifiers whose name is never referenced elsewhere in the file.
 *
 * Severity: MAJOR. Same reasoning as the TS rule: the dead name often
 * reveals a removed concept (`old_service_role_key`, `legacy_token`).
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree } from '../../rules/pythonAst';
import { findUnusedVariables } from '../../rules/pythonHelpers';

export const coreQualityPyUnusedVariable: Rule = {
  id: 'core-quality-py-unused-variable',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'bug',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.8,
  title: 'Variable assigned but never read',
  whyItMatters:
    'A local assignment whose target name is never referenced in the file is the cleanest ' +
    'signal of a pivot: the developer rewired the code around it and forgot to delete the ' +
    'leftover. The dead name often reveals what the removed concept was.',
  citation: 'https://codemore.tech/rules/core-quality-py-unused-variable',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];
    for (const hit of findUnusedVariables(tree)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: 'unused-assignment',
        },
        whyItMatters:
          `\`${hit.name}\` is assigned but never read in this file. Delete the line OR ` +
          `prefix the name with \`_\` if the binding is intentionally unused.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Two options:\n\n` +
            `  # (a) Delete the line if it's pivot debris.\n` +
            `  # old_thing = compute()  ← remove\n\n` +
            `  # (b) Rename with a leading underscore to mark intent.\n` +
            `  _scratch = compute()`,
          verificationCriteria: [
            `\`${hit.name}\` is either deleted OR consumed by other code OR renamed to start with \`_\``,
            'Re-scan reports core-quality-py-unused-variable resolved for this line',
          ],
        },
      });
    }
    return findings;
  },
};
