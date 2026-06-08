/**
 * Rule: core-security-shell-injection
 *
 * Detects child_process exec / execSync / spawn / spawnSync / execFile /
 * execFileSync called with a first argument that is NOT a pure string
 * literal. Any path that lets a user contribute to the command string is
 * a command-injection bug.
 *
 * Severity: BLOCKER. Modern Node code has structured alternatives for
 * every safe use of exec (`execFile` + args array, `spawn` + args array,
 * `vm.runInContext` for code, library calls for everything else).
 *
 * Coverage:
 *   - Template literal with `${}` interpolation -> BLOCKER (the variable
 *     value is interpolated into the shell command verbatim).
 *   - Identifier-only first arg (e.g. `exec(cmd)`) -> BLOCKER (we cannot
 *     prove the identifier holds a constant).
 *   - String concatenation (e.g. `'ls ' + path`) -> BLOCKER.
 *   - Pure string literal (e.g. `exec('npm --version')`) -> not flagged.
 *
 * Coverage gap:
 *   - We cannot tell whether `exec(cmd)` uses a constant from another file.
 *     Phase-2 cross-file dataflow analysis closes this.
 *   - execFile with an args array but a variable command path is flagged,
 *     because a variable binary path is itself a risk vector.
 */

/* codemore-ignore-file: core-security-shell-injection */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// Match calls to the child_process exec/spawn family. The function name
// must NOT be preceded by `.` or another word char — that excludes
// `regex.exec(content)`, `someObj.spawn(...)`, `arr.execFile(...)`, etc.,
// which are unrelated method calls that just happen to share the name.
// We still match `exec(...)`, `await exec(...)`, ` exec(...)`,
// `(exec)(...)`, etc. — anything where the name appears at a word
// boundary that ISN'T a member-access dot.
const EXEC_CALL_RE =
  /(?<![.\w$])(exec|execSync|execFile|execFileSync|spawn|spawnSync)\s*\(/g;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function stripJsComments(content: string): string {
  let out = content.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  return out;
}

/** Extract the first argument starting at `(`. Returns the raw text. */
function firstArgAfterParen(content: string, openParenIdx: number): string | null {
  let depth = 0;
  let i = openParenIdx;
  let start = -1;
  while (i < content.length) {
    const c = content[i];
    if (c === '(') {
      if (depth === 0) { start = i + 1; }
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) return content.slice(start, i);
    } else if (c === ',' && depth === 1) {
      return content.slice(start, i);
    } else if (c === '`' || c === '"' || c === "'") {
      // Skip the string literal contents to avoid early termination on a
      // comma / paren inside the string.
      const quote = c;
      i++;
      while (i < content.length && content[i] !== quote) {
        if (content[i] === '\\') i++;
        i++;
      }
    }
    i++;
  }
  return null;
}

type FirstArgKind = 'pure-literal' | 'template-with-interp' | 'identifier' | 'string-concat' | 'other-dynamic';

function classifyFirstArg(raw: string): FirstArgKind {
  const t = raw.trim();
  if (t.length === 0) return 'other-dynamic';

  // Template literal: `...`. If it contains ${...}, it's dynamic.
  if (t.startsWith('`') && t.endsWith('`')) {
    return /\$\{/.test(t) ? 'template-with-interp' : 'pure-literal';
  }
  // Plain string literal: '...' or "...".
  const litMatch = /^(['"])(.*)\1$/s.exec(t);
  if (litMatch) {
    // String concat? e.g. 'foo ' + bar — detect by trailing operator.
    if (/[+\-*/%]\s*$/.test(t.slice(0, t.length - 1))) return 'string-concat';
    return 'pure-literal';
  }
  // Anything else: try to detect concat — quote followed by `+` somewhere.
  if (/['"]\s*\+/.test(t) || /\+\s*['"]/.test(t)) return 'string-concat';
  // Bare identifier (or member access, call result, etc).
  if (/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*(\(\))?$/.test(t)) return 'identifier';
  return 'other-dynamic';
}

export const coreSecurityShellInjection: Rule = {
  id: 'core-security-shell-injection',
  version: '1.0.0',
  pack: 'core-security',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.9,
  title: 'Shell command built from dynamic input',
  whyItMatters:
    'child_process.exec / execSync / spawn / spawnSync pass their first argument to a shell ' +
    'parser. Any value that flows into that string is interpreted as shell — a single backtick, ' +
    '`;`, or `&&` in user input becomes attacker-controlled command execution. The structured ' +
    'alternative is execFile (or spawn) with an args ARRAY: each element is passed as a separate ' +
    'argv entry, with no shell interpretation.',
  citation: 'https://codemore.dev/rules/core-security-shell-injection',

  detect(ctx: RuleContext): RuleFinding[] {
    const sanitized = stripJsComments(ctx.content);
    const findings: RuleFinding[] = [];

    EXEC_CALL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EXEC_CALL_RE.exec(sanitized)) !== null) {
      const fnName = m[1];
      const openParenIdx = m.index + m[0].length - 1;
      const arg = firstArgAfterParen(sanitized, openParenIdx);
      if (arg === null) continue;
      const kind = classifyFirstArg(arg);
      if (kind === 'pure-literal') continue;

      const line = lineForOffset(ctx.content, m.index);
      findings.push({
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          snippet: (ctx.lines[line - 1] ?? '').trim(),
          matchedPattern: `${fnName}-with-${kind}`,
        },
        whyItMatters:
          `${fnName}(${arg.slice(0, 60).trim()}…) — first argument is ${kind}. ` +
          `If anything in that expression comes from user input, an attacker can inject ` +
          `arbitrary shell commands.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            'Switch to the args-array form, which never invokes a shell:\n\n' +
            "  import { execFile } from 'node:child_process';\n" +
            "  execFile('git', ['log', '--format=%H', refSpec], (err, stdout) => { ... });\n\n" +
            'or for spawn:\n\n' +
            "  import { spawn } from 'node:child_process';\n" +
            "  spawn('git', ['log', '--format=%H', refSpec]);\n\n" +
            'If you genuinely need shell features (pipes, redirection), validate the input ' +
            'against an allowlist and suppress this rule with a comment that documents the ' +
            'validation.',
          verificationCriteria: [
            'The call no longer uses exec / execSync with a dynamic first argument',
            'OR the call uses execFile / spawn with an args array, never concatenating user input into the command path',
            'Re-scan reports core-security-shell-injection resolved for this file',
          ],
        },
      });
    }

    return findings;
  },
};
