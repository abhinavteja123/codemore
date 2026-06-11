/**
 * Rule: core-quality-duplicate-string
 *
 * Detects the same magic-string literal repeated >= 3 times in the
 * same file. Pure pivot-debris signal in vibe-coded apps: the AI
 * generated similar code in three places, the developer (or the AI)
 * later restructured one or two of them, and the third copy quietly
 * drifted out of sync.
 *
 * Severity: MINOR. Not a security risk on its own — the cost is that
 * the AI will see N copies of the same string and assume they're the
 * same concept, even after the developer has changed the meaning of
 * one of them.
 *
 * Detection (AST):
 *   - Walk every StringLiteral / NoSubstitutionTemplateLiteral.
 *   - Tally by exact text. After the walk, any text whose tally >= 3
 *     emits a single finding pointing at the FIRST occurrence.
 *   - Skip:
 *       short strings (< 4 chars trim length)
 *       whitespace / punctuation-only strings
 *       common framework tokens we know are noise: '', ' ', '/', '.',
 *         'default', 'true', 'false', 'GET', 'POST', etc.
 *       strings used as import paths (their parent is ImportDeclaration
 *         / ImportEqualsDeclaration / CallExpression(require))
 *       strings used as JSX attribute values that look like CSS classes
 *         (heuristic: contains a space AND parent is JsxAttribute)
 *
 * Coverage gap (intentional):
 *   - Cross-file duplication is NOT detected. Building it requires the
 *     same string-canonicalisation infrastructure that would underpin a
 *     "find dead constants" rule; out of scope for v1.
 *   - Locale messages and i18n keys are very legitimately repeated;
 *     suppress with a Reason comment if your project keeps them inline.
 */

import * as ts from 'typescript';
import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const MIN_LENGTH = 4;
const MIN_OCCURRENCES = 3;

const COMMON_NOISE = new Set([
  '', ' ', '/', '.', '..', ',', ':', ';', '-', '_', '=', '*', '#',
  'default', 'true', 'false', 'null', 'undefined',
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD',
  'utf-8', 'utf8',
]);

const PUNCT_ONLY_RE = /^[\s\p{P}\p{S}]*$/u;

function isImportPathContext(node: ts.StringLiteralLike): boolean {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p)) return true;
  if (ts.isExportDeclaration(p)) return true;
  if (ts.isExternalModuleReference(p)) return true;
  if (ts.isCallExpression(p)
      && ts.isIdentifier(p.expression)
      && p.expression.text === 'require') return true;
  if (ts.isCallExpression(p)
      && p.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  return false;
}

function isJsxClassLikeAttribute(node: ts.StringLiteralLike): boolean {
  // Heuristic: JsxAttribute initializer + value contains a space (CSS class list).
  const p = node.parent;
  if (!p) return false;
  if (ts.isJsxAttribute(p) && p.initializer === node && / /.test(node.text)) {
    return true;
  }
  return false;
}

interface DuplicateHit {
  text: string;
  count: number;
  firstLine: number;
  firstColumn: number;
  firstStart: number;
  firstEnd: number;
}

export const coreQualityDuplicateString: Rule = {
  id: 'core-quality-duplicate-string',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'code-smell',
  defaultSeverity: 'MINOR',
  defaultConfidence: 0.7,
  title: 'Same string literal appears >= 3 times in this file',
  whyItMatters:
    'A magic string repeated three or more times in the same file is the canonical "pivot debris" ' +
    'smell: the AI generated copies for three call sites, the developer restructured one or two, ' +
    'and now the remaining copies drift independently. The next AI fix will assume they\'re all ' +
    'the same concept and "improve" them together — masking the drift. Extract a single constant.',
  citation: 'https://codemore.dev/rules/core-quality-duplicate-string',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];

    interface Counter { count: number; first: ts.Node }
    const counters = new Map<string, Counter>();

    const visit = (n: ts.Node): void => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))) {
        const text = n.text;
        const trimmed = text.trim();
        if (trimmed.length < MIN_LENGTH) { ts.forEachChild(n, visit); return; }
        if (COMMON_NOISE.has(trimmed)) { ts.forEachChild(n, visit); return; }
        if (PUNCT_ONLY_RE.test(trimmed)) { ts.forEachChild(n, visit); return; }
        if (isImportPathContext(n)) { ts.forEachChild(n, visit); return; }
        if (isJsxClassLikeAttribute(n)) { ts.forEachChild(n, visit); return; }
        const existing = counters.get(text);
        if (existing) existing.count++;
        else counters.set(text, { count: 1, first: n });
      }
      ts.forEachChild(n, visit);
    };
    visit(ctx.sourceFile);

    const findings: RuleFinding[] = [];
    for (const [text, { count, first }] of counters) {
      if (count < MIN_OCCURRENCES) continue;
      const start = first.getStart(ctx.sourceFile);
      const lc = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      const display = text.length > 40 ? text.slice(0, 40) + '…' : text;
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: lc.line + 1,
          column: lc.character + 1,
          snippet: (ctx.lines[lc.line] ?? '').trim(),
          matchedPattern: `duplicate-string-x${count}`,
        },
        whyItMatters:
          `The string \`${display}\` appears ${count} times in this file. ` +
          `Extract it into a single named constant so a future change has one place to land.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Hoist the literal to a single \`const\` near the top of the file (or in a shared ` +
            `module if it's also used elsewhere) and replace every call site with the constant:\n\n` +
            `  const SUGGESTED_NAME = \`${display}\`;\n\n` +
            `If the three call sites actually represent THREE different concepts that happen to ` +
            `share a value today, expand the rule by giving each its own constant with a ` +
            `meaningful name — the rule will then stay silent because the duplication is gone.`,
          verificationCriteria: [
            `The literal \`${display}\` appears at most ${MIN_OCCURRENCES - 1} times in this file`,
            'Re-scan reports core-quality-duplicate-string resolved for this file',
          ],
        },
      });
    }
    return findings;
  },
};
