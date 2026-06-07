/**
 * CodeMore Report Schema — v1.0.0
 *
 * The structured-feedback contract that AI coding agents read.
 * Source of truth: shared/report/schema.json (JSON Schema Draft-07).
 *
 * Breaking changes bump SCHEMA_VERSION major. Additive changes bump minor.
 *
 * Keep this file aligned with schema.json. A future build step will
 * generate this from the JSON Schema; until then it is hand-maintained.
 */

export const SCHEMA_VERSION = '1.0.0';

export type Severity = 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';

export type IssueCategory =
  | 'bug'
  | 'code-smell'
  | 'performance'
  | 'security'
  | 'maintainability'
  | 'accessibility'
  | 'best-practice';

export type Lifecycle = 'experimental' | 'beta' | 'stable' | 'deprecated';

export interface ReportTool {
  name: 'codemore';
  version: string;
}

export interface ReportProject {
  root: string;
  framework?: string | null;
  language?: string | null;
  /** SHA-256 of project structure, prefixed with 'sha256:'. */
  fingerprint?: string | null;
}

export interface SeverityCounts {
  BLOCKER: number;
  CRITICAL: number;
  MAJOR: number;
  MINOR: number;
  INFO: number;
}

export interface ReportSummary {
  score: number;
  issuesTotal: number;
  bySeverity: SeverityCounts;
  byCategory: Record<string, number>;
  filesAnalyzed: number;
  linesOfCode: number;
  technicalDebtMinutes: number;
}

export interface IssueEvidence {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  snippet: string;
  matchedPattern?: string;
}

export type FixType = 'code-patch' | 'config-change' | 'manual';

export interface SuggestedFix {
  type: FixType;
  instructions: string;
  patchTemplate?: string;
  verificationCriteria?: string[];
}

export type SuppressionScope = 'same-line' | 'next-line' | 'file';

export interface Suppression {
  available?: boolean;
  directive?: string;
  scope?: SuppressionScope;
}

export interface ReportIssue {
  /** Stable rule id, kebab-case, namespaced by pack. */
  id: string;
  /** Semver of the rule that produced this finding. */
  ruleVersion: string;
  /** Per-instance unique id (ULID/UUID). */
  instanceId: string;
  lifecycle?: Lifecycle;
  severity: Severity;
  /** Detector confidence in [0, 1]. <0.6 = experimental-grade signal. */
  confidence: number;
  category: IssueCategory;
  title: string;
  evidence: IssueEvidence;
  /** One-paragraph explanation an LLM uses as fix context. */
  whyItMatters: string;
  /** Docs URL for this rule. */
  citation: string;
  suggestedFix?: SuggestedFix;
  suppression?: Suppression;
}

export type StopCondition = 'first-validator-failure' | 'first-rule-failure' | 'never';

export interface AgentInstructions {
  preamble?: string;
  orderingHint?: string;
  doNotTouch?: string[];
  stopOn?: StopCondition;
}

export interface ReportMeta {
  rulesEnabled?: number;
  packsLoaded?: string[];
  scanDurationMs?: number;
}

export interface CodeMoreReport {
  schemaVersion: string;
  scannedAt: string;
  tool: ReportTool;
  project: ReportProject;
  summary: ReportSummary;
  issues: ReportIssue[];
  agentInstructions?: AgentInstructions;
  meta?: ReportMeta;
}
