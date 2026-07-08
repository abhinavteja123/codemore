/**
 * Rule: vibe-file-upload-no-validation
 *
 * Detects file-upload handlers that persist user uploads without an
 * extension allowlist OR MIME type check OR `secure_filename`. Matches
 * the OWASP "Unrestricted File Upload" risk class.
 *
 * Patterns (TS / JS):
 *   const f = req.file; await fs.promises.writeFile(uploadDir + f.originalname, f.buffer);
 *   await multer({ dest: 'uploads/' }).single('file');           ← multer with no fileFilter
 *
 * Patterns (Python):
 *   f = request.files['x']; f.save(os.path.join(UPLOADS, f.filename))
 *   file.save(target_path)                                       ← no extension/MIME check
 *
 * Confirm pass: we look for either an extension allowlist (`endswith`
 * in Python, `path.extname`/`mimetype`/`if (ALLOWED.includes(...))` in
 * JS), `secure_filename`, or a multer `fileFilter` callback within
 * ~10 lines of the save call.
 *
 * Severity: MAJOR. Exploitability depends on whether the served path is
 * webroot; on shared hosts it often is.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const JS_SAVE_RE = /\b(?:fs\.(?:promises\.)?writeFile|fs\.writeFileSync|fs\.createWriteStream|file\.move|file\.save)\s*\(([^;)]+)\)/g;
const JS_MULTER_RE = /\bmulter\s*\(\s*\{([^}]*)\}\s*\)/g;
const PY_SAVE_RE = /\b(?:[a-zA-Z_][\w]*\.save)\s*\(([^)]+)\)/g;

// User-upload hint in the captured arg.
const UPLOAD_HINT_RE = /\b(?:req|request)\.file|files\[|\.originalname\b|\.filename\b|UploadFile/i;

// Same-file guards we accept.
const GUARD_RE = /(?:endswith\s*\(|path\.extname\s*\(|allowed_extensions|ALLOWED\s*=|fileFilter\s*:|mimetype|content_type\s*==|secure_filename)/i;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function hasNearbyGuard(lines: ReadonlyArray<string>, line: number): boolean {
  const start = Math.max(0, line - 10);
  const end = Math.min(lines.length, line + 2);
  for (let i = start; i < end; i++) {
    if (GUARD_RE.test(lines[i] ?? '')) return true;
  }
  return false;
}

export const vibeFileUploadNoValidation: Rule = {
  id: 'vibe-file-upload-no-validation',
  version: '1.1.0',
  pack: 'vibe-frontend',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript', 'python'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.75,
  title: 'File upload saved without extension / MIME validation',
  whyItMatters:
    'AI-generated upload handlers routinely persist whatever the user sent, with the filename ' +
    'the user chose, under a webroot directory. An attacker uploads shell.php (or shell.aspx, or ' +
    'a polyglot SVG) and visits /uploads/shell.php to execute code. The defence is: allowlist ' +
    'extensions AND MIME types, rewrite the filename to a UUID, store outside the webroot.',
  citation: 'https://codemore.tech/rules/vibe-file-upload-no-validation',

  detect(ctx: RuleContext): RuleFinding[] {
    const isPy = ctx.language === 'python';
    const findings: RuleFinding[] = [];
    const regexes = isPy ? [PY_SAVE_RE] : [JS_SAVE_RE, JS_MULTER_RE];
    for (const re of regexes) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ctx.content)) !== null) {
        const arg = m[1] ?? '';
        if (re === JS_MULTER_RE) {
          // Multer config without fileFilter — that IS the smell.
          if (/fileFilter/.test(arg)) continue;
        } else {
          if (!UPLOAD_HINT_RE.test(arg)) continue;
        }
        const line = lineForOffset(ctx.content, m.index);
        if (hasNearbyGuard(ctx.lines, line)) continue;
        findings.push({
          evidence: {
            file: ctx.filePath,
            line,
            column: 1,
            snippet: (ctx.lines[line - 1] ?? '').trim(),
            matchedPattern: re === JS_MULTER_RE ? 'multer-no-filefilter' : 'upload-no-validation',
          },
          suggestedFix: {
            type: 'code-patch',
            instructions:
              isPy
                ? '  from werkzeug.utils import secure_filename\n' +
                  "  ALLOWED = {'png', 'jpg', 'pdf'}\n" +
                  '  ext = secure_filename(f.filename).rsplit(\".\", 1)[-1].lower()\n' +
                  '  if ext not in ALLOWED:\n' +
                  '      return \"invalid file\", 400\n' +
                  '  import uuid\n' +
                  '  target = os.path.join(UPLOADS, f\"{uuid.uuid4()}.{ext}\")\n' +
                  '  f.save(target)\n'
                : '  const ALLOWED = new Set([".png", ".jpg", ".pdf"]);\n' +
                  '  const ext = path.extname(req.file.originalname).toLowerCase();\n' +
                  '  if (!ALLOWED.has(ext)) return res.status(400).send("invalid file");\n' +
                  '  const id = crypto.randomUUID();\n' +
                  '  await fs.promises.writeFile(path.join(UPLOADS, `${id}${ext}`), req.file.buffer);\n',
            verificationCriteria: [
              'Extension or MIME type is checked against an allowlist before save',
              'Filename is rewritten (uuid) — do not preserve the user-supplied name',
              'Saved files are not under a path served by the webroot',
              'Re-scan reports vibe-file-upload-no-validation resolved for this line',
            ],
          },
        });
      }
    }
    return findings;
  },
};
