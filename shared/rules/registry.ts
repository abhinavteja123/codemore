/**
 * Rule Registry
 *
 * Owns rule discovery, lifecycle gating, user-config filtering, and the
 * outer try/catch wrapper that prevents a single bad rule from crashing a scan.
 *
 * Packs are registered explicitly via `registerPack()`. We do not auto-scan
 * the filesystem — explicit registration keeps tree-shaking simple and lets
 * us bundle for the VS Code extension without dynamic imports.
 */

import { v4 as uuidV4 } from 'uuid';
import type { Rule, RuleContext, RuleFinding } from './Rule';
import type { ReportIssue, Severity } from '../report/types';
import {
  extractSuppressComments,
  isLocationSuppressed,
  type SuppressedRule,
} from './suppression';
import { isEnabledByDefault, maxConfidenceFor } from './lifecycle';

export interface RuleOverride {
  /** 'off' disables the rule. A Severity overrides defaultSeverity. */
  state: 'off' | Severity;
}

export interface RegistryOptions {
  /**
   * Enabled packs. If empty/undefined, all registered packs are enabled.
   */
  enabledPacks?: ReadonlyArray<string>;
  /**
   * Per-rule overrides from .codemorerc.json.
   * Key = rule id, value = override.
   */
  ruleOverrides?: Readonly<Record<string, RuleOverride>>;
  /**
   * If true, experimental rules run too. Otherwise they are skipped
   * unless explicitly enabled via ruleOverrides.
   */
  enableExperimental?: boolean;
}

export interface ScanDiagnostic {
  ruleId: string;
  message: string;
}

export interface ScanResult {
  issues: ReportIssue[];
  diagnostics: ScanDiagnostic[];
  rulesEvaluated: number;
}

export class RuleRegistry {
  private readonly rulesById = new Map<string, Rule>();
  private readonly rulesByPack = new Map<string, Rule[]>();

  /**
   * Register a pack of rules. Duplicate rule ids throw.
   */
  registerPack(packName: string, rules: ReadonlyArray<Rule>): void {
    const bucket = this.rulesByPack.get(packName) ?? [];

    for (const rule of rules) {
      if (rule.pack !== packName) {
        throw new Error(
          `Rule ${rule.id} declares pack '${rule.pack}' but was registered under '${packName}'.`,
        );
      }
      if (this.rulesById.has(rule.id)) {
        throw new Error(`Duplicate rule id: ${rule.id}`);
      }
      this.rulesById.set(rule.id, rule);
      bucket.push(rule);
    }

    this.rulesByPack.set(packName, bucket);
  }

  /**
   * Decide which rules apply to a given file + options.
   */
  selectRules(ctx: RuleContext, opts: RegistryOptions): Rule[] {
    const language = ctx.language;
    const enabledPacks = new Set(opts.enabledPacks ?? Array.from(this.rulesByPack.keys()));
    const overrides = opts.ruleOverrides ?? {};

    const out: Rule[] = [];
    for (const rule of this.rulesById.values()) {
      if (!enabledPacks.has(rule.pack)) continue;
      if (!rule.languages.includes(language)) continue;

      const override = overrides[rule.id];
      if (override?.state === 'off') continue;

      // A rule runs when any of these is true:
      //   - it's on by default for its lifecycle state
      //   - it's experimental and opts.enableExperimental is set
      //   - the user explicitly listed it (non-'off' override)
      const lifecycleAllows = isEnabledByDefault(rule.lifecycle);
      const experimentalAllowed =
        rule.lifecycle === 'experimental' && !!opts.enableExperimental;
      if (!lifecycleAllows && !experimentalAllowed && !override) continue;

      if (rule.targetFrameworks && rule.targetFrameworks.length > 0) {
        const hit = rule.targetFrameworks.some(f => ctx.frameworks.includes(f));
        if (!hit) continue;
      }

      out.push(rule);
    }
    return out;
  }

  /**
   * Run the selected rules over a single file. Catches rule exceptions
   * so a bad detector cannot tank the scan.
   */
  scanFile(ctx: RuleContext, opts: RegistryOptions): ScanResult {
    const suppressed: SuppressedRule[] = extractSuppressComments(ctx.content);
    const rules = this.selectRules(ctx, opts);
    const issues: ReportIssue[] = [];
    const diagnostics: ScanDiagnostic[] = [];

    for (const rule of rules) {
      let findings: RuleFinding[];
      try {
        findings = rule.detect(ctx);
      } catch (err) {
        diagnostics.push({
          ruleId: rule.id,
          message: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      for (const finding of findings) {
        if (isLocationSuppressed(rule.id, finding.evidence.line, suppressed)) continue;

        const override = opts.ruleOverrides?.[rule.id];
        // User override outranks BOTH the rule default and any per-finding
        // severity a detector sets — otherwise a .codemorerc.json remap is
        // silently ignored for every rule that emits finding.severity.
        const severity: Severity =
          (override && override.state !== 'off') ? (override.state as Severity)
          : (finding.severity ?? rule.defaultSeverity);

        const rawConfidence = finding.confidence ?? rule.defaultConfidence;
        const confidence = Math.min(rawConfidence, maxConfidenceFor(rule.lifecycle));

        issues.push({
          id: rule.id,
          ruleVersion: rule.version,
          instanceId: uuidV4(),
          lifecycle: rule.lifecycle,
          severity,
          confidence,
          category: rule.category,
          title: finding.title ?? rule.title,
          evidence: finding.evidence,
          whyItMatters: finding.whyItMatters ?? rule.whyItMatters,
          citation: rule.citation,
          suggestedFix: finding.suggestedFix,
          suppression: {
            available: true,
            directive: `// codemore-ignore: ${rule.id}`,
            scope: 'same-line',
          },
        });
      }
    }

    return { issues, diagnostics, rulesEvaluated: rules.length };
  }

  /** Total registered rules across all packs. */
  size(): number {
    return this.rulesById.size;
  }

  /** Names of registered packs. */
  packs(): string[] {
    return Array.from(this.rulesByPack.keys());
  }
}

/** Singleton registry used by daemon + CLI + MCP server. */
export const globalRegistry = new RuleRegistry();
