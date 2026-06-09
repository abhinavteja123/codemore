/**
 * CodeMore Rule Contract
 *
 * Every detector ships as a Rule. Rules are pure functions over a RuleContext.
 * No instance state, no shared mutation — safe to run in parallel.
 *
 * Contributors: see CONTRIBUTING-RULES.md for the required PR artifacts.
 */

import type * as ts from 'typescript';
import type {
  IssueCategory,
  IssueEvidence,
  Lifecycle,
  Severity,
  SuggestedFix,
} from '../report/types';

/**
 * Cross-file snapshot built once per scan and reused by every rule.
 *
 * The shape is the minimum that Phase 2B rules need; future fields are
 * additive. The CLI builds this in `daemon/cli/projectIndex.ts` and the
 * MCP server inherits it from the same scan pipeline.
 *
 * Rules MUST treat this as read-only.
 */
export interface ProjectIndex {
  /** Project root used to build this index (absolute path). */
  readonly root: string;
  /** Every module specifier imported anywhere in the project. */
  readonly allImports: ReadonlySet<string>;
  /**
   * Every imported BINDING NAME (default / namespace / named-import name,
   * including both alias and original) seen across the project.
   */
  readonly allImportedNames: ReadonlySet<string>;
  /** Files identified as API route handlers (Next.js or Express). */
  readonly routeFiles: ReadonlyArray<{
    readonly absPath: string;
    readonly relPath: string;
    readonly style: 'next-app-router' | 'next-pages-api' | 'express' | 'unknown';
    readonly methods: ReadonlyArray<string>;
  }>;
  /** True when at least one rate-limit library is imported anywhere. */
  readonly hasRateLimitLib: boolean;
  /** True when at least one schema validator (zod/yup/etc.) is imported anywhere. */
  readonly hasValidatorLib: boolean;
  /** True when at least one auth-helper name is referenced anywhere. */
  readonly hasAuthHelper: boolean;
  /** True when @supabase/* is imported anywhere. */
  readonly hasSupabase: boolean;
}

/**
 * What a rule sees when it runs.
 *
 * Rules MUST NOT mutate any field of this context. The same context is
 * passed to many rules in sequence; mutations cause cross-rule pollution.
 */
export interface RuleContext {
  /** Workspace-relative path. */
  readonly filePath: string;
  /** Lowercase extension including the dot (e.g. '.ts', '.sql'). Empty for extensionless files. */
  readonly extension: string;
  /**
   * Normalised language label used by the registry for rule routing.
   * Examples: 'typescript', 'javascript', 'sql', 'env', 'python', 'json',
   * 'yaml', 'markdown', 'shell', 'dockerfile'. A single language can be
   * produced by multiple file shapes (e.g. .env / .env.local / .env.production
   * all map to 'env'). Rules declare which languages they apply to.
   */
  readonly language: string;
  /** File content, as read. */
  readonly content: string;
  /** Content split by '\n'. Provided to save every rule splitting again. */
  readonly lines: ReadonlyArray<string>;
  /**
   * Parsed TS source file, when available.
   * Null for non-TS/JS files; rules that need it should early-return.
   */
  readonly sourceFile: ts.SourceFile | null;
  /** Detected framework signals (e.g. 'next.js', 'supabase'). */
  readonly frameworks: ReadonlyArray<string>;
  /** Optional sibling-file lookup for cross-file analysis. */
  readonly resolveFile?: (relativePath: string) => string | null;
  /**
   * Parsed Python source (tree-sitter-python tree) when language ===
   * 'python'. Null on every other language, and also null when the
   * tree-sitter WASM grammar couldn't be loaded (corrupt install /
   * sandboxed env). Rules MUST early-return on null.
   *
   * Typed as `unknown` here to keep `Rule.ts` independent of the
   * tree-sitter type surface; rule modules cast to `PythonTree` from
   * `shared/rules/pythonAst`.
   */
  readonly pythonAst?: unknown;
  /**
   * Optional cross-file snapshot (import graph, route inventory, presence
   * of auth/rate-limit/validator libs). Built once per scan by the CLI;
   * absent in single-file callers (legacy daemon analyzer fallback,
   * IDE quick-fix preview, etc.). Rules that NEED this should early-return
   * when undefined rather than guess.
   */
  readonly projectIndex?: ProjectIndex;
}

/**
 * What a rule returns. Lighter than ReportIssue — the registry
 * enriches with ruleVersion, instanceId, citation, etc.
 */
export interface RuleFinding {
  /** Severity may override the rule's default for this specific finding. */
  severity?: Severity;
  /** Confidence in [0, 1]. Default = rule.defaultConfidence. */
  confidence?: number;
  /** Optional override of the rule's title for this finding. */
  title?: string;
  evidence: IssueEvidence;
  whyItMatters?: string;
  suggestedFix?: SuggestedFix;
}

/**
 * The Rule contract. Every detector in shared/packs/** implements this.
 */
export interface Rule {
  /** Stable kebab-case id, namespaced by pack. */
  readonly id: string;
  /** Semver. Bumps lift contributions through lifecycle states. */
  readonly version: string;
  /** Pack this rule belongs to (e.g. 'vibe-supabase'). */
  readonly pack: string;
  /** Lifecycle state — controls default-on behavior + telemetry gating. */
  readonly lifecycle: Lifecycle;
  /** Languages this rule applies to (lowercase, no leading dot). */
  readonly languages: ReadonlyArray<string>;
  /** Optional target framework(s) this rule is scoped to. */
  readonly targetFrameworks?: ReadonlyArray<string>;
  /** Report category. */
  readonly category: IssueCategory;
  /** Default severity if a finding does not override. */
  readonly defaultSeverity: Severity;
  /** Default confidence if a finding does not override. */
  readonly defaultConfidence: number;
  /** Short human-readable title (used when finding does not override). */
  readonly title: string;
  /** One-paragraph rationale shown to agents (used when finding does not override). */
  readonly whyItMatters: string;
  /** URL to the rule's docs page. */
  readonly citation: string;

  /**
   * Pure detector. Must be side-effect-free. Throwing is caught by the
   * registry and surfaced as a diagnostic — never crashes the scan.
   */
  detect(ctx: RuleContext): RuleFinding[];
}

/**
 * Helper for type-narrowing arrays of rules.
 */
export function isRule(value: unknown): value is Rule {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Partial<Rule>;
  return (
    typeof r.id === 'string' &&
    typeof r.version === 'string' &&
    typeof r.pack === 'string' &&
    typeof r.lifecycle === 'string' &&
    Array.isArray(r.languages) &&
    typeof r.detect === 'function'
  );
}
