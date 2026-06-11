/**
 * Rule: core-typescript-non-null-assertion-abuse
 *
 * Detects TypeScript's non-null assertion operator `!.` (and `![`).
 *
 * Severity: MINOR (production), INFO (test paths). Each non-null
 * assertion is a place where compile-time null safety was suppressed
 * — usually defensible one-off, occasionally a real bug. Surfacing
 * them as a low-severity inventory lets reviewers triage rather than
 * blocking merges.
 *
 * Coverage gap:
 *   - Regex-based; we don't catch `expression![0]` patterns where the
 *     `!` is attached to a complex sub-expression. Phase-2 AST pass
 *     will improve this.
 *   - We don't distinguish "after a recent null check" (probably OK)
 *     from "out of nowhere" (probably suspect). Phase-2 dataflow will.
 */

/* codemore-ignore-file: core-typescript-non-null-assertion-abuse */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import { findNonNullExpressions } from '../../rules/astHelpers';

// `!.` and `![` immediately after an identifier, `)`, or `]`.
// Negative lookbehind avoids matching `!=` and `!==`.
const NON_NULL_RE = /(?:\w|\)|\])(?<![=!])(!)(?=[.\[])/g;

const TEST_PATH_RE = /(?:^|\/)(?:__tests__|tests?|spec|fixtures?|examples?|mocks?)\//i;
const TEST_FILE_RE = /\.(?:test|spec)\.(?:ts|tsx)$/i;

function isTestContext(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return TEST_PATH_RE.test(norm) || TEST_FILE_RE.test(norm);
}

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function stripCommentsAndStrings(content: string): string {
  let out = content.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, m => ' '.repeat(m.length));
  out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, m => ' '.repeat(m.length));
  out = out.replace(/`(?:[^`\\]|\\.)*`/g, m => m.replace(/[^\n]/g, ' '));
  return out;
}

export const coreTypescriptNonNullAssertionAbuse: Rule = {
  id: 'core-typescript-non-null-assertion-abuse',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['typescript'],
  category: 'bug',
  defaultSeverity: 'MINOR',
  defaultConfidence: 0.75,
  title: 'Non-null assertion bypasses null check',
  whyItMatters:
    'The `!` non-null assertion tells TypeScript "I promise this is not null/undefined" without ' +
    'any runtime check. When the promise is wrong, you get a runtime TypeError at the property ' +
    'access — the exact bug class TypeScript was supposed to prevent. AI-generated code reaches ' +
    'for `!.` reflexively when the compiler complains, so each one is a place the type system ' +
    'pushed back and got ignored.',
  citation: 'https://codemore.dev/rules/core-typescript-non-null-assertion-abuse',

  detect(ctx: RuleContext): RuleFinding[] {
    const testCtx = isTestContext(ctx.filePath);

    const pushFinding = (line: number, column: number, findings: RuleFinding[]): void => {
      const snippet = (ctx.lines[line - 1] ?? '').trim();
      findings.push({
        severity: testCtx ? 'INFO' : 'MINOR',
        confidence: testCtx ? 0.55 : 0.75,
        evidence: {
          file: ctx.filePath,
          line,
          column,
          snippet,
          matchedPattern: testCtx ? 'non-null-test-context' : 'non-null-assertion',
        },
        whyItMatters: testCtx
          ? 'Non-null assertion in a test path — usually pragmatic. Surfaced at INFO for inventory.'
          : 'Non-null assertion in production code. If the value is ever null/undefined here, the next property access throws at runtime.',
        suggestedFix: {
          type: 'code-patch',
          instructions:
            'Replace `!` with an explicit check:\n\n' +
            '  // Option A: guard early\n' +
            '  if (!value) throw new Error(\'value is required\');\n' +
            '  value.field;\n\n' +
            '  // Option B: optional chaining + fallback\n' +
            '  const f = value?.field ?? defaultField;\n\n' +
            '  // Option C: narrow the type at the source so `!` is not needed.\n\n' +
            'If the cast is truly safe (e.g. immediately after a verified null check), suppress ' +
            'with a comment that documents the invariant.',
          verificationCriteria: [
            'The non-null assertion is replaced by a structural check, OR',
            'Each remaining `!` is suppressed inline with a comment explaining why it is safe',
            're-scan reports this finding resolved for the line',
          ],
        },
      });
    };

    // AST path — `ts.NonNullExpression` exact match. Also catches trailing
    // `value!;` patterns the regex (which required a following `.` or `[`)
    // missed.
    if (ctx.sourceFile) {
      const findings: RuleFinding[] = [];
      for (const hit of findNonNullExpressions(ctx.sourceFile)) {
        pushFinding(hit.line, hit.column, findings);
      }
      return findings;
    }

    // Regex fallback (no TS parse available — extremely rare for .ts files).
    const sanitized = stripCommentsAndStrings(ctx.content);
    const findings: RuleFinding[] = [];
    NON_NULL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NON_NULL_RE.exec(sanitized)) !== null) {
      const bangIdx = m.index + 1;
      const line = lineForOffset(ctx.content, bangIdx);
      pushFinding(line, 1, findings);
    }
    return findings;
  },
};
