/**
 * Rule: core-quality-leftover-console
 *
 * Detects `console.log`, `console.debug`, `console.info`, `console.trace`
 * calls in production-shaped source files. These are the classic
 * "left in by accident" markers from AI-generated debugging code.
 *
 * Severity: MINOR (production), INFO (test paths). console.error and
 * console.warn are NOT flagged — they're usually intentional logging
 * on the server side and would generate too much noise.
 *
 * Coverage:
 *   - Matches `console.log(`, `console.debug(`, `console.info(`,
 *     `console.trace(` after stripping comments and string literals.
 *   - Test paths (/__tests__/, /tests/, .test.ts, .spec.ts) downgrade
 *     to INFO with lower confidence.
 *
 * Coverage gap:
 *   - We can't tell a "leftover debug log" from "intentional structured
 *     logging via console because no logger was wired up". Both fire.
 *   - Computed access (`console['log'](x)`) is not caught. Rare in
 *     practice.
 */

/* codemore-ignore-file: core-quality-leftover-console */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const CONSOLE_CALL_RE = /\bconsole\s*\.\s*(log|debug|info|trace)\s*\(/g;

const TEST_PATH_RE = /(?:^|\/)(?:__tests__|tests?|spec|fixtures?|examples?|mocks?)\//i;
const TEST_FILE_RE = /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;

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

export const coreQualityLeftoverConsole: Rule = {
  id: 'core-quality-leftover-console',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'code-smell',
  defaultSeverity: 'MINOR',
  defaultConfidence: 0.8,
  title: 'Leftover console.log / debug / info / trace',
  whyItMatters:
    'console.log left in production code is the most consistent AI-coding-tool artefact: a ' +
    '`console.log(\'here\')` from a debug session that never got cleaned up. In the browser these ' +
    'show up in DevTools and frequently leak structured data (user objects, tokens) attackers ' +
    'can scrape. Server-side they pollute logs at high volume and obscure real signal. ' +
    'console.error and console.warn are NOT flagged — they\'re usually intentional logging.',
  citation: 'https://codemore.dev/rules/core-quality-leftover-console',

  detect(ctx: RuleContext): RuleFinding[] {
    const sanitized = stripCommentsAndStrings(ctx.content);
    const testCtx = isTestContext(ctx.filePath);
    const findings: RuleFinding[] = [];

    CONSOLE_CALL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CONSOLE_CALL_RE.exec(sanitized)) !== null) {
      const method = m[1];
      const line = lineForOffset(ctx.content, m.index);
      findings.push({
        severity: testCtx ? 'INFO' : 'MINOR',
        confidence: testCtx ? 0.5 : 0.8,
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          snippet: (ctx.lines[line - 1] ?? '').trim(),
          matchedPattern: testCtx ? `console-${method}-test-context` : `console-${method}`,
        },
        whyItMatters: testCtx
          ? `console.${method} in a test path — usually intentional. Surfaced at INFO for inventory.`
          : `console.${method} in production source. Remove before shipping, or replace with a structured logger.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Either delete the \`console.${method}\` call or replace it with the project's ` +
            'structured logger:\n\n' +
            '  // Replace ad-hoc debug log:\n' +
            "  // console.log('user:', user);\n" +
            "  logger.debug({ userId: user.id }, 'lookup');\n\n" +
            'Avoid logging entire objects — pass only the fields the production log channel ' +
            'should keep, and rely on the logger to redact secrets.',
          verificationCriteria: [
            `The file no longer contains \`console.${method}(\``,
            'OR the call is suppressed with a comment explaining why it stays',
            're-scan reports core-quality-leftover-console resolved for this line',
          ],
        },
      });
    }
    return findings;
  },
};
