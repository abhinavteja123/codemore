/**
 * Rule: core-typescript-as-any
 *
 * Detects `as any` casts. These are TypeScript's escape hatch and the
 * single most common pattern AI tools reach for when the type system
 * pushes back. Each one is a place where compile-time safety has been
 * silently disabled.
 *
 * Severity: MAJOR. Not a security bug per se, but a quality regression
 * that compounds — one `as any` rarely stays one; the codebase trends
 * toward more of them over time once the precedent is set.
 *
 * Coverage gap:
 *   - We don't distinguish `as any` cast (bad) from `as any[]` cast
 *     (also bad). Both fire.
 *   - We don't catch the equivalent `<any>x` cast (deprecated TSX-
 *     incompatible syntax). A v1.1 AST pass could add it.
 *   - Comments and string literals containing the text "as any" are
 *     stripped before matching, so docs that mention the pattern do
 *     not fire.
 */

/* codemore-ignore-file: core-typescript-as-any */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// Word-bounded match. The trailing (?!\w) prevents matching e.g. "as anyway".
const AS_ANY_RE = /\bas\s+any(?!\w)/g;

// Test paths get a confidence downgrade — `as any` in test fixtures is
// usually pragmatic shimming around the test framework, not production risk.
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

/** Replace comments AND string literals with whitespace, preserving offsets. */
function stripCommentsAndStrings(content: string): string {
  let out = content.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  // Conservative string stripping: handle " ' ` consecutively, no escape
  // tracking. Misses string boundaries when a backslash escapes a quote,
  // but the worst case is a false negative, not a false positive.
  out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, m => ' '.repeat(m.length));
  out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, m => ' '.repeat(m.length));
  out = out.replace(/`(?:[^`\\]|\\.)*`/g, m => m.replace(/[^\n]/g, ' '));
  return out;
}

export const coreTypescriptAsAny: Rule = {
  id: 'core-typescript-as-any',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'experimental',
  languages: ['typescript'],
  category: 'maintainability',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.85,
  title: 'Type assertion to `any` disables compile-time safety',
  whyItMatters:
    '`as any` tells TypeScript to skip every check on the expression. The compile-time guarantee ' +
    'that protects every downstream usage of this value silently disappears. Each cast is a place ' +
    'a future refactor can introduce a runtime error that the compiler would otherwise catch. ' +
    'AI tools default to `as any` when the type system pushes back; the cost compounds over time.',
  citation: 'https://codemore.dev/rules/core-typescript-as-any',

  detect(ctx: RuleContext): RuleFinding[] {
    const sanitized = stripCommentsAndStrings(ctx.content);
    const testCtx = isTestContext(ctx.filePath);
    const findings: RuleFinding[] = [];

    AS_ANY_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = AS_ANY_RE.exec(sanitized)) !== null) {
      const line = lineForOffset(ctx.content, m.index);
      const snippet = (ctx.lines[line - 1] ?? '').trim();
      findings.push({
        severity: testCtx ? 'MINOR' : 'MAJOR',
        confidence: testCtx ? 0.6 : 0.85,
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          snippet,
          matchedPattern: testCtx ? 'as-any-test-context' : 'as-any',
        },
        whyItMatters: testCtx
          ? '`as any` in a test-shaped path — usually pragmatic shimming, but still drops type safety. Downgraded to MINOR.'
          : '`as any` in production code drops type safety for every downstream usage of this value.',
        suggestedFix: {
          type: 'code-patch',
          instructions:
            'Replace `as any` with a narrower alternative:\n\n' +
            '  - Known shape but not exported?         define a local type / interface.\n' +
            '  - Unknown shape (e.g. parsed JSON)?     `as unknown` + a runtime validator\n' +
            '                                          (zod, valibot) before downstream use.\n' +
            '  - Third-party type is wrong?            create a module declaration in a .d.ts\n' +
            '                                          file (`declare module "x"`).\n' +
            '  - The cast is genuinely unavoidable?    suppress with a comment that\n' +
            '                                          explains why.',
          verificationCriteria: [
            'The file no longer contains an `as any` cast',
            'OR each remaining cast is suppressed inline with a comment explaining the trust assumption',
            'tsc still type-checks without error',
            'Re-scan reports core-typescript-as-any resolved for this file',
          ],
        },
      });
    }

    return findings;
  },
};
