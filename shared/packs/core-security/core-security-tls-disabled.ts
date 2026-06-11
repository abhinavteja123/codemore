/**
 * Rule: core-security-tls-disabled
 *
 * Detects TLS certificate verification being explicitly disabled. The
 * fix in the moment is always the same: don't disable it. The number of
 * production incidents where someone "temporarily" set `verify=False`
 * and forgot to revert is depressingly large.
 *
 * Patterns (TS / JS):
 *   axios({ rejectUnauthorized: false, ... })
 *   new https.Agent({ rejectUnauthorized: false })
 *   fetch(url, { agent: <agent with rejectUnauthorized: false> })   (not statically caught here)
 *   process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
 *
 * Patterns (Python):
 *   requests.get(url, verify=False)
 *   urllib3.disable_warnings()
 *   urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
 *   ssl.create_default_context().verify_mode = ssl.CERT_NONE
 *   ssl._create_unverified_context()
 *
 * Severity: MAJOR. Disabled TLS verification is a network MITM.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const PATTERNS: ReadonlyArray<{ langs: ReadonlyArray<string>; re: RegExp; pattern: string }> = [
  { langs: ['typescript', 'javascript'], re: /\brejectUnauthorized\s*:\s*false\b/g, pattern: 'reject-unauthorized-false' },
  { langs: ['typescript', 'javascript'], re: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0['"]?/g, pattern: 'node-tls-reject-unauthorized-0' },
  { langs: ['python'], re: /\bverify\s*=\s*False\b/g, pattern: 'requests-verify-false' },
  { langs: ['python'], re: /\burllib3\.disable_warnings\s*\(/g, pattern: 'urllib3-disable-warnings' },
  { langs: ['python'], re: /\bssl\.CERT_NONE\b/g, pattern: 'ssl-cert-none' },
  { langs: ['python'], re: /\bssl\._create_unverified_context\s*\(/g, pattern: 'ssl-unverified-context' },
];

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const coreSecurityTlsDisabled: Rule = {
  id: 'core-security-tls-disabled',
  version: '1.1.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript', 'python'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.95,
  title: 'TLS certificate verification explicitly disabled',
  whyItMatters:
    'Disabling TLS verification (rejectUnauthorized=false, verify=False, urllib3.disable_warnings, ' +
    'NODE_TLS_REJECT_UNAUTHORIZED=0, _create_unverified_context) silently turns every HTTPS call ' +
    'into a man-in-the-middle attack vector. The "fix later" comment people leave next to these ' +
    'lines never gets revisited. Fix the underlying cert issue (pin the right CA, regenerate the ' +
    'dev cert) instead of bypassing verification.',
  citation: 'https://codemore.dev/rules/core-security-tls-disabled',

  detect(ctx: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];
    for (const { langs, re, pattern } of PATTERNS) {
      if (!langs.includes(ctx.language)) continue;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ctx.content)) !== null) {
        const line = lineForOffset(ctx.content, m.index);
        findings.push({
          evidence: {
            file: ctx.filePath,
            line,
            column: 1,
            snippet: (ctx.lines[line - 1] ?? '').trim(),
            matchedPattern: pattern,
          },
          suggestedFix: {
            type: 'code-patch',
            instructions:
              'Re-enable certificate verification:\n\n' +
              '  // Node.js — delete the flag, fix the underlying cert chain.\n' +
              '  axios({ ... })       ← omit rejectUnauthorized entirely.\n\n' +
              '  # Python\n' +
              '  requests.get(url)    ← omit verify=False; pass verify=<ca_bundle_path>\n' +
              '                         if you need a custom CA.\n\n' +
              'For local dev, generate a trusted local CA with mkcert and add to your\n' +
              'system trust store; do NOT push verify=False into production code.',
            verificationCriteria: [
              'No TLS-disable flag remains on the production path',
              'The underlying cert / CA issue is addressed (correct CA, correct hostname)',
              'Re-scan reports core-security-tls-disabled resolved for this line',
            ],
          },
        });
      }
    }
    return findings;
  },
};
