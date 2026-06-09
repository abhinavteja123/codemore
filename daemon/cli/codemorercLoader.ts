/**
 * `.codemorerc.json` loader — per-project user overrides.
 *
 * The new registry doesn't read this file directly; this module loads it
 * at scan start and turns it into the four knobs scanProject already
 * accepts: enabledPacks, ruleOverrides, ignore patterns, enableExperimental.
 *
 * Supported shape (every field optional):
 *
 *   {
 *     "packs": ["vibe-supabase", "core-security"],
 *     "rules": {
 *       "core-quality-async-without-await": "off",
 *       "vibe-supabase-rls-permissive": "MAJOR"
 *     },
 *     "ignore": ["packages/legacy/**", "**\/__generated__/**"],
 *     "experimental": true
 *   }
 *
 * The legacy `.codemorerc.json` schema (maxLineLength, maxFunctionLength,
 * overrides array, etc.) is read by `daemon/services/configLoader.ts` —
 * that monolith path is preserved for the legacy extension. The fields
 * we read here are additive; the file can carry both legacy + new fields
 * side by side during the migration.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RuleOverride } from '../../shared/rules/registry';
import type { Severity } from '../../shared/report/types';

const VALID_SEVERITIES: ReadonlyArray<Severity> = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];

export interface CodemorerCFile {
  packs?: ReadonlyArray<string>;
  rules?: Record<string, 'off' | Severity>;
  ignore?: ReadonlyArray<string>;
  experimental?: boolean;
}

export interface CodemorerCLoaded {
  /** Empty array if no packs specified — registry defaults to all. */
  packs: string[];
  ruleOverrides: Record<string, RuleOverride>;
  ignore: string[];
  experimental: boolean | undefined;
  /** Source file the values were loaded from, or null if no file found. */
  sourcePath: string | null;
  /** Validation errors (non-fatal — bad fields are dropped). */
  warnings: string[];
}

function tryParseJson(raw: string): unknown {
  // Tolerant: strip block comments + line comments + trailing commas.
  // Reason for codemore-ignore-next-line below: fast-path attempt; the slow
  // JSONC strip runs unconditionally below if JSON.parse fails. Meaningful
  // fallback exists, not a silent swallow.
  // codemore-ignore-next-line: core-quality-empty-catch
  try { return JSON.parse(raw); } catch { /* try jsonc */ }
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(stripped); } catch { return null; }
}

function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (VALID_SEVERITIES as ReadonlyArray<string>).includes(v);
}

function asStringArray(v: unknown, warnings: string[], field: string): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) { warnings.push(`${field} must be an array of strings`); return []; }
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') { warnings.push(`${field}: ignored non-string entry`); continue; }
    out.push(item);
  }
  return out;
}

/**
 * Load .codemorerc.json from the scan root. Returns an empty-but-valid
 * result when the file is missing — callers shouldn't need to null-check.
 */
export function loadCodemorerc(root: string): CodemorerCLoaded {
  const rootAbs = path.resolve(root);
  const filePath = path.join(rootAbs, '.codemorerc.json');

  const empty: CodemorerCLoaded = {
    packs: [],
    ruleOverrides: {},
    ignore: [],
    experimental: undefined,
    sourcePath: null,
    warnings: [],
  };

  let raw: string;
  try { raw = fs.readFileSync(filePath, 'utf8'); } catch { return empty; }

  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    return { ...empty, sourcePath: filePath, warnings: ['.codemorerc.json is not valid JSON; ignored'] };
  }

  const cfg = parsed as Partial<CodemorerCFile>;
  const warnings: string[] = [];

  const packs = asStringArray(cfg.packs, warnings, 'packs');

  const ruleOverrides: Record<string, RuleOverride> = {};
  if (cfg.rules !== undefined) {
    if (typeof cfg.rules !== 'object' || cfg.rules === null) {
      warnings.push('rules must be an object { <rule-id>: "off" | Severity }');
    } else {
      for (const [k, v] of Object.entries(cfg.rules)) {
        if (v === 'off') {
          ruleOverrides[k] = { state: 'off' };
        } else if (isSeverity(v)) {
          ruleOverrides[k] = { state: v };
        } else {
          warnings.push(`rules.${k}: must be "off" or a Severity (BLOCKER/CRITICAL/MAJOR/MINOR/INFO); got ${JSON.stringify(v)}`);
        }
      }
    }
  }

  const ignore = asStringArray(cfg.ignore, warnings, 'ignore');

  const experimental = typeof cfg.experimental === 'boolean' ? cfg.experimental : undefined;

  return {
    packs,
    ruleOverrides,
    ignore,
    experimental,
    sourcePath: filePath,
    warnings,
  };
}
