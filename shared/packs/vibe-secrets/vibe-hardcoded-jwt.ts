/**
 * Rule: vibe-hardcoded-jwt
 *
 * Detects JWT-shape string literals committed to source code. A real JWT
 * has three base64url segments separated by dots; the first two segments
 * decode to JSON objects, so they always start with `eyJ` (the base64url
 * encoding of `{"`).
 *
 * Pattern:
 *   eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+
 *
 * Real-world incidents this catches:
 *   - Moltbook (Feb 2026): 1.5M tokens leaked via a Supabase service-role
 *     JWT hardcoded in a Next.js client component.
 *   - Auth0/Clerk dev tokens committed during local debugging.
 *   - Internal service-to-service JWTs left in a config blob.
 *
 * Coverage gap (documented in docs page):
 *   - Encrypted/wrapped tokens not in JWT shape are not caught.
 *   - Test fixtures often legitimately need example JWTs; the rule
 *     downgrades severity for files matching test/spec paths and lets
 *     users suppress with `// codemore-ignore-next-line`.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// JWT shape: header.payload.signature where header and payload start with eyJ.
// We anchor inside word characters so it won't match a substring of a longer
// alphanumeric run.
const JWT_RE = /(?<![A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})(?![A-Za-z0-9_-])/g;

// Paths typically containing test fixtures — findings here are downgraded.
const TEST_PATH_RE = /(?:^|\/)(?:__tests__|tests?|spec|fixtures?|examples?|mocks?)\//i;
const TEST_FILE_RE = /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;

function isTestContext(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return TEST_PATH_RE.test(norm) || TEST_FILE_RE.test(norm);
}

/**
 * Quick sanity filter: very-short or repetitive segments are more likely
 * to be illustrative placeholders than real tokens.
 */
function looksLikePlaceholder(token: string): boolean {
  const parts = token.split('.');
  if (parts.some(p => /^(.)\1{4,}$/.test(p))) return true;   // 'aaaaa.bbbbb.ccccc'
  if (parts.every(p => p.length < 12)) return true;          // suspiciously short
  return false;
}

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const vibeHardcodedJwt: Rule = {
  id: 'vibe-hardcoded-jwt',
  version: '1.0.0',
  pack: 'vibe-secrets',
  lifecycle: 'beta',
  // Scan source code AND structured config — most leaks live in one of these.
  languages: ['typescript', 'javascript', 'json', 'yaml'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.9,
  title: 'Hardcoded JWT in source',
  whyItMatters:
    'A JWT in source is a credential committed to git history forever. The Moltbook leak ' +
    '(Feb 2026, 1.5M tokens, 47 GB of agent chat history) was caused by exactly this — a ' +
    'Supabase service-role JWT hardcoded in a Next.js client component. Once shipped in a ' +
    'browser bundle or pushed to a public repo, the token must be rotated; deleting the line ' +
    'does not retroactively rotate the credential.',
  citation: 'https://codemore.tech/rules/vibe-hardcoded-jwt',

  detect(ctx: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];
    const testCtx = isTestContext(ctx.filePath);

    JWT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = JWT_RE.exec(ctx.content)) !== null) {
      const token = m[1];
      if (looksLikePlaceholder(token)) continue;

      const line = lineForOffset(ctx.content, m.index);
      const lineText = ctx.lines[line - 1] ?? '';

      // Show only the token's header to avoid echoing the full credential.
      const head = token.slice(0, 16);
      const redacted = `${head}...<redacted>...`;

      findings.push({
        severity: testCtx ? 'MAJOR' : 'BLOCKER',
        confidence: testCtx ? 0.7 : 0.9,
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          endLine: line,
          endColumn: lineText.length + 1,
          snippet: lineText.length > 120 ? lineText.slice(0, 60) + '...' : lineText,
          matchedPattern: 'jwt-3-segment-eyJ',
        },
        whyItMatters:
          `A JWT-shaped token \`${redacted}\` is hardcoded at ${ctx.filePath}:${line}. ` +
          (testCtx
            ? 'This file looks like a test fixture, so severity is reduced — but if this is a real token used in a real test, rotate it and switch to an env var.'
            : 'Treat the original token as compromised — git history preserves it even after a deletion commit.'),
        suggestedFix: {
          type: 'code-patch',
          instructions:
            'Remove the literal token and read it from an environment variable, e.g.:\n\n' +
            '  const token = process.env.MY_SERVICE_TOKEN;\n\n' +
            'Then:\n' +
            '  1. Rotate the leaked token in the issuing service (Supabase, Auth0, Clerk, …).\n' +
            '  2. Replace it everywhere with the env-var reference.\n' +
            '  3. Add the env-var name to .env.example without a value.\n' +
            '  4. If the token was ever pushed to a public branch, treat it as compromised regardless of subsequent rewrites — bundlers, mirrors, and indexes have already cached it.',
          verificationCriteria: [
            'The file no longer contains a 3-segment JWT-shaped literal',
            'The replacement reads the token from process.env',
            'The leaked token has been rotated in the issuing service',
          ],
        },
      });
    }

    return findings;
  },
};
