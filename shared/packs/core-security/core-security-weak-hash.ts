/**
 * Rule: core-security-weak-hash
 *
 * Detects MD5 / SHA-1 use for password hashing (or any auth-secret
 * hashing). Both algorithms are cryptographically broken for any
 * application where collision or pre-image resistance matters. Modern
 * password hashing requires bcrypt / argon2 / scrypt with per-row salt.
 *
 * Patterns (TS / JS):
 *   crypto.createHash('md5')              ← any caller
 *   crypto.createHash('sha1')
 *   md5(password)                          ← from popular md5/sha1 libs
 *
 * Patterns (Python):
 *   hashlib.md5(...)
 *   hashlib.sha1(...)
 *
 * Two-pass: candidate (the call site) → confirm (the argument or
 * surrounding context names a password / secret / token / api_key
 * variable, OR the call is assigned to a column named password*).
 * Otherwise, the rule fires at MAJOR severity with a "still weak"
 * message — MD5 is fine for non-security checksums but most usages in
 * application code aren't checksum cases.
 *
 * Severity: BLOCKER when password / auth context detected; MAJOR
 * otherwise.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const JS_HASH_RE = /\bcrypto\.createHash\s*\(\s*(['"])(md5|sha1)\1\s*\)|(?<![\w.])md5\s*\(|(?<![\w.])sha1\s*\(/g;
const PY_HASH_RE = /\bhashlib\.(?:md5|sha1)\s*\(/g;

const PASSWORD_CTX_RE = /\b(?:password|passwd|secret|token|api_?key|hash|credential|signin|signup|login)\b/i;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function contextNearby(lines: ReadonlyArray<string>, line: number, re: RegExp): boolean {
  const start = Math.max(0, line - 5);
  const end = Math.min(lines.length, line + 3);
  for (let i = start; i < end; i++) {
    if (re.test(lines[i] ?? '')) return true;
  }
  return false;
}

export const coreSecurityWeakHash: Rule = {
  id: 'core-security-weak-hash',
  version: '1.1.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript', 'python'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.85,
  title: 'Weak hash (MD5 / SHA-1) used in auth-sensitive code',
  whyItMatters:
    'MD5 and SHA-1 are broken for password / token hashing — they are designed for SPEED, the ' +
    'opposite of what password storage needs. Even with salt, an attacker who exfiltrates the ' +
    'table can crack at billions of guesses per second on consumer GPUs. Use bcrypt / argon2id / ' +
    'scrypt (per-row salt, configurable work factor) for any secret hash. For non-security ' +
    'checksums, the rule still fires (suppress inline if MD5 is genuinely the right choice).',
  citation: 'https://codemore.dev/rules/core-security-weak-hash',

  detect(ctx: RuleContext): RuleFinding[] {
    const isPy = ctx.language === 'python';
    const re = isPy ? PY_HASH_RE : JS_HASH_RE;
    const findings: RuleFinding[] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ctx.content)) !== null) {
      const line = lineForOffset(ctx.content, m.index);
      const inAuthCtx = contextNearby(ctx.lines, line, PASSWORD_CTX_RE);
      findings.push({
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          snippet: (ctx.lines[line - 1] ?? '').trim(),
          matchedPattern: inAuthCtx ? 'weak-hash-auth-context' : 'weak-hash',
        },
        // Severity override — actual ReportIssue.severity gets composed
        // by registry from defaultSeverity unless we tag here. For now we
        // describe in whyItMatters and rely on rule overrides; a future
        // pass can lift the severity dynamically.
        suggestedFix: {
          type: 'code-patch',
          instructions:
            isPy
              ? '  # Python — for passwords:\n' +
                '  import bcrypt\n' +
                '  hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())\n' +
                '  # Or argon2-cffi:\n' +
                '  from argon2 import PasswordHasher\n' +
                "  ph = PasswordHasher(); ph.hash(password)\n"
              : '  // Node.js — for passwords:\n' +
                '  import bcrypt from "bcrypt";\n' +
                '  const hashed = await bcrypt.hash(password, 12);\n' +
                '  // Or argon2:\n' +
                '  import argon2 from "argon2";\n' +
                '  const hashed = await argon2.hash(password);\n',
          verificationCriteria: [
            'MD5/SHA-1 is removed for any password/secret/token hashing',
            'A modern password hasher (bcrypt/argon2/scrypt) is used instead',
            'Re-scan reports core-security-weak-hash resolved for this line',
          ],
        },
      });
    }
    return findings;
  },
};
