/**
 * Rule: core-quality-py-unused-import
 *
 * Python analogue of `core-quality-unused-import`. `import X` /
 * `import X as Y` / `from M import X` bindings that are never
 * referenced in the file.
 *
 * Severity: MAJOR.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import type { PythonTree } from '../../rules/pythonAst';
import { findUnusedImports } from '../../rules/pythonHelpers';

export const coreQualityPyUnusedImport: Rule = {
  id: 'core-quality-py-unused-import',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'experimental',
  languages: ['python'],
  category: 'bug',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.9,
  title: 'Imported name is never used',
  whyItMatters:
    'An import that the file never references is bundle bloat AND supply-chain surface ' +
    'that serves no purpose. In vibe-coded Python apps it usually means a feature was ' +
    'rebuilt and the import got left behind.',
  citation: 'https://codemore.dev/rules/core-quality-py-unused-import',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.pythonAst) return [];
    const tree = ctx.pythonAst as PythonTree;
    const findings: RuleFinding[] = [];
    for (const hit of findUnusedImports(tree)) {
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `unused-${hit.kind}`,
        },
        whyItMatters:
          `\`${hit.name}\` is imported from \`${hit.module}\` (${hit.kind}) but is never ` +
          `referenced in this file.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Two options:\n\n` +
            `  # (a) Delete the import.\n` +
            `  # import ${hit.name}    ← remove\n\n` +
            `  # (b) Re-export explicitly via __all__ if this is a re-export pattern:\n` +
            `  __all__ = ['${hit.name}']`,
          verificationCriteria: [
            `\`${hit.name}\` is either deleted OR consumed by code in the file OR listed in __all__`,
            'Re-scan reports core-quality-py-unused-import resolved for this line',
          ],
        },
      });
    }
    return findings;
  },
};
