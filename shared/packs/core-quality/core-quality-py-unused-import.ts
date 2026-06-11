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

/**
 * Is `lineIdx` (1-based) inside an `if TYPE_CHECKING:` block? Imports
 * gated by TYPE_CHECKING are only used by type-checkers; the runtime
 * never resolves them. Ruff treats them as USED. We match that bar so
 * we don't over-report on real Python projects (claw-code had 19 here
 * vs ruff's 2; the gap was almost entirely TYPE_CHECKING blocks).
 */
function isUnderTypeChecking(lines: ReadonlyArray<string>, lineIdx: number): boolean {
  const target = lines[lineIdx - 1] ?? '';
  const targetIndent = target.match(/^[\t ]*/)?.[0].length ?? 0;
  if (targetIndent === 0) return false;
  for (let i = lineIdx - 2; i >= 0; i--) {
    const ln = lines[i];
    if (/^\s*if\s+(?:typing\.)?TYPE_CHECKING\s*:/.test(ln)) {
      const blockIndent = ln.match(/^[\t ]*/)?.[0].length ?? 0;
      return targetIndent > blockIndent;
    }
    // Reset if we hit a sibling-indent statement (left the block).
    const lnIndent = ln.match(/^[\t ]*/)?.[0].length ?? 0;
    if (ln.trim().length > 0 && lnIndent < targetIndent && lnIndent === 0) break;
  }
  return false;
}

/**
 * Parse simple `__all__ = ['foo', 'bar']` exports out of the file.
 * Doesn't try to be a full evaluator — handles list/tuple literals on
 * one or multi-line forms with single or double quotes. False positives
 * here are fine (we just under-report), false negatives are not (we
 * over-report). Net: closer to ruff parity, cheap.
 */
function parseAllNames(source: string): Set<string> {
  const out = new Set<string>();
  // Match __all__ = [...] or (...) spanning up to ~30 lines.
  const m = source.match(/^__all__\s*=\s*[\[(]([\s\S]{0,2000}?)[\])]/m);
  if (!m) return out;
  for (const tok of m[1].matchAll(/['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) {
    out.add(tok[1]);
  }
  return out;
}

export const coreQualityPyUnusedImport: Rule = {
  id: 'core-quality-py-unused-import',
  version: '1.1.0',
  pack: 'core-quality',
  lifecycle: 'beta',
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
    const reExported = parseAllNames(ctx.content);
    const findings: RuleFinding[] = [];
    for (const hit of findUnusedImports(tree)) {
      // Skip type-only imports (inside `if TYPE_CHECKING:`).
      if (isUnderTypeChecking(ctx.lines, hit.line)) continue;
      // Skip imports that are listed in __all__ (re-export pattern).
      if (reExported.has(hit.name)) continue;
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
