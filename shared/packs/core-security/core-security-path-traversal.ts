/**
 * Rule: core-security-path-traversal
 *
 * Detects user-supplied filenames concatenated onto a file-system path
 * without the standard `abspath + startswith(safe_dir)` guard. Maps to
 * CWE-22 and OWASP A03 (Injection).
 *
 * Patterns (TS / JS):
 *   fs.readFile(req.params.name, ...)
 *   fs.createReadStream(BASE + req.query.name)
 *   res.sendFile(path.join(UPLOADS, req.params.f))    ← if no inside-base check
 *
 * Patterns (Python):
 *   open(BASE + name)                                 ← name from request
 *   open(f'{BASE}/{name}')
 *   send_file(f'/uploads/{filename}')
 *
 * Severity: BLOCKER. A successful attack reads any file the process can
 * read — `/etc/passwd`, `.env`, every uploaded user's data.
 *
 * Confirm pass: we ONLY fire if (a) the candidate site uses user-input
 * idents (`req`, `request`, `params`, `query`, `body`, route param like
 * `name`/`file`/`filename`/`id`) AND (b) the surrounding ~6 lines do NOT
 * contain `path.resolve`/`os.path.abspath`/`os.path.realpath` followed by
 * a `startswith` check.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';
import { stripJsCommentsAndStrings, stripPyCommentsAndStrings } from '../../rules/stripContent';

const JS_OPEN_RE = /\b(?:fs|fsPromises|fs\.promises)\.(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync|createWriteStream)\s*\(([^;)]+)\)/g;
const JS_SENDFILE_RE = /\b(?:res|response)\.(?:sendFile|download)\s*\(([^;)]+)\)/g;
const PY_OPEN_RE = /\bopen\s*\(([^)]+)\)/g;
const PY_SENDFILE_RE = /\bsend_file\s*\(([^)]+)\)/g;

// User-input ident hints — any of these inside the captured arg means we
// take the call seriously. Part 7 §11B Fix 5: dropped bare `\bargs\b` (CLI
// argument parsers like `args.file` were being confused with HTTP request
// data). Keeps `\bname\b` (common user-input variable in web handlers) at
// the cost of some FP risk on `record.name`/`user.name`-style accesses;
// the `hasNearbyGuard` check filters most of those.
const USER_INPUT_HINT_RE = /\b(?:req|request)\b\.|\.(?:params|query|body|formData|json)\b|\bfilename\b|\bfile_name\b|\buser_input\b|\bname\b/;

// Same-file guard hints; presence of either (within ~6 lines) suppresses
// the finding because the developer is doing the right thing.
const GUARD_RE = /(?:path\.resolve|os\.path\.abspath|os\.path\.realpath|secure_filename)[^\n]*?(?:startswith|relative|within)|werkzeug\.utils\.secure_filename/;

// v1.3.0: constant-only joins are not traversal. `os.path.join(FIGURES_DIR,
// "fig2_bkt_data.json")` tripped the `.json` user-input hint via the literal
// filename, but when every component is a string literal or an UPPER_CASE
// module constant there is no untrusted input to traverse with. Identifiers
// that are pure path machinery (os.path.join, path.resolve, __dirname, the
// f-string prefix) are trusted too; anything else (name, filename, req, a
// function parameter) keeps the finding.
const TRUSTED_IDENT_RE = /^(?:[A-Z][A-Z0-9_]*|os|path|join|resolve|dirname|Path|f|__file__|__dirname)$/;

function isConstantOnlyArg(arg: string): boolean {
  // Keep f-string / template-literal interpolations visible (they can carry
  // untrusted vars), then blank string-literal bodies so literals like
  // "fig2_bkt_data.json" contribute no identifiers.
  const interps = arg.match(/\$?\{[^}]*\}/g)?.join(' ') ?? '';
  const noStrings = arg.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, ' ');
  const idents = `${noStrings} ${interps}`.match(/[A-Za-z_$][A-Za-z0-9_$]*/g);
  return idents === null || idents.every((id) => TRUSTED_IDENT_RE.test(id));
}

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function hasNearbyGuard(lines: ReadonlyArray<string>, line: number): boolean {
  const start = Math.max(0, line - 7);
  const end = Math.min(lines.length, line + 1);
  for (let i = start; i < end; i++) {
    if (GUARD_RE.test(lines[i] ?? '')) return true;
  }
  return false;
}

export const coreSecurityPathTraversal: Rule = {
  id: 'core-security-path-traversal',
  // Part 7 §11B Fix 5: strip strings + comments before matching (eliminates
  // self-detection in this file's own JSDoc) AND tightened user-input hint
  // to drop bare `args` (eliminates CLI-arg confusion with HTTP `req.params`).
  // v1.3.0: skip constant-only path expressions (all components string
  // literals or UPPER_CASE constants) — see isConstantOnlyArg.
  version: '1.3.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript', 'python'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.8,
  title: 'File path built from user input without an inside-base guard',
  whyItMatters:
    'A user-controlled filename concatenated into open() / readFile / sendFile lets an attacker ' +
    'send "../../etc/passwd" and read arbitrary files the process can access. The defence is two ' +
    'lines: resolve the candidate path to an absolute path, then refuse anything that does not ' +
    'sit inside your designated directory.',
  citation: 'https://codemore.tech/rules/core-security-path-traversal',

  detect(ctx: RuleContext): RuleFinding[] {
    const isPy = ctx.language === 'python';
    // Strip strings + comments so we don't match the rule's own JSDoc
    // examples (the file you're reading shows `fs.readFile(req.params.name, ...)`
    // inside its OWN JSDoc and used to flag itself as a BLOCKER).
    // We use `sanitized` to FIND the call site (regex match position) and
    // then extract the actual argument from the ORIGINAL content — so the
    // user-input hint check sees real identifiers like `name`, `filename`,
    // and f-string interpolations, not blanked-out spaces.
    const sanitized = isPy ? stripPyCommentsAndStrings(ctx.content) : stripJsCommentsAndStrings(ctx.content);
    const regexes = isPy ? [PY_OPEN_RE, PY_SENDFILE_RE] : [JS_OPEN_RE, JS_SENDFILE_RE];
    const findings: RuleFinding[] = [];
    for (const re of regexes) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sanitized)) !== null) {
        // Extract the argument from the ORIGINAL content at the same offset.
        // Strip-stripped content has the same byte positions, so the
        // capture group bounds in the original = m.index + match offset.
        const argStart = m.index + m[0].indexOf('(') + 1;
        const argEnd = m.index + m[0].lastIndexOf(')');
        const arg = ctx.content.slice(argStart, argEnd);
        if (!USER_INPUT_HINT_RE.test(arg)) continue;
        if (isConstantOnlyArg(arg)) continue;
        const line = lineForOffset(ctx.content, m.index);
        if (hasNearbyGuard(ctx.lines, line)) continue;
        findings.push({
          evidence: {
            file: ctx.filePath,
            line,
            column: 1,
            snippet: (ctx.lines[line - 1] ?? '').trim(),
            matchedPattern: 'path-traversal-candidate',
          },
          suggestedFix: {
            type: 'code-patch',
            instructions:
              isPy
                ? '  import os\n' +
                  "  BASE = os.path.abspath('/safe/dir')\n" +
                  '  candidate = os.path.abspath(os.path.join(BASE, name))\n' +
                  "  if not candidate.startswith(BASE + os.sep):\n" +
                  '      raise PermissionError(\"path escapes safe dir\")\n'
                : '  import path from "node:path";\n' +
                  '  const BASE = path.resolve(uploadsDir);\n' +
                  '  const candidate = path.resolve(BASE, name);\n' +
                  '  if (!candidate.startsWith(BASE + path.sep)) {\n' +
                  '    return res.status(400).send("invalid path");\n' +
                  '  }\n',
            verificationCriteria: [
              'The candidate path is resolved via path.resolve / os.path.abspath',
              'A startswith / relative check rejects paths outside the safe base',
              'Re-scan reports core-security-path-traversal resolved for this line',
            ],
          },
        });
      }
    }
    return findings;
  },
};
