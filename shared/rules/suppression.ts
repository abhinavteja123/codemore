/**
 * Suppress-Comment Parser
 *
 * Extracted from daemon/services/staticAnalyzer.ts so every rule —
 * regardless of which engine (TS-AST, regex, external tool adapter)
 * produced it — gets the same suppression semantics.
 *
 * Supported directives:
 *
 *   const x = eval(y); // codemore-ignore: no-eval
 *   // codemore-ignore-next-line: no-eval
 *   const x = eval(y);
 *   /* codemore-ignore-file: no-eval *\/
 *
 * Multiple rule ids can be listed comma-separated:
 *   // codemore-ignore: no-eval, vibe-supabase-rls-disabled
 *
 * The wildcard `*` suppresses all rules at that location.
 */

export interface SuppressedRule {
  /** Rule id, or '*' for wildcard. */
  ruleId: string;
  /**
   * Line number the suppression applies to (1-indexed).
   * -1 means file-wide.
   */
  line: number;
}

// Comment leaders recognised across the languages CodeMore scans:
//   //  → JS/TS/Go/Rust/C/C++/C#/Java/Swift/Kotlin/Scala
//   --  → SQL/Haskell/Lua/Ada
//   #   → Python/Ruby/Shell/YAML/TOML/Dockerfile
//   /* ... */ → C-style block (used by file-level directive across all
//               languages that recognise it; also covers CSS, SCSS, JSON5)
const LINE_LEADER = '(?:\\/\\/|--|#)';

const SAME_LINE_RE  = new RegExp(`${LINE_LEADER}\\s*codemore-ignore:\\s*([a-zA-Z0-9\\-_,\\s*]+)`);
const NEXT_LINE_RE  = new RegExp(`${LINE_LEADER}\\s*codemore-ignore-next-line:\\s*([a-zA-Z0-9\\-_,\\s*]+)`);
const FILE_LEVEL_RE = /\/\*\s*codemore-ignore-file:\s*([a-zA-Z0-9\-_,\s*]+)\s*\*\//;

function parseRuleList(raw: string): string[] {
  return raw
    .split(',')
    .map(r => r.trim())
    .filter(Boolean);
}

/**
 * Scan file content for suppression directives.
 *
 * Returns one SuppressedRule per (ruleId, line) pair.
 */
export function extractSuppressComments(content: string): SuppressedRule[] {
  const suppressed: SuppressedRule[] = [];
  const lines = content.split('\n');

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNumber = idx + 1;

    const sameLineMatch = line.match(SAME_LINE_RE);
    if (sameLineMatch) {
      for (const ruleId of parseRuleList(sameLineMatch[1])) {
        suppressed.push({ ruleId, line: lineNumber });
      }
    }

    const nextLineMatch = line.match(NEXT_LINE_RE);
    if (nextLineMatch) {
      for (const ruleId of parseRuleList(nextLineMatch[1])) {
        suppressed.push({ ruleId, line: lineNumber + 1 });
      }
    }

    const fileMatch = line.match(FILE_LEVEL_RE);
    if (fileMatch) {
      for (const ruleId of parseRuleList(fileMatch[1])) {
        suppressed.push({ ruleId, line: -1 });
      }
    }
  }

  return suppressed;
}

/**
 * Test whether a finding at (ruleId, line) is suppressed.
 */
export function isLocationSuppressed(
  ruleId: string,
  line: number,
  suppressed: ReadonlyArray<SuppressedRule>,
): boolean {
  return suppressed.some(
    s =>
      (s.ruleId === ruleId || s.ruleId === '*') &&
      (s.line === -1 || s.line === line),
  );
}
