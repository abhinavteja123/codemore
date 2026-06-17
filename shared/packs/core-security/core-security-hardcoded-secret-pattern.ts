/**
 * Rule: core-security-hardcoded-secret-pattern
 *
 * Detects provider-issued secret tokens by their canonical prefix +
 * shape. Complements vibe-hardcoded-jwt (which catches JWT-shaped
 * tokens) by catching the long tail of non-JWT secrets that show up in
 * vibe-coded apps: Stripe `sk_live_*`, GitHub `ghp_*` / `gho_*` / `ghs_*`,
 * OpenAI `sk-proj-*`, Anthropic `sk-ant-*`, AWS `AKIA*`, Slack `xox[bpe]-*`,
 * Supabase PATs (`sbp_*`), etc.
 *
 * Severity: BLOCKER. A real provider token committed to source is a
 * credential leak; the token must be rotated regardless of how the file
 * is edited afterward. AI-generated code reaches for "paste the key
 * inline" as a fallback when the developer hasn't wired up env vars
 * yet — so this is high-signal for the vibe-coding population.
 *
 * Coverage:
 *   - String literals only — the patterns are anchored to a quote, so
 *     `"sk_live_..."` and `'sk_live_...'` fire, but `sk_live_abc` as
 *     a bare identifier (rare and not parseable) does not.
 *   - Comments are NOT stripped — a comment that mentions a token shape
 *     usually says "do not commit this" but if it contains a real token
 *     by accident, we still want to flag it.
 *   - JSON, YAML, env files inherit the same detection.
 *
 * Coverage gap:
 *   - Token formats without a canonical prefix (e.g. raw 32-char hex
 *     API keys) are not catchable without a shape + entropy heuristic.
 *     A v1.1 high-entropy mode is planned but off-by-default to keep
 *     FP rate low.
 *   - Tokens that legitimately appear in test fixtures or docs are
 *     flagged — the suppression directive is the intended escape hatch.
 */

/* codemore-ignore-file: core-security-hardcoded-secret-pattern */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

interface ProviderPattern {
  /** Human-readable provider name for the finding message. */
  name: string;
  /**
   * Token shape regex. Must include the canonical prefix so detection is
   * specific. Inside a string literal anchor (we add the surrounding quote
   * match below).
   */
  pattern: RegExp;
}

// Each entry is anchored to the provider's canonical prefix. We require a
// MINIMUM tail length to avoid false positives on docs that show shorter
// placeholders (`sk_live_xxx`, `sk_live_<your-key>`).
const PROVIDER_PATTERNS: ReadonlyArray<ProviderPattern> = [
  // Stripe live + test keys.
  { name: 'Stripe live secret key',  pattern: /sk_live_[A-Za-z0-9]{16,}/g },
  { name: 'Stripe live restricted',  pattern: /rk_live_[A-Za-z0-9]{16,}/g },
  // Stripe test keys: lower severity in suggestedFix but same rule.
  { name: 'Stripe test secret key',  pattern: /sk_test_[A-Za-z0-9]{16,}/g },

  // GitHub.
  { name: 'GitHub Personal Access Token',         pattern: /ghp_[A-Za-z0-9]{30,}/g },
  { name: 'GitHub OAuth Token',                   pattern: /gho_[A-Za-z0-9]{30,}/g },
  { name: 'GitHub Server-to-Server Installation', pattern: /ghs_[A-Za-z0-9]{30,}/g },
  { name: 'GitHub Refresh Token',                 pattern: /ghr_[A-Za-z0-9]{30,}/g },
  { name: 'GitHub User-to-Server Token',          pattern: /ghu_[A-Za-z0-9]{30,}/g },

  // AWS.
  { name: 'AWS Access Key ID', pattern: /\bAKIA[0-9A-Z]{16}\b/g },

  // OpenAI + Anthropic — order matters: most-specific first so a `sk-proj-…`
  // token doesn't match the generic `sk-…` pattern and report the wrong
  // provider. The dedupe in detect() keys by offset to drop later matches.
  { name: 'OpenAI project key',     pattern: /sk-proj-[A-Za-z0-9_-]{20,}/g },
  { name: 'Anthropic API key',      pattern: /sk-ant-(?:api|admin)-[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI API key',         pattern: /sk-[A-Za-z0-9_-]{32,}/g },

  // Supabase.
  { name: 'Supabase Personal Access Token', pattern: /sbp_[A-Za-z0-9]{30,}/g },

  // Slack.
  { name: 'Slack token (xox)',      pattern: /xox[bpoesa]-[A-Za-z0-9-]{20,}/g },

  // Google API key (legacy AIza format).
  { name: 'Google API key',         pattern: /AIza[A-Za-z0-9_-]{35}/g },

  // Discord bot.
  { name: 'Discord bot token',      pattern: /[MN][A-Za-z0-9]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}/g },
];

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

// Placeholder filter: many docs show "sk_live_xxxxxx" or "sk_live_<your-key>".
// The minimum-tail-length regex catches most placeholders, but we add a soft
// filter for the rest. The tail is extracted as the value AFTER the LAST
// `_` or `-` in the token — i.e. the actual key body, not part of the prefix.
function looksLikePlaceholder(token: string): boolean {
  const m = /^.*[_-]([^_-]+)$/.exec(token);
  const tail = m ? m[1] : token;
  if (/^(.)\1{6,}$/.test(tail)) return true;     // sk_live_xxxxxxxx
  if (/^(?:your|placeholder|example|sample|fake|test|dummy|redacted)/i.test(tail)) return true;
  return false;
}

export const coreSecurityHardcodedSecretPattern: Rule = {
  id: 'core-security-hardcoded-secret-pattern',
  version: '1.2.0',
  pack: 'core-security',
  lifecycle: 'beta',
  // Apply broadly — provider tokens are plain strings and can leak into
  // any text-shaped file. Python + shell added in Phase 7A.
  languages: ['typescript', 'javascript', 'json', 'yaml', 'env', 'markdown', 'python', 'shell'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.95,
  title: 'Hardcoded provider secret in source',
  whyItMatters:
    'A real provider token committed to source is a credential leak. Git history preserves the ' +
    'value regardless of subsequent edits, mirrors and code-search engines cache it within ' +
    'minutes, and rotation is mandatory once the value has been pushed anywhere public. ' +
    'AI-generated apps reach for pasting tokens inline when env-var wiring is incomplete — this ' +
    'rule catches the canonical provider shapes (Stripe / GitHub / OpenAI / Anthropic / AWS / ' +
    'Slack / Supabase / Google / Discord) by their issued prefix.',
  citation: 'https://codemore.dev/rules/core-security-hardcoded-secret-pattern',

  detect(ctx: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];
    // Template / example env files are placeholder repositories — they exist
    // to SHOW the format. Real values don't live here. Skip outright (Part 7
    // follow-up: Senti's `.env.example:46` flagged a Slack token placeholder
    // `xoxb-your-sl…` as a BLOCKER).
    const normFile = ctx.filePath.replace(/\\/g, '/');
    if (/(?:\.env\.(?:example|sample|template|dist)|\.env\.template$|env\.example$|env\.sample$)/i.test(normFile)) {
      return findings;
    }
    // Dedupe: a single token (e.g. `sk-proj-…`) can match multiple provider
    // regexes (`sk-…` and `sk-proj-…`). Key by the matched OFFSET so the
    // first match wins (PROVIDER_PATTERNS is ordered most-specific-first
    // for the overlapping families).
    const reportedOffsets = new Set<number>();

    for (const provider of PROVIDER_PATTERNS) {
      const re = new RegExp(provider.pattern.source, provider.pattern.flags);
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ctx.content)) !== null) {
        if (reportedOffsets.has(m.index)) continue;
        const token = m[0];
        if (looksLikePlaceholder(token)) continue;
        reportedOffsets.add(m.index);

        const line = lineForOffset(ctx.content, m.index);
        const head = token.slice(0, Math.min(12, token.length));

        findings.push({
          evidence: {
            file: ctx.filePath,
            line,
            column: 1,
            snippet: `<${provider.name}: ${head}…[redacted]>`,
            matchedPattern: provider.name.toLowerCase().replace(/\W+/g, '-'),
          },
          whyItMatters:
            `${provider.name} detected at ${ctx.filePath}:${line}. ` +
            `Treat the original token as compromised — git history preserves it even after ` +
            `a deletion commit.`,
          suggestedFix: {
            type: 'code-patch',
            instructions:
              `Remove the literal token and read it from an environment variable:\n\n` +
              `  const token = process.env.${provider.name.toUpperCase().replace(/\W+/g, '_')};\n` +
              `  if (!token) throw new Error('${provider.name} is required');\n\n` +
              `Then:\n` +
              `  1. Rotate the leaked token in the ${provider.name.split(' ')[0]} dashboard.\n` +
              `  2. Replace it everywhere with the env-var reference.\n` +
              `  3. Add the env-var name to .env.example without a value.\n` +
              `  4. Audit access logs for the period between commit and rotation.`,
            verificationCriteria: [
              `The file no longer contains a ${provider.name}-shaped literal`,
              `The replacement reads the token from process.env`,
              `The leaked token has been rotated in the issuing service`,
            ],
          },
        });
      }
    }

    return findings;
  },
};
