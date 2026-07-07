/**
 * clippy adapter.
 *
 * Wraps `cargo clippy --message-format=json --quiet`. The output is
 * newline-delimited JSON, one record per line. We only care about
 * records of kind `"compiler-message"` whose `.message.code.code`
 * starts with `clippy::` (or the canonical rustc lint prefixes).
 *
 * Each finding becomes `ext:clippy:<short-code>` (after stripping the
 * `clippy::` prefix when present).
 *
 * Severity translation:
 *   `error`         -> BLOCKER  (rustc errors break the build anyway)
 *   `warning`       -> MAJOR
 *   `note` / `help` -> MINOR / INFO
 *
 * Behaviour: same contract as ruff.ts.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ReportIssue, Severity } from '../../shared/report/types';
import type { ExternalToolResult, ExternalToolDiagnostic } from './index';

interface ClippySpan {
  file_name: string;
  line_start: number;
  column_start: number;
  line_end?: number;
  column_end?: number;
  is_primary?: boolean;
}

interface ClippyMessage {
  message: string;
  level: 'error' | 'warning' | 'note' | 'help';
  code?: { code: string } | null;
  spans?: ClippySpan[];
}

interface ClippyRecord {
  reason: string;
  message?: ClippyMessage;
}

function classifySeverity(level: ClippyMessage['level']): Severity {
  switch (level) {
    case 'error':   return 'BLOCKER';
    case 'warning': return 'MAJOR';
    case 'note':    return 'MINOR';
    case 'help':    return 'INFO';
  }
}

interface RunOptions { timeoutMs: number }

/**
 * Parse cargo/clippy's newline-delimited JSON (`--message-format=json`).
 * Each line is one record; we keep `compiler-message` records. A clean
 * build legitimately yields JSON records with zero compiler-messages, so
 * zero findings alone is NOT an error. But if cargo emitted content and
 * NOT ONE line parsed as JSON (old cargo, a panic, format drift), that is
 * reported loud with an error diagnostic instead of a silent zero.
 */
export function parseClippyOutput(stdout: string): { messages: ClippyMessage[]; diagnostic?: ExternalToolDiagnostic } {
  const messages: ClippyMessage[] = [];
  let jsonLines = 0;
  let failedLines = 0;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) { continue; }
    try {
      const rec = JSON.parse(trimmed) as ClippyRecord;
      jsonLines++;
      if (rec.reason === 'compiler-message' && rec.message) {
        messages.push(rec.message);
      }
    } catch {
      failedLines++;
    }
  }
  if (failedLines > 0 && jsonLines === 0) {
    return {
      messages,
      diagnostic: {
        tool: 'clippy', level: 'error',
        message: `clippy emitted ${failedLines} non-JSON line(s) and no parseable records (cargo message-format drift?)`,
      },
    };
  }
  return { messages };
}

async function runClippyStream(root: string, opts: RunOptions, diagnostics: ExternalToolDiagnostic[]):
    Promise<ClippyMessage[] | null> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn(
        'cargo',
        ['clippy', '--quiet', '--message-format=json', '--', '-D', 'warnings'],
        { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
    } catch (err) {
      diagnostics.push({
        tool: 'clippy', level: 'info',
        message: `cargo not on PATH; skipped (${(err as Error).message})`,
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
        ? 'cargo not on PATH; install Rust from https://rustup.rs/ to enable clippy coverage'
        : `cargo clippy spawn failed: ${err.message}`;
      diagnostics.push({ tool: 'clippy', level: 'info', message: msg });
      resolve(null);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killedForTimeout) {
        diagnostics.push({ tool: 'clippy', level: 'warn', message: 'clippy timeout; partial output ignored' });
        resolve(null);
        return;
      }
      // cargo clippy exit codes: 0 = clean, non-zero = lints found
      // (with -D warnings) OR a compilation error. We just parse stdout.
      if (stdout.trim().length === 0) {
        // If stderr mentions a manifest-not-found error, surface that.
        if (stderr.toLowerCase().includes('could not find `cargo.toml`')) {
          diagnostics.push({
            tool: 'clippy', level: 'info',
            message: 'no Cargo.toml in scan root; clippy skipped',
          });
        }
        resolve([]);
        return;
      }
      const { messages, diagnostic } = parseClippyOutput(stdout);
      if (diagnostic) { diagnostics.push(diagnostic); }
      resolve(messages);
    });
  });
}

function relativise(rootAbs: string, fileAbs: string): string {
  let rel = path.relative(rootAbs, fileAbs);
  rel = rel.replace(/\\/g, '/');
  return rel.length === 0 ? path.basename(fileAbs) : rel;
}

function ulidLike(): string { return crypto.randomBytes(8).toString('hex'); }

function shortCode(raw: string | undefined): string {
  if (!raw) return 'lint';
  // `clippy::needless_collect` -> `needless_collect`
  // `unused_imports` -> `unused_imports`
  return raw.startsWith('clippy::') ? raw.slice('clippy::'.length) : raw;
}

export async function runClippy(root: string, opts: RunOptions): Promise<ExternalToolResult> {
  const diagnostics: ExternalToolDiagnostic[] = [];
  const messages = await runClippyStream(root, opts, diagnostics);
  if (messages === null) return { issues: [], diagnostics };

  const rootAbs = path.resolve(root);
  const out: ReportIssue[] = [];
  for (const m of messages) {
    // Take the primary span if present, otherwise the first span.
    const primary = (m.spans ?? []).find(s => s.is_primary) ?? m.spans?.[0];
    if (!primary || !primary.file_name) continue;
    const file = relativise(rootAbs, primary.file_name);
    const code = shortCode(m.code?.code);
    const msg = (m.message ?? '').replace(/\s+/g, ' ').trim();
    out.push({
      id: `ext:clippy:${code}`,
      ruleVersion: '1.0.0',
      instanceId: ulidLike(),
      severity: classifySeverity(m.level),
      confidence: 0.8,
      category: 'best-practice',
      title: `clippy ${code}: ${msg.slice(0, 80)}`,
      whyItMatters: `${msg} (clippy ${code}). See https://rust-lang.github.io/rust-clippy/master/index.html#${code} for the rule's docs.`,
      citation: `https://rust-lang.github.io/rust-clippy/master/index.html#${code}`,
      evidence: {
        file,
        line: primary.line_start,
        column: primary.column_start,
        endLine: primary.line_end,
        endColumn: primary.column_end,
        snippet: msg.slice(0, 120),
        matchedPattern: code,
      },
      suppression: {
        available: true,
        directive: `// codemore-ignore-next-line: ext:clippy:${code}`,
        scope: 'next-line',
      },
    });
  }
  return { issues: out, diagnostics };
}
