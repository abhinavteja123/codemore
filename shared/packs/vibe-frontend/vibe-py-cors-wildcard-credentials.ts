/**
 * Rule: vibe-py-cors-wildcard-credentials
 *
 * Python analogue of `vibe-cors-wildcard-credentials`. Detects wildcard
 * CORS origin combined with credentials in the same file, across the
 * three Python stacks vibe-coded apps actually use:
 *
 *   FastAPI / Starlette:
 *     app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True)
 *   Flask-CORS:
 *     CORS(app, origins="*", supports_credentials=True)
 *     CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
 *   Django (django-cors-headers settings):
 *     CORS_ALLOW_ALL_ORIGINS = True  +  CORS_ALLOW_CREDENTIALS = True
 *   Raw headers:
 *     response.headers["Access-Control-Allow-Origin"] = "*"  + ...Credentials
 *
 * Unlike the browser-rejected TS/Express case, this combination is
 * ACTIVELY dangerous in Python: Starlette and Flask-CORS both special-case
 * it by echoing the request Origin back — which grants every site on the
 * internet credentialed access to the API.
 *
 * Severity: BLOCKER.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// Wildcard-origin signals.
const WILDCARD_ORIGIN_RE = new RegExp(
  [
    /allow_origins\s*=\s*[[(]\s*['"]\*['"]/.source,          // FastAPI kwarg
    /\borigins\s*=\s*['"]\*['"]/.source,                      // Flask-CORS kwarg
    /['"]origins['"]\s*:\s*(?:[[(]\s*)?['"]\*['"]/.source,    // Flask-CORS resources dict
    /CORS_ALLOW_ALL_ORIGINS\s*=\s*True/.source,               // django-cors-headers >= 3.5
    /CORS_ORIGIN_ALLOW_ALL\s*=\s*True/.source,                // django-cors-headers legacy
    /['"]Access-Control-Allow-Origin['"]\s*[\]:]\s*=?\s*['"]\*['"]/.source, // raw header
  ].join('|'),
  'g',
);

// Credentials signals.
const CREDENTIALS_RE = new RegExp(
  [
    /allow_credentials\s*=\s*True/.source,                    // FastAPI kwarg
    /supports_credentials\s*=\s*True/.source,                 // Flask-CORS kwarg
    /CORS_ALLOW_CREDENTIALS\s*=\s*True/.source,               // django-cors-headers
    /['"]Access-Control-Allow-Credentials['"]\s*[\]:]\s*=?\s*['"]true['"]/.source, // raw header
  ].join('|'),
);

function stripPyComments(content: string): string {
  return content.replace(/(^|[^\\'"])#[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const vibePyCorsWildcardCredentials: Rule = {
  id: 'vibe-py-cors-wildcard-credentials',
  version: '1.0.0',
  pack: 'vibe-frontend',
  lifecycle: 'beta',
  languages: ['python'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.85,
  title: 'CORS wildcard origin combined with credentials',
  whyItMatters:
    'In FastAPI/Starlette and Flask-CORS, wildcard origin + credentials does NOT get rejected ' +
    'the way browsers reject the raw header pair — the middleware echoes the request Origin ' +
    'back, so every site on the internet gets credentialed access to your API. Any page a ' +
    'logged-in user visits can read their data and act as them. Tighten the origin to an ' +
    'explicit allowlist, or drop credentials.',
  citation: 'https://codemore.tech/rules/vibe-py-cors-wildcard-credentials',

  detect(ctx: RuleContext): RuleFinding[] {
    const content = stripPyComments(ctx.content);
    if (!CREDENTIALS_RE.test(content)) return [];

    const findings: RuleFinding[] = [];
    WILDCARD_ORIGIN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WILDCARD_ORIGIN_RE.exec(content)) !== null) {
      const line = lineForOffset(content, m.index);
      findings.push({
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          snippet: (ctx.lines[line - 1] ?? '').trim(),
          matchedPattern: 'py-cors-wildcard-credentials',
        },
        suggestedFix: {
          type: 'code-patch',
          instructions:
            'Pick one of:\n\n' +
            '  (a) Allowlist specific origins instead of "*":\n' +
            '      # FastAPI\n' +
            '      allow_origins=["https://app.example.com"]\n' +
            '      # Flask-CORS\n' +
            '      CORS(app, origins=["https://app.example.com"], supports_credentials=True)\n' +
            '      # Django\n' +
            '      CORS_ALLOWED_ORIGINS = ["https://app.example.com"]\n\n' +
            '  (b) Drop credentials if you genuinely need wildcard origin:\n' +
            '      allow_credentials=False  # cookies / Authorization headers not shared',
          verificationCriteria: [
            'The file no longer combines a wildcard origin with credentials',
            'Allowed origins are an explicit allowlist OR credentials are disabled',
            'Cross-origin requests from a known good origin still work in a manual test',
          ],
        },
      });
    }
    return findings;
  },
};
