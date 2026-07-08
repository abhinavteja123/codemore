/**
 * Rule: core-quality-unused-import
 *
 * Detects import bindings that are never referenced in the file. Another
 * classic vibe-coding pivot artifact: the feature that needed the import
 * was rebuilt or removed, the import line was forgotten.
 *
 * Severity: MAJOR. The cost compounds:
 *   - Bundle bloat (every unused import is a tree-shake miss waiting to happen).
 *   - Supply-chain surface (CVE in `lodaash` matters if you imported `lodaash`).
 *   - Misleads agents: the next AI looking at the file may think the
 *     module is in use somewhere it isn't.
 *
 * Coverage:
 *   - `import Foo from 'x'`        — default binding flagged when unused.
 *   - `import * as Foo from 'x'`   — namespace binding flagged when unused.
 *   - `import { A, B } from 'x'`   — each named binding checked
 *     independently; emits one finding per unused name.
 *
 * Coverage gap (intentional):
 *   - Side-effect-only imports (`import 'foo'`) are NEVER flagged —
 *     the import IS the call.
 *   - Type-only imports are checked uniformly; if the type appears in a
 *     position (annotation, generic, `as Foo`), the identifier is counted
 *     as used.
 *   - Renamed bindings (`import { foo as bar } from 'x'`) are flagged by
 *     the local alias (`bar`), which is what gets used in the file.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import { findUnusedImports } from '../../rules/astHelpers';

const KIND_LABEL: Record<string, string> = {
  'default':   'default import',
  'named':     'named import',
  'namespace': 'namespace import',
};

export const coreQualityUnusedImport: Rule = {
  id: 'core-quality-unused-import',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'bug',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.9,
  title: 'Imported binding is never used',
  whyItMatters:
    'An import that the file never references is bundle bloat and supply-chain surface that ' +
    'serves no purpose. In vibe-coded apps it almost always means the feature that needed it ' +
    'was rebuilt or removed and the import line was forgotten. Worse, it keeps the dependency ' +
    'name in `package.json` "alive" — which means the next slopsquatting attack on that name ' +
    'still hits this project. Delete unused imports first, audit dependencies second.',
  citation: 'https://codemore.tech/rules/core-quality-unused-import',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    const findings: RuleFinding[] = [];
    for (const hit of findUnusedImports(ctx.sourceFile)) {
      const kindLabel = KIND_LABEL[hit.kind] ?? 'import';
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `unused-${hit.kind}`,
        },
        whyItMatters:
          `\`${hit.name}\` is imported from \`${hit.moduleSpecifier}\` as a ${kindLabel} ` +
          `but is never referenced in this file. Either delete the binding or wire it into ` +
          `the code that should consume it.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Two options for the unused ${kindLabel} \`${hit.name}\`:\n\n` +
            `  // (a) The import is genuine pivot debris — delete the binding.\n` +
            `  // For a named import, drop just this name from the brace list:\n` +
            `  //   import { kept, ${hit.name} } from '${hit.moduleSpecifier}';\n` +
            `  //   →  import { kept } from '${hit.moduleSpecifier}';\n` +
            `  // For a default / namespace import, delete the whole import line.\n\n` +
            `  // (b) The import is supposed to be used — find the code that should\n` +
            `  // reference \`${hit.name}\` and reconnect it.\n\n` +
            `If the import was kept for a side effect, replace it with a side-effect ` +
            `import: \`import '${hit.moduleSpecifier}';\``,
          verificationCriteria: [
            `The unused binding \`${hit.name}\` is either deleted OR consumed by other code in the file`,
            `Re-scan reports core-quality-unused-import resolved for this line`,
          ],
        },
      });
    }
    return findings;
  },
};
