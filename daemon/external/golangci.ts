/**
 * golangci-lint adapter.
 *
 * Wraps `golangci-lint run --out-format json <root>`. Output shape:
 *   {
 *     "Issues": [
 *       {
 *         "FromLinter": "errcheck",
 *         "Text": "Error return value is not checked",
 *         "Severity": "",
 *         "Pos": { "Filename": "/abs/path/x.go", "Line": 12, "Column": 5 }
 *       }
 *     ]
 *   }
 *
 * Each finding becomes `ext:golangci:<linter>:<short-id>` so the agent
 * can distinguish errcheck from gosec from staticcheck etc.
 *
 * Per-linter severity:
 *   gosec      -> BLOCKER (Go's security linter)
 *   errcheck   -> MAJOR   (unchecked errors are real bugs)
 *   staticcheck/ineffassign/unused/typecheck/govet -> MAJOR
 *   gofmt/goimports/whitespace/wsl/lll -> MINOR (style)
 *   default    -> MAJOR
 *
 * Behaviour: same contract as ruff.ts (silent skip on missing binary,
 * timeout, parse-error tolerance).
 */

import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ReportIssue, Severity } from '../../shared/report/types';
import type { ExternalToolResult, ExternalToolDiagnostic } from './index';
import { parseToolJson, isRecord, type ParseResult } from './parseShape';

const LINTER_SEVERITY: Record<string, Severity> = {
  gosec: 'BLOCKER',
  errcheck: 'MAJOR',
  staticcheck: 'MAJOR',
  ineffassign: 'MAJOR',
  unused: 'MAJOR',
  typecheck: 'MAJOR',
  govet: 'MAJOR',
  gofmt: 'MINOR',
  goimports: 'MINOR',
  whitespace: 'MINOR',
  wsl: 'MINOR',
  lll: 'MINOR',
  godot: 'MINOR',
  gochecknoglobals: 'MINOR',
  gochecknoinits: 'MINOR',
  funlen: 'MINOR',
};

function classifySeverity(linter: string): Severity {
  return LINTER_SEVERITY[linter] ?? 'MAJOR';
}

interface GolangciIssue {
  FromLinter: string;
  Text: string;
  Pos: { Filename: string; Line: number; Column: number };
}

interface GolangciOutput {
  Issues?: GolangciIssue[];
}

interface RunOptions { timeoutMs: number }

/**
 * Parse golangci-lint's `--out-format json` stdout into the Issues array.
 * Empty output = clean run. golangci legitimately emits `"Issues": null`
 * for a clean run (Go marshals an empty slice as null), so present-but-null
 * is accepted; only a payload with NO `Issues` key at all (renamed schema /
 * old version) fails loud instead of silently reporting zero findings.
 */
export function parseGolangciOutput(stdout: string): ParseResult<GolangciIssue[]> {
  if (stdout.trim().length === 0) { return { value: [] }; }
  const res = parseToolJson<GolangciOutput>(
    stdout, 'golangci',
    (p) => {
      if (!isRecord(p) || !('Issues' in p)) { return false; }
      const iss = (p as Record<string, unknown>).Issues;
      return iss === null || Array.isArray(iss);
    },
    'is missing the "Issues" field',
  );
  if (res.value === null) { return { value: null, diagnostic: res.diagnostic }; }
  return { value: res.value.Issues ?? [] };
}

async function runGolangciJson(root: string, opts: RunOptions, diagnostics: ExternalToolDiagnostic[]):
    Promise<GolangciIssue[] | null> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn('golangci-lint', ['run', '--out-format', 'json', root], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      diagnostics.push({
        tool: 'golangci', level: 'info',
        message: `golangci-lint not on PATH; skipped (${(err as Error).message})`,
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

    proc.stdout?.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    proc.stderr?.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });

    proc.on('error', (err) => {
      clearTimeout(timer);
      const msg = (err as { code?: string }).code === 'ENOENT'
        ? 'golangci-lint not on PATH; install from https://golangci-lint.run/usage/install/'
        : `golangci-lint spawn failed: ${err.message}`;
      diagnostics.push({ tool: 'golangci', level: 'info', message: msg });
      resolve(null);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killedForTimeout) {
        diagnostics.push({ tool: 'golangci', level: 'warn', message: 'golangci-lint timeout; partial output ignored' });
        resolve(null);
        return;
      }
      // golangci-lint exits 0 with no findings, 1 with findings (NORMAL),
      // 2 for config error, 3 for warnings, higher for internal error.
      if (code !== null && code > 3) {
        diagnostics.push({
          tool: 'golangci', level: 'error',
          message: `golangci-lint exited with code ${code}: ${stderr.split('\n')[0] || '(no stderr)'}`,
        });
        resolve(null);
        return;
      }
      const { value, diagnostic } = parseGolangciOutput(stdout);
      if (diagnostic) { diagnostics.push(diagnostic); }
      resolve(value);
    });
  });
}

function relativise(rootAbs: string, fileAbs: string): string {
  let rel = path.relative(rootAbs, fileAbs);
  rel = rel.replace(/\\/g, '/');
  return rel.length === 0 ? path.basename(fileAbs) : rel;
}

function ulidLike(): string { return crypto.randomBytes(8).toString('hex'); }

export async function runGolangci(root: string, opts: RunOptions): Promise<ExternalToolResult> {
  const diagnostics: ExternalToolDiagnostic[] = [];
  const issues = await runGolangciJson(root, opts, diagnostics);
  if (issues === null) return { issues: [], diagnostics };

  const rootAbs = path.resolve(root);
  const out: ReportIssue[] = [];
  for (const f of issues) {
    if (!f || !f.Pos || !f.Pos.Filename) continue;
    const file = relativise(rootAbs, f.Pos.Filename);
    const linter = f.FromLinter || 'unknown';
    const msg = (f.Text || '').replace(/\s+/g, ' ').trim();
    out.push({
      id: `ext:golangci:${linter}`,
      ruleVersion: '1.0.0',
      instanceId: ulidLike(),
      severity: classifySeverity(linter),
      confidence: 0.8,
      category: 'best-practice',
      title: `golangci-lint ${linter}: ${msg.slice(0, 80)}`,
      whyItMatters:
        `${msg} (golangci-lint ${linter}). See https://golangci-lint.run/usage/linters/#${linter} for details.`,
      citation: `https://golangci-lint.run/usage/linters/#${linter}`,
      evidence: {
        file,
        line: f.Pos.Line,
        column: f.Pos.Column,
        snippet: msg.slice(0, 120),
        matchedPattern: linter,
      },
      suppression: {
        available: true,
        directive: `// codemore-ignore-next-line: ext:golangci:${linter}`,
        scope: 'next-line',
      },
    });
  }
  return { issues: out, diagnostics };
}
