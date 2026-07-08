/**
 * Rule: vibe-mcp-config-secret
 *
 * Detects credentials embedded in MCP-server / agent-coding configuration
 * files (mcp.json, claude_desktop_config.json, .cursor/mcp.json, etc.).
 *
 * GitGuardian's State of Secrets Sprawl 2026 attributed >24,000 exposed
 * credentials to this pattern alone: developers paste a real API key into
 * an MCP config and commit it because the file looks like "just config".
 *
 * Detection strategy (single-file, JSON-only):
 *   - Filename matches the recognised MCP-config conventions.
 *   - Parse content as JSON. Find any object whose key is `env` (the
 *     standard slot where credentials get passed to an MCP child process).
 *   - For each (key, value) in that env object, flag values that look
 *     real (long, non-placeholder, not `${VAR}` indirection).
 *
 * Single-file scope. Covers the "I pasted my real key into mcp.json" bug.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const RECOGNISED_BASENAMES = new Set([
  'mcp.json',
  'claude_desktop_config.json',
  'cursor.json',
]);

const RECOGNISED_PATH_FRAGMENTS = [
  '/.cursor/mcp.json',
  '/.claude/mcp.json',
  '/.cursor/settings.json',
  '/.cursor/rules',
];

const SECRET_FRAGMENTS = [
  'KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'PASSWD',
  'API_KEY', 'API_TOKEN', 'DATABASE_URL', 'CONN_STRING',
  'PRIVATE', 'SERVICE_ROLE', 'AUTH', 'CREDENTIAL',
];

function basename(filePath: string): string {
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return slash >= 0 ? filePath.slice(slash + 1) : filePath;
}

function fileMatches(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/').toLowerCase();
  if (RECOGNISED_BASENAMES.has(basename(norm))) return true;
  return RECOGNISED_PATH_FRAGMENTS.some(f => norm.includes(f));
}

function keyLooksSecret(key: string): boolean {
  const upper = key.toUpperCase();
  return SECRET_FRAGMENTS.some(f => upper === f || upper.endsWith('_' + f) || upper.startsWith(f + '_') || upper.includes('_' + f + '_'));
}

function looksPlaceholder(value: string): boolean {
  if (value.length === 0) return true;
  if (value.length < 12) return true;
  if (value.startsWith('${') && value.endsWith('}')) return true;       // ${SOME_VAR}
  if (value.startsWith('$') && /^\$[A-Z_][A-Z0-9_]*$/.test(value)) return true; // $SOME_VAR
  const lower = value.toLowerCase();
  if (lower === 'your-key-here' || lower === 'changeme' || lower === 'todo') return true;
  if (/^<.+>$/.test(value)) return true;                                // <REPLACE_ME>
  return false;
}

function findLineOfValueOccurrence(content: string, value: string): number {
  // Best-effort: find the first occurrence of the value in the source text.
  // For repeated values across multiple keys the user gets one finding per
  // (key, value) pair but they all point to the same line. Acceptable for v1.
  const escaped = JSON.stringify(value);
  const idx = content.indexOf(escaped);
  if (idx < 0) return 1;
  let line = 1;
  for (let i = 0; i < idx; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

/** Recursively collect (key, value) pairs from any nested `env` object. */
function collectEnvEntries(node: unknown, out: Array<[string, string]>): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectEnvEntries(item, out);
    return;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === 'env' && v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ek, ev] of Object.entries(v as Record<string, unknown>)) {
        if (typeof ev === 'string') out.push([ek, ev]);
      }
      continue;
    }
    collectEnvEntries(v, out);
  }
}

export const vibeMcpConfigSecret: Rule = {
  id: 'vibe-mcp-config-secret',
  version: '1.0.0',
  pack: 'vibe-secrets',
  lifecycle: 'beta',
  languages: ['json'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.95,
  title: 'Real credential pasted into MCP config',
  whyItMatters:
    'MCP server configs (mcp.json, claude_desktop_config.json, .cursor/mcp.json) pass env vars ' +
    'straight to child processes. Hardcoded credentials here are committed to git verbatim. ' +
    'GitGuardian SOSS 2026 traced >24,000 exposed credentials to this exact pattern — ' +
    'developers paste a real key while wiring up an MCP integration, intending to clean it up later.',
  citation: 'https://codemore.tech/rules/vibe-mcp-config-secret',

  detect(ctx: RuleContext): RuleFinding[] {
    if (ctx.language !== 'json') return [];
    if (!fileMatches(ctx.filePath)) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(ctx.content);
    } catch {
      return [];   // Not valid JSON — skip silently.
    }

    const entries: Array<[string, string]> = [];
    collectEnvEntries(parsed, entries);

    const findings: RuleFinding[] = [];
    for (const [key, value] of entries) {
      if (!keyLooksSecret(key)) continue;
      if (looksPlaceholder(value)) continue;

      const line = findLineOfValueOccurrence(ctx.content, value);
      findings.push({
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          snippet: `"${key}": "<redacted ${value.length}-char value>"`,
          matchedPattern: 'mcp-env-real-credential',
        },
        whyItMatters:
          `MCP env key \`${key}\` carries a literal value (${value.length} chars). ` +
          `When this config is loaded, the value is passed verbatim to a child process — and ` +
          `it is also in your git history forever once committed.`,
        suggestedFix: {
          type: 'config-change',
          instructions:
            `Replace the literal value with an environment reference:\n\n` +
            `  "env": {\n` +
            `    "${key}": "\${${key}}"\n` +
            `  }\n\n` +
            `Then set \`${key}\` in your shell or in a .env file that is .gitignore'd. ` +
            `If the literal was ever committed, rotate the credential before re-shipping — ` +
            `git history preserves it regardless of subsequent edits.`,
          verificationCriteria: [
            `The "${key}" value in the MCP config no longer contains the literal credential`,
            `The replacement uses a $\{${key}\} reference resolved at runtime`,
            'The leaked credential has been rotated in the issuing service',
          ],
        },
      });
    }

    return findings;
  },
};
