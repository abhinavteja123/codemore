/**
 * Biome adapter.
 *
 * Wraps `biome check --reporter=json <root>`. Biome's JSON shape:
 *   {
 *     "diagnostics": [
 *       {
 *         "category": "lint/correctness/noUnusedVariables",
 *         "severity": "error" | "warning" | "information",
 *         "description": "...",
 *         "location": {
 *           "path": { "file": "/abs/path/x.ts" },
 *           "span": [start, end]
 *         }
 *       }
 *     ]
 *   }
 *
 * We translate each to `ext:biome:<category>` (e.g.
 * `ext:biome:lint/correctness/noUnusedVariables`).
 *
 * Severity:
 *   correctness/* -> MAJOR
 *   security/*    -> BLOCKER
 *   suspicious/*  -> MAJOR
 *   complexity/*  -> MINOR
 *   style/*       -> MINOR
 *   default native severity:
 *     error       -> MAJOR
 *     warning     -> MINOR
 *     information -> INFO
 *
 * Span -> line conversion: biome reports byte-offset spans, not (line,
 * column). We have to read the file to translate. The result is correct
 * but adds I/O per finding; cached per file for amortised efficiency.
 *
 * Behaviour contract matches ruff.ts.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type { ReportIssue, Severity } from '../../shared/report/types';
import type { ExternalToolResult, ExternalToolDiagnostic } from './index';

interface BiomeDiagnostic {
  category?: string;
  severity?: 'error' | 'warning' | 'information' | 'fatal';
  description?: string;
  message?: { content?: string } | string;
  location?: {
    path?: { file?: string };
    span?: [number, number];
  };
}

interface BiomeOutput {
  diagnostics?: BiomeDiagnostic[];
}

function classifySeverity(category: string | undefined, native: BiomeDiagnostic['severity']): Severity {
  if (category) {
    if (category.startsWith('lint/security/')) return 'BLOCKER';
    if (category.startsWith('lint/correctness/')) return 'MAJOR';
    if (category.startsWith('lint/suspicious/')) return 'MAJOR';
    if (category.startsWith('lint/complexity/')) return 'MINOR';
    if (category.startsWith('lint/style/')) return 'MINOR';
  }
  switch (native) {
    case 'fatal':       return 'BLOCKER';
    case 'error':       return 'MAJOR';
    case 'warning':     return 'MINOR';
    case 'information': return 'INFO';
    default:            return 'MAJOR';
  }
}

interface RunOptions { timeoutMs: number }

async function runBiomeJson(root: string, opts: RunOptions, diagnostics: ExternalToolDiagnostic[]):
    Promise<BiomeDiagnostic[] | null> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn('biome', ['check', '--reporter=json', root], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      diagnostics.push({
        tool: 'biome', level: 'info',
        message: `biome not on PATH; skipped (${(err as Error).message})`,
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
        ? 'biome not on PATH; install with `npm i -g @biomejs/biome` to enable the adapter'
        : `biome spawn failed: ${err.message}`;
      diagnostics.push({ tool: 'biome', level: 'info', message: msg });
      resolve(null);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killedForTimeout) {
        diagnostics.push({ tool: 'biome', level: 'warn', message: 'biome timeout; partial output ignored' });
        resolve(null);
        return;
      }
      // biome exit codes: 0 = no findings, 1 = findings, 2 = config/IO error.
      if (code !== null && code > 1) {
        diagnostics.push({
          tool: 'biome', level: 'error',
          message: `biome exited with code ${code}: ${stderr.split('\n')[0] || '(no stderr)'}`,
        });
        resolve(null);
        return;
      }
      if (stdout.trim().length === 0) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as BiomeOutput;
        resolve(parsed.diagnostics ?? []);
      } catch (err) {
        diagnostics.push({
          tool: 'biome', level: 'error',
          message: `failed to parse biome output: ${(err as Error).message}`,
        });
        resolve(null);
      }
    });
  });
}

function relativise(rootAbs: string, fileAbs: string): string {
  let rel = path.relative(rootAbs, fileAbs);
  rel = rel.replace(/\\/g, '/');
  return rel.length === 0 ? path.basename(fileAbs) : rel;
}

function ulidLike(): string { return crypto.randomBytes(8).toString('hex'); }

/** Cache `fileAbs -> string` reads to amortise the per-finding offset
 *  translation. Cleared at the end of the run. */
const contentCache = new Map<string, string>();

function offsetToLineCol(fileAbs: string, offset: number): { line: number; column: number } | null {
  let content = contentCache.get(fileAbs);
  if (content === undefined) {
    try { content = fs.readFileSync(fileAbs, 'utf8'); }
    catch { return null; }
    contentCache.set(fileAbs, content);
  }
  let line = 1; let col = 1;
  const cap = Math.min(offset, content.length);
  for (let i = 0; i < cap; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) { line++; col = 1; }
    else col++;
  }
  return { line, column: col };
}

function getDescription(d: BiomeDiagnostic): string {
  if (typeof d.description === 'string' && d.description.trim().length > 0) {
    return d.description.replace(/\s+/g, ' ').trim();
  }
  if (typeof d.message === 'string') return d.message;
  if (d.message && typeof d.message === 'object' && typeof d.message.content === 'string') {
    return d.message.content.replace(/\s+/g, ' ').trim();
  }
  return '';
}

export async function runBiome(root: string, opts: RunOptions): Promise<ExternalToolResult> {
  contentCache.clear();
  const diagnostics: ExternalToolDiagnostic[] = [];
  const findings = await runBiomeJson(root, opts, diagnostics);
  if (findings === null) return { issues: [], diagnostics };

  const rootAbs = path.resolve(root);
  const out: ReportIssue[] = [];
  for (const f of findings) {
    const filePath = f.location?.path?.file;
    if (!filePath) continue;
    const offset = f.location?.span?.[0];
    const startLineCol = typeof offset === 'number' ? offsetToLineCol(filePath, offset) : null;
    if (!startLineCol) continue;
    const category = f.category ?? 'lint/unknown';
    const severity = classifySeverity(category, f.severity);
    const msg = getDescription(f);
    const file = relativise(rootAbs, filePath);
    out.push({
      id: `ext:biome:${category}`,
      ruleVersion: '1.0.0',
      instanceId: ulidLike(),
      severity,
      confidence: 0.8,
      category: 'best-practice',
      title: `biome ${category}: ${msg.slice(0, 80)}`,
      whyItMatters:
        `${msg} (biome ${category}). See https://biomejs.dev/linter/rules/${category.split('/').pop()}/ for details.`,
      citation: `https://biomejs.dev/linter/rules/${category.split('/').pop()}/`,
      evidence: {
        file,
        line: startLineCol.line,
        column: startLineCol.column,
        snippet: msg.slice(0, 120),
        matchedPattern: category,
      },
      suppression: {
        available: true,
        directive: `// codemore-ignore-next-line: ext:biome:${category}`,
        scope: 'next-line',
      },
    });
  }
  contentCache.clear();
  return { issues: out, diagnostics };
}
