/**
 * Ruff adapter.
 *
 * Wraps `ruff check --output-format json <root>`. The JSON output is
 * an array of diagnostic objects:
 *
 *   [{
 *     "code": "F401",
 *     "message": "'os' imported but unused",
 *     "filename": "/abs/path/x.py",
 *     "location":     { "row": 1,  "column": 1 },
 *     "end_location": { "row": 1,  "column": 9 },
 *     "fix": { "applicability": "safe", "edits": [...] }
 *   }, ...]
 *
 * We translate each to a `ReportIssue` with:
 *   - id: `ext:ruff:<code>`              (e.g. ext:ruff:F401)
 *   - severity: rule-prefix based map    (S = BLOCKER, F = MAJOR, E = MINOR, …)
 *   - confidence: 0.8                    (fixed across adapters)
 *   - whyItMatters: ruff's message
 *   - citation: deep link to ruff's rule docs
 *   - file: workspace-relative path
 *
 * Behavior contract:
 *   - Missing binary → silent skip, returns [] + one 'info' diagnostic.
 *   - Non-zero exit code → ruff reports findings via exit 1, that's NORMAL.
 *     We only treat exit > 1 as an error.
 *   - Timeout → kills the process, returns [] + one 'warn' diagnostic.
 *   - Invalid JSON (ruff crashed mid-output) → returns [] + one 'error'
 *     diagnostic with the parse error message.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ReportIssue, Severity } from '../../shared/report/types';
import type { ExternalToolResult, ExternalToolDiagnostic } from './index';

/**
 * Ruff rule codes are prefixed by category. Each prefix maps to a
 * canonical severity. Anything we don't recognise falls through to MINOR.
 *
 * Reference: https://docs.astral.sh/ruff/rules/
 */
const RUFF_PREFIX_SEVERITY: ReadonlyArray<[RegExp, Severity]> = [
  [/^S\d+$/,   'BLOCKER'],   // flake8-bandit (security)
  [/^E9\d+$/,  'BLOCKER'],   // syntax errors
  [/^F4\d{2}$/,'MAJOR'],     // import-bug class (F401, F403, F405, F811, F821, F841)
  [/^F\d+$/,   'MAJOR'],     // other pyflakes (F-rules) — real bugs
  [/^B\d+$/,   'MAJOR'],     // flake8-bugbear
  [/^E\d+$/,   'MINOR'],     // pycodestyle errors (style)
  [/^W\d+$/,   'MINOR'],     // pycodestyle warnings (style)
  [/^N\d+$/,   'MINOR'],     // pep8-naming
  [/^D\d+$/,   'INFO'],      // pydocstyle
  [/^I\d+$/,   'MINOR'],     // isort
];

function classifySeverity(code: string): Severity {
  for (const [re, sev] of RUFF_PREFIX_SEVERITY) {
    if (re.test(code)) return sev;
  }
  return 'MINOR';
}

function shortMessage(message: string): string {
  // Some ruff messages embed a newline; collapse for our snippet field.
  return message.replace(/\s+/g, ' ').trim();
}

function deepLinkForCode(code: string): string {
  // Lowercase code per ruff's URL convention.
  return `https://docs.astral.sh/ruff/rules/${code.toLowerCase()}/`;
}

interface RuffDiagnostic {
  code: string;
  message: string;
  filename: string;
  location: { row: number; column: number };
  end_location?: { row: number; column: number };
}

interface RuffRunOptions {
  timeoutMs: number;
}

/** Run ruff and return its parsed JSON output OR null when the tool is
 *  unavailable / failed before producing output. */
async function runRuffJson(root: string, opts: RuffRunOptions, diagnostics: ExternalToolDiagnostic[]):
    Promise<RuffDiagnostic[] | null> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn('ruff', ['check', '--output-format', 'json', root], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      diagnostics.push({
        tool: 'ruff', level: 'info',
        message: `ruff not on PATH; skipped (${(err as Error).message})`,
      });
      resolve(null);
      return;
    }

    let stdout = '';
    let stderr = '';
    let killedForTimeout = false;
    const timer = setTimeout(() => {
      killedForTimeout = true;
      try { proc.kill('SIGTERM'); } catch { /* noop */ }
    }, opts.timeoutMs);

    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

    proc.on('error', (err) => {
      clearTimeout(timer);
      const msg = (err as { code?: string }).code === 'ENOENT'
        ? 'ruff not on PATH; install with `pip install ruff` to enable Python coverage'
        : `ruff spawn failed: ${err.message}`;
      diagnostics.push({ tool: 'ruff', level: 'info', message: msg });
      resolve(null);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killedForTimeout) {
        diagnostics.push({ tool: 'ruff', level: 'warn', message: 'ruff timeout; partial output ignored' });
        resolve(null);
        return;
      }
      // Ruff exit codes:
      //   0 = no findings
      //   1 = findings present (THIS IS NORMAL for us — we WANT findings)
      //   2 = configuration / argument error
      //   higher = internal error
      if (code !== 0 && code !== 1) {
        diagnostics.push({
          tool: 'ruff', level: 'error',
          message: `ruff exited with code ${code}: ${stderr.split('\n')[0] || '(no stderr)'}`,
        });
        resolve(null);
        return;
      }
      if (stdout.trim().length === 0) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (!Array.isArray(parsed)) {
          diagnostics.push({ tool: 'ruff', level: 'error', message: 'ruff output was not a JSON array' });
          resolve(null);
          return;
        }
        resolve(parsed as RuffDiagnostic[]);
      } catch (err) {
        diagnostics.push({
          tool: 'ruff', level: 'error',
          message: `failed to parse ruff JSON output: ${(err as Error).message}`,
        });
        resolve(null);
      }
    });
  });
}

function relativise(rootAbs: string, fileAbs: string): string {
  let rel = path.relative(rootAbs, fileAbs);
  rel = rel.replace(/\\/g, '/');
  if (rel.length === 0) rel = path.basename(fileAbs);
  return rel;
}

function ulidLike(): string {
  // Cheap unique id; we don't need ULID monotonicity here.
  return crypto.randomBytes(8).toString('hex');
}

export async function runRuff(root: string, opts: RuffRunOptions): Promise<ExternalToolResult> {
  const diagnostics: ExternalToolDiagnostic[] = [];
  const findings = await runRuffJson(root, opts, diagnostics);
  if (findings === null) {
    return { issues: [], diagnostics };
  }

  const rootAbs = path.resolve(root);
  const issues: ReportIssue[] = [];
  for (const f of findings) {
    if (!f || typeof f.code !== 'string' || typeof f.filename !== 'string' || !f.location) continue;
    const file = relativise(rootAbs, f.filename);
    const code = f.code;
    const severity = classifySeverity(code);
    const msg = shortMessage(f.message ?? '');
    issues.push({
      id: `ext:ruff:${code}`,
      ruleVersion: '1.0.0',
      instanceId: ulidLike(),
      severity,
      confidence: 0.8,
      category: 'best-practice',
      title: `ruff ${code}: ${msg.slice(0, 80)}`,
      whyItMatters:
        `${msg} (ruff rule ${code}). ` +
        `This finding came from the ruff adapter; see ${deepLinkForCode(code)} for the rule's docs.`,
      citation: deepLinkForCode(code),
      evidence: {
        file,
        line: f.location.row,
        column: f.location.column,
        endLine: f.end_location?.row,
        endColumn: f.end_location?.column,
        snippet: msg.slice(0, 120),
        matchedPattern: code,
      },
      suggestedFix: undefined,
      suppression: {
        available: true,
        directive: `// codemore-ignore-next-line: ext:ruff:${code}`,
        scope: 'next-line',
      },
    });
  }
  return { issues, diagnostics };
}
