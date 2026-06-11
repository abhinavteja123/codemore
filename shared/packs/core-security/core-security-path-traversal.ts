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

const JS_OPEN_RE = /\b(?:fs|fsPromises|fs\.promises)\.(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync|createWriteStream)\s*\(([^;)]+)\)/g;
const JS_SENDFILE_RE = /\b(?:res|response)\.(?:sendFile|download)\s*\(([^;)]+)\)/g;
const PY_OPEN_RE = /\bopen\s*\(([^)]+)\)/g;
const PY_SENDFILE_RE = /\bsend_file\s*\(([^)]+)\)/g;

// User-input ident hints — any of these inside the captured arg means we
// take the call seriously.
const USER_INPUT_HINT_RE = /\b(?:req|request|params|query|body|payload|args)\b\.|filename|file_name|\bname\b|user_input/;

// Same-file guard hints; presence of either (within ~6 lines) suppresses
// the finding because the developer is doing the right thing.
const GUARD_RE = /(?:path\.resolve|os\.path\.abspath|os\.path\.realpath|secure_filename)[^\n]*?(?:startswith|relative|within)|werkzeug\.utils\.secure_filename/;

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
  version: '1.1.0',
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
  citation: 'https://codemore.dev/rules/core-security-path-traversal',

  detect(ctx: RuleContext): RuleFinding[] {
    const isPy = ctx.language === 'python';
    const regexes = isPy ? [PY_OPEN_RE, PY_SENDFILE_RE] : [JS_OPEN_RE, JS_SENDFILE_RE];
    const findings: RuleFinding[] = [];
    for (const re of regexes) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ctx.content)) !== null) {
        const arg = m[1] ?? '';
        if (!USER_INPUT_HINT_RE.test(arg)) continue;
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
