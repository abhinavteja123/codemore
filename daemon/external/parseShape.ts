/**
 * Shared JSON-shape guard for external-tool adapters.
 *
 * Every adapter parses a tool's `--json` stdout. Two failure modes have to
 * be *loud*, never a silent zero-findings result (the "stale-biome" bug
 * class — an old tool binary that doesn't support the JSON flag, or a new
 * major version that renamed the top-level key):
 *
 *   1. stdout isn't JSON at all            -> JSON.parse throws
 *   2. stdout is JSON of an unexpected shape (version drift) -> the
 *      expected top-level container is missing
 *
 * Both return `value: null` plus an `error`-level diagnostic so the caller
 * reports the tool as failed rather than "ran ok — 0 findings".
 *
 * Callers handle the genuinely-empty case (empty stdout = the tool ran and
 * found nothing) *before* calling this, because the "empty" sentinel value
 * differs per tool (`{ results: [] }` vs `[]` vs `{ vulnerabilities: {} }`).
 */

import type { ExternalToolId, ExternalToolDiagnostic } from './index';

/** True for a non-null, non-array plain object. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface ParseResult<T> {
  value: T | null;
  diagnostic?: ExternalToolDiagnostic;
}

/**
 * Parse non-empty tool stdout as JSON and assert its shape.
 *
 * @param stdout      raw, non-empty tool output
 * @param tool        adapter id, for the diagnostic
 * @param isValidShape returns true when `parsed` has the structure this
 *                     adapter's mapper expects
 * @param shapeHint   short description of what was expected, e.g.
 *                     `is missing the "results" array` — appended to the
 *                     drift diagnostic
 */
export function parseToolJson<T>(
  stdout: string,
  tool: ExternalToolId,
  isValidShape: (parsed: unknown) => boolean,
  shapeHint: string,
): ParseResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return {
      value: null,
      diagnostic: {
        tool,
        level: 'error',
        message: `failed to parse ${tool} JSON: ${(err as Error).message}`,
      },
    };
  }
  if (!isValidShape(parsed)) {
    return {
      value: null,
      diagnostic: {
        tool,
        level: 'error',
        message: `${tool} output ${shapeHint} — unexpected format (tool version drift?)`,
      },
    };
  }
  return { value: parsed as T };
}
