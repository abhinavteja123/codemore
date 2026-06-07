/**
 * Rule: vibe-public-env-leak
 *
 * Detects env-file entries whose key combines a "public" prefix with a name
 * fragment that looks like a real secret. These are the exact pattern that
 * caused the Moltbook leak (Feb 2026, 1.5M API tokens, 47GB of agent
 * conversation history) — a service-role key shipped to the browser via
 * NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.
 *
 * Frameworks that inline env vars into the client bundle when prefixed:
 *   NEXT_PUBLIC_*   (Next.js)
 *   VITE_*          (Vite / SvelteKit / Vue / etc.)
 *   REACT_APP_*     (CRA)
 *   PUBLIC_*        (Astro)
 *   EXPO_PUBLIC_*   (Expo)
 *   GATSBY_*        (Gatsby — every env var is inlined!)
 *
 * Any of those prefixes paired with a suffix in SECRET_FRAGMENTS = bug.
 *
 * Coverage gap (documented in docs page):
 *   - .env.example / .env.template / .env.sample are skipped (placeholder vals).
 *   - Inferred from key name only — we do not validate the value shape.
 *     A future v1.1 will add JWT/Anon-key entropy checks.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const PUBLIC_PREFIXES = [
  'NEXT_PUBLIC_',
  'VITE_',
  'REACT_APP_',
  'PUBLIC_',
  'EXPO_PUBLIC_',
  'GATSBY_',
] as const;

// Name fragments that flag the variable as carrying a secret. The matcher
// (findSecretFragment) treats each fragment as a token bounded by `_` or
// the start/end of the suffix — so `ADMIN_KEY` matches `ADMIN_KEY` exactly
// and `SUB_ADMIN_KEY` at the end, but does NOT match `BOOKADMIN_KEYRING`.
const SECRET_FRAGMENTS = [
  'SERVICE_ROLE',
  'SERVICE_KEY',
  'SERVICEKEY',
  'PRIVATE_KEY',
  'PRIVATEKEY',
  'SECRET_KEY',
  'SECRETKEY',
  'SECRET',
  'PRIVATE',
  'PASSWORD',
  'PASSWD',
  'ADMIN_KEY',
  'ROOT_KEY',
  'MASTER_KEY',
  'DATABASE_URL',
  'STRIPE_SECRET',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
] as const;

// Filenames we treat as placeholders, not real env files.
const PLACEHOLDER_BASENAMES = new Set([
  '.env.example',
  '.env.template',
  '.env.sample',
  '.env.dist',
]);

/** Parse a .env line into { key, value } if it is an assignment, else null. */
function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.replace(/^\s*export\s+/i, '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq < 0) return null;
  const key = trimmed.slice(0, eq).trim();
  if (!key || !/^[A-Z_][A-Z0-9_]*$/i.test(key)) return null;
  let value = trimmed.slice(eq + 1).trim();
  // Strip surrounding quotes.
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function findPublicPrefix(key: string): string | null {
  for (const prefix of PUBLIC_PREFIXES) {
    if (key.startsWith(prefix)) return prefix;
  }
  return null;
}

function findSecretFragment(suffix: string): string | null {
  const upper = suffix.toUpperCase();
  for (const fragment of SECRET_FRAGMENTS) {
    if (
      upper === fragment ||
      upper.startsWith(fragment + '_') ||
      upper.endsWith('_' + fragment) ||
      upper.includes('_' + fragment + '_')
    ) {
      return fragment;
    }
  }
  return null;
}

/** Empty or placeholder-looking values get demoted; obvious real values stay BLOCKER. */
function looksPlaceholder(value: string): boolean {
  if (value.length === 0) return true;
  const lower = value.toLowerCase();
  return (
    lower === 'your-key-here' ||
    lower === 'changeme' ||
    lower === 'xxx' ||
    lower === 'todo' ||
    /^<.+>$/.test(value)              // <REPLACE_ME>
  );
}

function basename(filePath: string): string {
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return slash >= 0 ? filePath.slice(slash + 1) : filePath;
}

export const vibePublicEnvLeak: Rule = {
  id: 'vibe-public-env-leak',
  version: '1.0.0',
  pack: 'vibe-secrets',
  lifecycle: 'experimental',
  languages: ['env'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.95,
  title: 'Secret exposed via public env var',
  whyItMatters:
    'Env vars prefixed with NEXT_PUBLIC_, VITE_, REACT_APP_, PUBLIC_, EXPO_PUBLIC_, or GATSBY_ are ' +
    'inlined into the browser bundle. Pairing one of those prefixes with a key name like ' +
    'SERVICE_ROLE, SECRET, PRIVATE_KEY, or DATABASE_URL ships your secret to every visitor. ' +
    'The Moltbook leak (Feb 2026) exposed 1.5M API tokens this way via a single misnamed ' +
    'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY in production.',
  citation: 'https://codemore.dev/rules/vibe-public-env-leak',

  detect(ctx: RuleContext): RuleFinding[] {
    if (ctx.language !== 'env') return [];
    if (PLACEHOLDER_BASENAMES.has(basename(ctx.filePath))) return [];

    const findings: RuleFinding[] = [];

    for (let i = 0; i < ctx.lines.length; i++) {
      const line = ctx.lines[i];
      const parsed = parseEnvLine(line);
      if (!parsed) continue;

      const prefix = findPublicPrefix(parsed.key);
      if (!prefix) continue;

      const suffix = parsed.key.slice(prefix.length);
      const fragment = findSecretFragment(suffix);
      if (!fragment) continue;

      const placeholder = looksPlaceholder(parsed.value);

      findings.push({
        severity: placeholder ? 'CRITICAL' : 'BLOCKER',
        confidence: placeholder ? 0.7 : 0.95,
        evidence: {
          file: ctx.filePath,
          line: i + 1,
          column: 1,
          endLine: i + 1,
          endColumn: line.length + 1,
          snippet: line.length > 120 ? line.slice(0, 60) + '... [redacted]' : line.split('=')[0] + '=...',
          matchedPattern: `public-prefix-${prefix}with-secret-fragment-${fragment}`,
        },
        whyItMatters:
          `\`${parsed.key}\` combines the public-bundle prefix \`${prefix}\` with the secret-looking fragment \`${fragment}\`. ` +
          `Any client of this app will receive this value in their browser bundle.`,
        suggestedFix: {
          type: 'config-change',
          instructions:
            `Remove the \`${prefix}\` prefix from \`${parsed.key}\` and consume the variable only from server-side code:\n\n` +
            `  ${parsed.key.slice(prefix.length)}=...\n\n` +
            `If this value really must reach the client, you are using the wrong secret — for Supabase use the anon key, not the service-role key. ` +
            `After renaming, rotate the secret: anything ever shipped to a public bundle must be treated as compromised.`,
          verificationCriteria: [
            `Env file no longer contains a key starting with \`${prefix}\` and containing \`${fragment}\``,
            'The replacement (server-only) key is referenced via process.env in server code, never imported into client code',
            'The exposed secret has been rotated in the provider dashboard',
          ],
        },
      });
    }

    return findings;
  },
};
