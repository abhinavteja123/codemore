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
 *
 * NOT flagged (v1.2.0): spawn / spawnSync / execFile / execFileSync called
 * with a variable command + an args argument and WITHOUT a literal
 * `shell: <truthy>` in the options. That form never invokes a shell — each
 * args element is a separate argv entry — so shell injection is impossible.
 * `spawn(cmd, args, { shell: true })` still fires, as does any command
 * string built by template/concat passed to ANY of these functions.
 */

/* codemore-ignore-file: core-security-shell-injection */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import { stripJsCommentsAndStrings } from '../../rules/stripContent';

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

/**
 * Extract the first argument starting at `(`, plus the [restStart, restEnd)
 * span of the remaining arguments (empty span when the call has one arg).
 * Offsets are valid in both original and sanitized content (the sanitizer
 * is byte-offset-preserving).
 */
function splitCallArgs(
  content: string,
  openParenIdx: number,
): { first: string; restStart: number; restEnd: number } | null {
  let depth = 0;
  let i = openParenIdx;
  let start = -1;
  let firstEnd = -1;
  while (i < content.length) {
    const c = content[i];
    if (c === '(') {
      if (depth === 0) { start = i + 1; }
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) {
        return {
          first: content.slice(start, firstEnd === -1 ? i : firstEnd),
          restStart: firstEnd === -1 ? i : firstEnd + 1,
          restEnd: i,
        };
      }
    } else if (c === ',' && depth === 1 && firstEnd === -1) {
      firstEnd = i;
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

// spawn/execFile family: an args array is passed straight to argv — no shell
// parsing — unless the options object opts back in with `shell: true`.
const NO_SHELL_BY_DEFAULT = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync']);

// Literal `shell:` option with anything but an explicitly-falsy value.
// `shell: someVar` counts as truthy — we can't prove the variable is false.
// Whitespace lives INSIDE the lookahead: with `\s*(?!false)` the `\s*`
// backtracks to zero and the lookahead passes on " false".
const SHELL_TRUTHY_RE = /\bshell\s*:(?!\s*(?:false|0|null|undefined)\b)/;

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
  // Part 7 §11B Fix 5: now strips string literals (not just comments) before
  // matching, so the rule no longer self-detects in its own whyItMatters
  // strings + Python rule files' multi-line example strings.
  // 1.2.0: stop flagging array-args spawn/execFile without a literal
  // `shell: true` — that form never invokes a shell (confirmed FP class on a
  // 1.35M-LOC scan).
  version: '1.2.0',
  pack: 'core-security',
  lifecycle: 'beta',
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
    const sanitized = stripJsCommentsAndStrings(ctx.content);
    const findings: RuleFinding[] = [];

    EXEC_CALL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EXEC_CALL_RE.exec(sanitized)) !== null) {
      const fnName = m[1];
      const openParenIdx = m.index + m[0].length - 1;
      // Extract the argument from ORIGINAL content so pure string literals
      // are classifiable. We use `sanitized` only to FIND the call site
      // (so the rule doesn't fire on its own JSDoc / string-literal examples).
      const args = splitCallArgs(ctx.content, openParenIdx);
      if (args === null) continue;
      const arg = args.first;
      const kind = classifyFirstArg(arg);
      if (kind === 'pure-literal') continue;

      // Safe form: spawn/execFile with a variable command + an args argument
      // does NOT run a shell, so a variable can't inject shell commands —
      // unless the call site literally opts in with `shell: true`. Command
      // strings BUILT dynamically (template/concat) still fall through and
      // fire, as do exec/execSync (always a shell) and single-arg calls like
      // `spawn(target)`. Check the rest-of-args in SANITIZED content so a
      // string literal containing "shell:" can't opt us back in.
      if (
        NO_SHELL_BY_DEFAULT.has(fnName) &&
        (kind === 'identifier' || kind === 'other-dynamic') &&
        args.restStart < args.restEnd &&
        !SHELL_TRUTHY_RE.test(sanitized.slice(args.restStart, args.restEnd))
      ) {
        continue;
      }

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
