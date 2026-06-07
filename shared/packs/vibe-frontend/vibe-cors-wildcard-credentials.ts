/* codemore-ignore-file: vibe-cors-wildcard-credentials */
/**
 * Rule: vibe-cors-wildcard-credentials
 *
 * Detects the CORS misconfiguration that vibe-coded apps reach for when
 * "fixing" a CORS error: setting `Access-Control-Allow-Origin: *` while
 * also sending credentials. The browser rejects this combination at runtime
 * (the W3C CORS spec disallows it), so the app does not work — and the
 * developer's mental model that they have permissive CORS is wrong.
 *
 * It is also a security tell: an LLM-generated route that says "*" for
 * origin AND `credentials: true` is almost always the result of cargo-culted
 * stack-overflow patches rather than a deliberate design.
 *
 * Detection (single-file):
 *   Any one of these in the same file:
 *     1. `Access-Control-Allow-Origin` header literal `*` together with
 *        `Access-Control-Allow-Credentials: true`.
 *     2. A cors() middleware call object literal containing both
 *        `origin: '*'` (or `origin: true`) and `credentials: true`.
 *     3. Express / Hono / Next.js handler that sets both header forms via
 *        res.setHeader / response.headers.set.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const WILDCARD_ORIGIN_RE =
  /Access-Control-Allow-Origin\s*['"]?\s*[:,]\s*['"]\s*\*\s*['"]|setHeader\s*\(\s*['"]Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]\s*\)|headers\.set\s*\(\s*['"]Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]\s*\)/gi;

const ALLOW_CREDENTIALS_HEADER_RE =
  /Access-Control-Allow-Credentials\s*['"]?\s*[:,]\s*['"]?\s*true\b/gi;

// cors() middleware object form.
// Note: trailing \b is intentionally omitted on the origin variant — after
// the closing quote of '*' the next char is typically ',' (both non-word),
// which never forms a word boundary and was causing missed matches.
const CORS_OBJECT_ORIGIN_STAR_RE = /\borigin\s*:\s*(?:['"]\*['"]|true(?!\w))/i;
const CORS_OBJECT_CREDENTIALS_TRUE_RE = /\bcredentials\s*:\s*true\b/i;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const vibeCorsWildcardCredentials: Rule = {
  id: 'vibe-cors-wildcard-credentials',
  version: '1.0.0',
  pack: 'vibe-frontend',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.9,
  title: 'CORS wildcard origin combined with credentials',
  whyItMatters:
    'Browsers reject `Access-Control-Allow-Origin: *` together with credentials at runtime — ' +
    'the route appears to allow everyone, but no actual cross-origin call succeeds. ' +
    'It is also a strong tell that the CORS layer was authored by trial-and-error: AI tools ' +
    'commonly emit this exact pair when prompted to "fix a CORS error". Either tighten the ' +
    'origin to a specific allowlist, or drop credentials.',
  citation: 'https://codemore.dev/rules/vibe-cors-wildcard-credentials',

  detect(ctx: RuleContext): RuleFinding[] {
    const content = ctx.content;
    const findings: RuleFinding[] = [];

    // Pattern A: header pair (Access-Control-Allow-Origin: '*' + Access-Control-Allow-Credentials: 'true')
    const credentialsTrue = ALLOW_CREDENTIALS_HEADER_RE.test(content);
    ALLOW_CREDENTIALS_HEADER_RE.lastIndex = 0;

    if (credentialsTrue) {
      WILDCARD_ORIGIN_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = WILDCARD_ORIGIN_RE.exec(content)) !== null) {
        const line = lineForOffset(content, m.index);
        const snippet = (ctx.lines[line - 1] ?? '').trim();
        findings.push(buildFinding(ctx, line, snippet, 'header-pair'));
      }
    }

    // Pattern B: cors() / corsOptions object literal with both fields.
    if (CORS_OBJECT_ORIGIN_STAR_RE.test(content) && CORS_OBJECT_CREDENTIALS_TRUE_RE.test(content)) {
      const matchOrigin = CORS_OBJECT_ORIGIN_STAR_RE.exec(content);
      if (matchOrigin && matchOrigin.index !== undefined) {
        const line = lineForOffset(content, matchOrigin.index);
        const snippet = (ctx.lines[line - 1] ?? '').trim();
        if (!findings.some(f => f.evidence.line === line)) {
          findings.push(buildFinding(ctx, line, snippet, 'cors-object'));
        }
      }
    }

    return findings;
  },
};

function buildFinding(
  ctx: RuleContext,
  line: number,
  snippet: string,
  pattern: 'header-pair' | 'cors-object',
): RuleFinding {
  return {
    evidence: {
      file: ctx.filePath,
      line,
      column: 1,
      snippet,
      matchedPattern: pattern,
    },
    suggestedFix: {
      type: 'code-patch',
      instructions:
        'Pick one of:\n\n' +
        '  (a) Allowlist specific origins instead of "*":\n' +
        '      origin: [\'https://app.example.com\', \'https://staging.example.com\']\n' +
        '  (b) Remove credentials if you genuinely need wildcard origin:\n' +
        '      // Drop credentials: true; cookies / Authorization headers will not be sent\n\n' +
        'For Next.js route handlers, prefer reading the request origin and echoing it ' +
        'after a strict membership check rather than wildcarding.',
      verificationCriteria: [
        'The file no longer combines Access-Control-Allow-Origin: * with credentials',
        'Allowed origins are an explicit allowlist OR credentials are disabled',
        'Cross-origin requests from a known good origin still work in a manual test',
      ],
    },
  };
}
