/**
 * Rule: vibe-cookie-missing-flags
 *
 * Session middleware / cookie config that's missing `httpOnly: true`,
 * `secure: true`, or `sameSite: 'lax'|'strict'`. AI-generated auth code
 * routinely uses a session library with default options that turn ALL
 * three of these off.
 *
 * Patterns we recognise:
 *   express-session:    session({ ... })
 *   iron-session:       sealData / Iron config / `getIronSession(req,res, { cookieOptions: {...} })`
 *   cookie-session:     cookieSession({ ... })
 *   next-auth (v4):     cookies: { sessionToken: { options: { ... } } } in NextAuth config
 *   res.cookie('name', val, { ... })
 *
 * Severity: MAJOR. Missing `secure` over HTTPS turns into a session-token
 * sniff. Missing `httpOnly` turns into XSS → session-token theft. Missing
 * `sameSite` opens CSRF.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// Match `<callee>({ ... }, ...)` where callee is one of the known session
// constructors. The body capture is the FIRST options-object literal.
const SESSION_CALL_RE = /\b(?:session|cookieSession|getIronSession|res\.cookie|response\.cookie)\s*\(\s*(?:[^,{]+,\s*)?\{([^{}]{0,400})\}/g;
// next-auth cookies block — different shape; the options live on a
// nested key. Catch the inner `options: { ... }`.
const NEXTAUTH_OPTIONS_RE = /options\s*:\s*\{([^{}]{0,300})\}/g;

const HAS_HTTPONLY_RE  = /\bhttpOnly\s*:\s*true\b/;
const HAS_SECURE_RE    = /\bsecure\s*:\s*(?:true|process\.env\.NODE_ENV\s*[=!]={1,2}\s*['"]production['"])/;
const HAS_SAMESITE_RE  = /\bsameSite\s*:\s*['"]?(?:lax|strict|true)['"]?/i;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const vibeCookieMissingFlags: Rule = {
  id: 'vibe-cookie-missing-flags',
  version: '1.1.0',
  pack: 'vibe-frontend',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.8,
  title: 'Session cookie config is missing httpOnly / secure / sameSite',
  whyItMatters:
    'Default session cookies in express-session, iron-session, cookie-session and Next.js are ' +
    'sent over HTTP without httpOnly + secure + sameSite unless the config explicitly sets each. ' +
    'AI-generated apps almost never bother. Result: any XSS becomes a session-token exfiltrate; ' +
    'any HTTP fallback becomes a sniff; any third-party POST is a CSRF.',
  citation: 'https://codemore.dev/rules/vibe-cookie-missing-flags',

  detect(ctx: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];
    for (const re of [SESSION_CALL_RE, NEXTAUTH_OPTIONS_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ctx.content)) !== null) {
        const body = m[1] ?? '';
        const missing: string[] = [];
        if (!HAS_HTTPONLY_RE.test(body)) missing.push('httpOnly: true');
        if (!HAS_SECURE_RE.test(body))   missing.push('secure: true');
        if (!HAS_SAMESITE_RE.test(body)) missing.push("sameSite: 'lax'");
        if (missing.length === 0) continue;
        const line = lineForOffset(ctx.content, m.index);
        findings.push({
          evidence: {
            file: ctx.filePath,
            line,
            column: 1,
            snippet: (ctx.lines[line - 1] ?? '').trim(),
            matchedPattern: `cookie-missing:${missing.length}`,
          },
          whyItMatters:
            `Cookie/session config is missing: ${missing.join(', ')}. Set each before deploying.`,
          suggestedFix: {
            type: 'code-patch',
            instructions:
              `Add the missing flags to the cookie options object:\n\n` +
              missing.map(s => `  ${s},`).join('\n') +
              `\n\nFor "secure": in development, condition on NODE_ENV so localhost still works:\n` +
              `  secure: process.env.NODE_ENV === 'production'`,
            verificationCriteria: [
              'Cookie options include httpOnly: true',
              'Cookie options include secure: true (or NODE_ENV-conditional in dev)',
              "Cookie options include sameSite: 'lax' or 'strict'",
              'Re-scan reports vibe-cookie-missing-flags resolved for this line',
            ],
          },
        });
      }
    }
    return findings;
  },
};
