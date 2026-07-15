/**
 * White-box regression tests for rule lifecycle gating
 * (shared/rules/registry.ts + shared/rules/lifecycle.ts).
 *
 * Background: the Part-4 incident — a default scan (no flags, no
 * .codemorerc.json) produced ZERO findings because every rule was gated
 * off by default. The fix is the lifecycle policy in
 * `shared/rules/lifecycle.ts`: `experimental` rules are opt-in only,
 * `beta`/`stable`/`deprecated` rules run by default. This suite locks that
 * contract at the registry's public entry point (`RuleRegistry.selectRules`)
 * so a regression ("default scan finds nothing again") fails a test instead
 * of shipping.
 *
 * Contract tested (input -> output), not private call sequences:
 *   - `RuleRegistry.registerPack()` / `selectRules()` in
 *     shared/rules/registry.ts.
 *   - The real, fully-registered `globalRegistry` (via
 *     `daemon/cli/registerPacks.ts`) — the exact surface a default
 *     `codemore scan` hits.
 */

import { strict as assert } from 'assert';
import { RuleRegistry } from '../shared/rules/registry';
import { globalRegistry } from '../shared/rules/registry';
import { maxConfidenceFor } from '../shared/rules/lifecycle';
import { registerAllPacks } from '../daemon/cli/registerPacks';
import type { Rule, RuleContext, RuleFinding } from '../shared/rules/Rule';
import type { Lifecycle } from '../shared/report/types';

function makeRule(id: string, lifecycle: Lifecycle): Rule {
  return {
    id,
    version: '1.0.0',
    pack: 'test-pack',
    lifecycle,
    languages: ['typescript'],
    category: 'best-practice',
    defaultSeverity: 'MINOR',
    defaultConfidence: 0.9,
    title: `synthetic ${lifecycle} rule`,
    whyItMatters: 'test fixture',
    citation: 'https://codemore.dev/rules/synthetic',
    detect(): RuleFinding[] {
      return [{
        evidence: { file: 'x.ts', line: 1, column: 1, snippet: '' },
      }];
    },
  };
}

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    filePath: 'index.ts',
    extension: '.ts',
    language: 'typescript',
    content: 'const x = 1;\n',
    lines: ['const x = 1;'],
    sourceFile: null,
    frameworks: [],
    ...overrides,
  };
}

describe('lifecycle gating (Part-4 "zero findings by default" regression)', () => {
  describe('isolated registry: synthetic rules across all four lifecycle states', () => {
    const registry = new RuleRegistry();
    registry.registerPack('test-pack', [
      makeRule('test-experimental-rule', 'experimental'),
      makeRule('test-beta-rule', 'beta'),
      makeRule('test-stable-rule', 'stable'),
      makeRule('test-deprecated-rule', 'deprecated'),
    ]);
    const ctx = makeCtx();

    it('excludes experimental rules from a default selection', () => {
      const selected = registry.selectRules(ctx, {});
      const ids = selected.map(r => r.id);
      assert.equal(ids.includes('test-experimental-rule'), false,
        'experimental rules must be opt-in only');
    });

    it('includes beta, stable, and deprecated rules by default', () => {
      const selected = registry.selectRules(ctx, {});
      const ids = selected.map(r => r.id);
      assert.equal(ids.includes('test-beta-rule'), true);
      assert.equal(ids.includes('test-stable-rule'), true);
      assert.equal(ids.includes('test-deprecated-rule'), true);
    });

    it('includes experimental rules when enableExperimental is set', () => {
      const selected = registry.selectRules(ctx, { enableExperimental: true });
      const ids = selected.map(r => r.id);
      assert.equal(ids.includes('test-experimental-rule'), true,
        '--enable-experimental (RegistryOptions.enableExperimental) must include experimental rules');
      // The other three states are unaffected by the flag.
      assert.equal(ids.includes('test-beta-rule'), true);
      assert.equal(ids.includes('test-stable-rule'), true);
      assert.equal(ids.includes('test-deprecated-rule'), true);
    });

    it('experimental rule stays off when enableExperimental is explicitly false', () => {
      const selected = registry.selectRules(ctx, { enableExperimental: false });
      assert.equal(selected.some(r => r.id === 'test-experimental-rule'), false);
    });
  });

  // Added from the 2026-07-15 mutation baseline (test/MUTATION-BASELINE.md).
  describe('confidence ceiling per lifecycle state', () => {
    it('maxConfidenceFor returns the exact ceiling for every state', () => {
      // A missing switch case returns undefined → Math.min(x, undefined) = NaN
      // confidence on every finding of that state. The 'beta' case was an
      // uncovered survivor in the mutation run.
      assert.equal(maxConfidenceFor('experimental'), 0.6);
      assert.equal(maxConfidenceFor('beta'), 0.85);
      assert.equal(maxConfidenceFor('stable'), 1.0);
      assert.equal(maxConfidenceFor('deprecated'), 0.75);
    });

    it('scanFile CLAMPS an experimental finding down to the 0.6 ceiling', () => {
      // Kills Math.min(raw, ceiling) → Math.max: the anti-noise clamp would
      // silently become a confidence BOOST for unproven detectors.
      const registry = new RuleRegistry();
      registry.registerPack('test-pack', [
        makeRule('test-clamp-experimental', 'experimental'), // defaultConfidence 0.9
        makeRule('test-clamp-stable', 'stable'),
      ]);
      const result = registry.scanFile(makeCtx(), { enableExperimental: true });
      const byId = new Map(result.issues.map(i => [i.id, i]));
      assert.equal(byId.get('test-clamp-experimental')?.confidence, 0.6,
        'experimental findings must be clamped to 0.6 no matter what the detector claims');
      assert.equal(byId.get('test-clamp-stable')?.confidence, 0.9,
        'stable findings keep their declared confidence (ceiling 1.0)');
    });
  });

  describe('targetFrameworks gating', () => {
    const registry = new RuleRegistry();
    registry.registerPack('test-pack', [
      { ...makeRule('test-fw-multi', 'stable'), targetFrameworks: ['react', 'vue'] },
      { ...makeRule('test-fw-empty', 'stable'), targetFrameworks: [] },
    ]);

    it('a rule targeting several frameworks runs when ANY one is present', () => {
      // Kills .some → .every: react-only projects would silently lose every
      // rule that also targets a second framework.
      const selected = registry.selectRules(makeCtx({ frameworks: ['react'] }), {});
      assert.equal(selected.some(r => r.id === 'test-fw-multi'), true);
    });

    it('an EMPTY targetFrameworks array means "not framework-scoped" — rule always runs', () => {
      // Kills length > 0 → length >= 0 (empty array would gate the rule off
      // forever, since [].some() is always false).
      const selected = registry.selectRules(makeCtx({ frameworks: [] }), {});
      assert.equal(selected.some(r => r.id === 'test-fw-empty'), true);
    });
  });

  describe('real registry: the exact Part-4 regression', () => {
    registerAllPacks();

    it('a default selection (no options) yields more than zero active rules for a typescript file', () => {
      const ctx = makeCtx();
      const selected = globalRegistry.selectRules(ctx, {});
      assert.ok(selected.length > 0,
        'default rule selection must not be empty — this is the exact Part-4 shipped bug ' +
        '(every rule gated off, silent zero-findings scans)');
    });

    it('a real experimental rule (core-quality-duplicate-string) is excluded by default', () => {
      const ctx = makeCtx();
      const selected = globalRegistry.selectRules(ctx, {});
      assert.equal(selected.some(r => r.id === 'core-quality-duplicate-string'), false,
        'core-quality-duplicate-string is lifecycle: experimental and must not run by default');
    });

    it('--enable-experimental includes core-quality-duplicate-string', () => {
      const ctx = makeCtx();
      const selected = globalRegistry.selectRules(ctx, { enableExperimental: true });
      assert.equal(selected.some(r => r.id === 'core-quality-duplicate-string'), true,
        'enableExperimental:true must include experimental-lifecycle rules');
    });
  });
});
