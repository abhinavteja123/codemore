/**
 * Rule: core-security-hardcoded-password
 *
 * Detects a password/credential-named identifier being assigned or compared
 * to a non-placeholder string literal:
 *
 *   password = "hunter2"            (assignment / kwarg)
 *   "db_password": "hunter2"        (object / dict key)
 *   if password == "admin":         (auth backdoor comparison)
 *
 * Complements core-security-hardcoded-secret-pattern, which only catches
 * provider-issued tokens by canonical prefix (sk_live_*, ghp_*, AKIA*...).
 * This rule covers the long tail bandit calls B105: credentials with no
 * recognizable shape. Found via the 2026-07-07 external-recall audit —
 * bandit B105 caught `app.config['SECRET_KEY'] = 'dev'`-class findings the
 * prefix rule structurally cannot see.
 *
 * Precision discipline (the 22%→77% lesson): the identifier must END with a
 * credential keyword (`passwordField` does not match; `db_password` does),
 * the value must survive a placeholder filter, and comment lines are
 * skipped so docs examples don't self-match.
 *
 * Coverage gap (deliberate, v1.0.0):
 *   - env / yaml / json files excluded. `.env` is the *conventional* home
 *     for local credentials (and the walker scans gitignored `.env` via the
 *     secret-bypass) — flagging every `DB_PASSWORD=` there would be an FP
 *     storm. YAML skipped for templating noise ({{ .Values.password }}).
 *   - Unquoted values, f-string/template compositions: not detectable
 *     without taint tracking.
 */

/* codemore-ignore-file: core-security-hardcoded-password */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// Identifier must END with one of these (suffix-anchored): `db_password`
// and `adminPassword` match; `passwordField` / `password_hash` do not.
const CRED_NAME = /(?:password|passwd|pw|secret|secret[_-]?key|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|master[_-]?key|encryption[_-]?key|signing[_-]?key)$/i;

// Form A: identifier (optionally bracketed/quoted, e.g. config['SECRET_KEY'])
// assigned or compared to a string literal on the same line.
const ASSIGN_RE = /([A-Za-z_$][\w$]*(?:\s*\[\s*['"][\w-]+['"]\s*\])?|['"][\w-]+['"])\s*(?:[:=]|==+|!=+|:=)\s*(['"])((?:(?!\2)[^\n\\]|\\.)+)\2/g;

const PLACEHOLDER_VALUE = new RegExp(
  '^(?:' +
    '(.)\\1{2,}' +                                            // xxx, ***, ---, ...
    '|<[^>]*>?' +                                             // <your-password>
    '|\\$\\{.*|\\{\\{.*|%s|%\\(.*|__.*' +                     // interpolation/templating
    '|(?:your|my|the|a|placeholder|example|sample|fake|dummy|test|mock|changeme|change[-_]me|redacted|todo|fixme|none|null|undefined|true|false|password|passwd|secret|token|key|value|string|empty|unset|not[-_]?set|insert|replace|enter|paste)(?:[-_].*)?' +
  ')$',
  'i'
);

function isCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('<!--')
  );
}

function identifierName(raw: string): string {
  // config['SECRET_KEY'] → SECRET_KEY; "password" → password; else the
  // identifier itself.
  const bracket = /\[\s*['"]([\w-]+)['"]\s*\]$/.exec(raw);
  if (bracket) return bracket[1];
  return raw.replace(/^['"]|['"]$/g, '');
}

function isCredentialFinding(name: string, value: string): boolean {
  if (!CRED_NAME.test(name)) return false;
  if (value.length < 4) return false;                   // "x", "ab" test stubs
  if (/\s/.test(value)) return false;                   // sentences / UI labels
  if (PLACEHOLDER_VALUE.test(value)) return false;
  if (value.toLowerCase() === name.toLowerCase()) return false;
  if (/^[/.#]/.test(value)) return false;               // paths / CSS selectors
  if (/^(?:process\.env|os\.environ|env\.)/i.test(value)) return false;
  return true;
}

export const coreSecurityHardcodedPassword: Rule = {
  id: 'core-security-hardcoded-password',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript', 'python'],
  category: 'security',
  defaultSeverity: 'CRITICAL',
  defaultConfidence: 0.8,
  title: 'Hardcoded password / credential assignment',
  whyItMatters:
    'A literal credential assigned in source ships with every clone, image and bundle, and git ' +
    'history preserves it after removal. Unlike provider tokens there is no prefix to scan for, ' +
    'so these leak silently — the 2026-07 external-recall audit showed bandit B105 catching ' +
    'assignment-form credentials the prefix-based rule structurally misses. Comparisons like ' +
    '`password == "admin"` are worse: a backdoor that authenticates anyone who reads the source.',
  citation: 'https://codemore.tech/rules/core-security-hardcoded-password',

  detect(ctx: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];
    const lines = ctx.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.length === 0 || isCommentLine(trimmed)) continue;

      ASSIGN_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ASSIGN_RE.exec(line)) !== null) {
        const name = identifierName(m[1]);
        const value = m[3];
        if (!isCredentialFinding(name, value)) continue;

        const head = value.slice(0, 3);
        findings.push({
          evidence: {
            file: ctx.filePath,
            line: i + 1,
            column: m.index + 1,
            snippet: `${name} = "${head}…[redacted]"`,
            matchedPattern: 'credential-name-assigned-string-literal',
          },
          whyItMatters:
            `\`${name}\` is assigned a literal value at ${ctx.filePath}:${i + 1}. ` +
            `Treat it as compromised: git history preserves it even after removal.`,
          suggestedFix: {
            type: 'code-patch',
            instructions:
              `Read the credential from the environment instead of the source:\n\n` +
              `  TS/JS:  const ${name} = process.env.${name.replace(/\W+/g, '_').toUpperCase()};\n` +
              `  Python: ${name} = os.environ["${name.replace(/\W+/g, '_').toUpperCase()}"]\n\n` +
              `Then:\n` +
              `  1. Rotate the credential in the issuing system.\n` +
              `  2. Add the variable name to .env.example without a value.\n` +
              `  3. If this was a comparison (\`== "..."\`) it is an auth backdoor — ` +
              `replace with a real credential check, not an env var.`,
            verificationCriteria: [
              `The file no longer assigns or compares \`${name}\` to a string literal`,
              `The replacement reads the value from the environment or a secret manager`,
              `The leaked value has been rotated`,
            ],
          },
        });
      }
    }

    return findings;
  },
};
