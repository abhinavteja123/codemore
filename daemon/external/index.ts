/**
 * External-tool dispatcher.
 *
 * Opt-in adapter family that runs industry-standard linters (Ruff,
 * golangci-lint, clippy, Biome) and normalises their output into our
 * `ReportIssue` shape. Allows users to scan polyglot repos without us
 * owning every parser, while keeping the agent loop (`apply_fix` /
 * `validate_fix`) intact.
 *
 * Behavioural rules (locked by the plan):
 *   - OFF by default. Engaged via `--external-tools <list>` on the CLI
 *     or `external_tools: [...]` in `.codemorerc.json`.
 *   - Silent skip on missing binary. If `ruff` isn't on PATH the adapter
 *     logs one notice to stderr and returns []. Never errors the scan.
 *   - Severity translation per tool. Each adapter has a static map from
 *     the tool's native severity / rule-prefix to our canonical
 *     {BLOCKER, CRITICAL, MAJOR, MINOR, INFO}.
 *   - Rule-id namespace. Each finding's `id` is `ext:<tool>:<original-rule-id>`.
 *     Native rule ids stay clean.
 *   - Confidence pinned at 0.8. We trust the tool but not blindly.
 *   - Suppression interop. `// codemore-ignore-next-line: ext:ruff:E501`
 *     works exactly like for native rules — the suppression filter
 *     applies to all ReportIssues regardless of origin.
 */

import type { ReportIssue } from '../../shared/report/types';
import { runRuff } from './ruff';

export type ExternalToolId = 'ruff' | 'golangci' | 'clippy' | 'biome';

export interface ExternalToolOptions {
  /** Subset of tools to run. Empty/undefined = run nothing (gate at the
   *  caller layer — this module never decides defaults). */
  tools: ReadonlyArray<ExternalToolId>;
  /** Project root (absolute). */
  root: string;
  /** Per-tool max runtime in ms. Default 60s. Tools that exceed this
   *  are killed and emit a single 'tool-timeout' diagnostic. */
  timeoutMs?: number;
}

export interface ExternalToolDiagnostic {
  tool: ExternalToolId;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface ExternalToolResult {
  issues: ReportIssue[];
  diagnostics: ExternalToolDiagnostic[];
}

/**
 * Run the requested external tools in parallel. Returns the merged
 * findings + per-tool diagnostics. Caller is responsible for merging
 * with the native pack's output.
 */
export async function runExternalTools(opts: ExternalToolOptions): Promise<ExternalToolResult> {
  if (opts.tools.length === 0) {
    return { issues: [], diagnostics: [] };
  }
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const tasks: Promise<ExternalToolResult>[] = [];
  for (const tool of opts.tools) {
    if (tool === 'ruff') {
      tasks.push(runRuff(opts.root, { timeoutMs }));
    } else {
      tasks.push(Promise.resolve({
        issues: [],
        diagnostics: [{
          tool, level: 'info',
          message: `${tool} adapter not yet implemented in Phase 7B day 1; coming next commit`,
        }],
      }));
    }
  }
  const results = await Promise.all(tasks);
  const merged: ExternalToolResult = { issues: [], diagnostics: [] };
  for (const r of results) {
    merged.issues.push(...r.issues);
    merged.diagnostics.push(...r.diagnostics);
  }
  return merged;
}
