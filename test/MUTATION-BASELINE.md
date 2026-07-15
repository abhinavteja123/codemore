# Mutation Testing Baseline — 2026-07-15

First full StrykerJS mutation run over `shared/**` (config: `stryker.conf.json`,
runner: mocha via ts-node transpile-only, coverage analysis: perTest).
Wall time: 157 minutes.

This is a **manual pre-release gate, NOT in CI**. Re-run it before a release
when `shared/` infra code changed; do not wire it into CI (run time and
machine variance make it a poor gate there).

## Numbers (full run, before the kills below)

| Metric | Value |
|---|---|
| Total mutants | 12,032 |
| Killed | 577 |
| Timeout (counts as killed) | 1,412 |
| Survived | 3,541 |
| No coverage | 6,369 |
| Errors | 133 |
| **Score (all mutants)** | **16.72%** |
| **Score (covered code only)** | **35.97%** |

Machine-readable results: `reports/stryker-incremental.json` (per-mutant
status/location/mutatorName; gitignored — regenerate with a run).
HTML report: `reports/mutation/mutation.html`.

## Scope

- **Mutated:** `shared/**/*.ts` (excluding `*.d.ts`).
- **Test suite Stryker runs:** `test/*.test.ts` minus `test/parity.test.ts`
  and `test/surface-smoke.test.ts` (both spawn real scans — too slow per-mutant).
- **Excluded from mutation:** `daemon/`, `web/`, `vscode-extension/`, scripts.
  The daemon/web surfaces are integration-tested; mutating them under the
  unit suite would only add no-coverage noise.

## Why the headline score is structurally low (and why that's acceptable)

Rule-module detection logic (`shared/packs/**`) is validated by the **corpus
fixture harness** (`scripts/measure-accuracy.js`, 64/64 TP + 64/64 FP at the
time of this run), which is *not* part of the mocha suite Stryker executes.
So pack files dominate the no-coverage (6,369) and survived (3,541) counts
**by design** — their real gate is the corpus, which runs in CI on every push.
Interpreting the run honestly therefore means looking at the covered
**infrastructure** files only:

| Infra file | Survived |
|---|---|
| `shared/rules/astHelpers.ts` | 161 |
| `shared/rules/registry.ts` | 20 |
| `shared/rules/stripContent.ts` | 20 |
| `shared/rules/suppression.ts` | 16 |
| `shared/scoring.ts` | 17 |
| `shared/report/sarif.ts` | 13 |
| `shared/rules/lifecycle.ts` | 7 |

## The 10 triaged survivors (and the assertions that now kill them)

Chosen for real-bug potential: severity/threshold flips, inverted clamps,
deleted regex anchors, boundary swaps, wrong-field emission. String-literal
cosmetic mutants (log text, descriptions) were ignored.

| # | Mutant (file:line, mutator) | Why damning | Killed by |
|---|---|---|---|
| 1 | `shared/scoring.ts:50` AssignmentOperator (`score -=` → `+=`) | Deductions become additions; the 0–100 clamp then makes **every file with findings score 100** | `test/scoring.test.ts` — exact value: `calculateFileHealthScore({BLOCKER:1,CRITICAL:1,MAJOR:1,MINOR:1}) === 68` |
| 2 | `shared/scoring.ts:130` EqualityOperator (`filesAnalyzed === 0` → `!== 0`) | Legacy totals scorer returns **0 for every real scan** (and NaN for empty ones) | `test/scoring.test.ts` — `calculateHealthScoreFromTotals(zero, 10) === 100` and `(zero, 0) === 0` |
| 3 | `shared/scoring.ts:101` MethodExpression (`Math.max` → `Math.min`) | Clean files silently dropped from the per-file average — the entire "scales with codebase size" property dies | `test/scoring.test.ts` — 1 dirty + 9 clean files must average to exactly 98 |
| 4 | `shared/scoring.ts:135` ArithmeticOperator (`counts.CRITICAL / filesAnalyzed` → `*`) — representative of the 134–138 group | Normalization inverted: **more files = worse score** instead of dilution | `test/scoring.test.ts` — exact values 90 (MAJOR:4/2 files) and 73 (CRITICAL:4/4 files) |
| 5 | `shared/rules/registry.ts:150` MethodExpression (`Math.min` → `Math.max`) | The lifecycle confidence **clamp becomes a boost** — the anti-noise guard for unproven experimental rules is dead | `test/lifecycle-gating.test.ts` — experimental finding with detector confidence 0.9 must emerge as exactly 0.6 |
| 6 | `shared/rules/registry.ts:107` MethodExpression (`.some` → `.every`) | Framework gating requires ALL target frameworks; a react-only project silently loses every rule that also targets vue/next | `test/lifecycle-gating.test.ts` — rule targeting `['react','vue']` must run with only `['react']` detected |
| 7 | `shared/rules/lifecycle.ts:39` ConditionalExpression (`case 'beta'` made unreachable) | `maxConfidenceFor('beta')` → `undefined` → `Math.min(x, undefined)` = **NaN confidence on every beta finding** | `test/lifecycle-gating.test.ts` — `maxConfidenceFor` asserted exactly for all four states |
| 8 | `shared/rules/suppression.ts:51` Regex (`\s*` → `\s` in `FILE_LEVEL_BLOCK_RE`, 3 positions + `\s*`→`\S*`) | `/*codemore-ignore-file:rule*/` written without spaces **silently stops suppressing** (or captures a garbage rule id) | `test/suppression.test.ts` — zero-whitespace block + HTML forms must parse to exactly `[{ruleId:'no-eval', line:-1}]` |
| 9 | `shared/report/sarif.ts:72` EqualityOperator (`endColumn !== undefined` → `===`) | SARIF region `endColumn` emitted **exactly when the issue has none** — GitHub code-scanning annotations degrade | `test/sarif-output.test.ts` — `endColumn === 12` when present, property absent when not |
| 10 | `shared/rules/astHelpers.ts:151` Regex (`PURE_SVG_RE` anchors/quantifier deleted, 4 variants) | `'<svg></svg><script>alert(1)</script>'` classifies as `static-svg` — an **XSS payload gets the benign-SVG severity downgrade** | `test/ast-helpers.test.ts` — pure SVG = `static-svg`; script-tail and markup-prefix = `literal-string` |

Bonus kills landed by the same edits (traced, not part of the official 10):

- `shared/scoring.ts:74` (`(CRITICAL−1)*2` → `/2`): cap decay slope — exact `severityCap({CRITICAL:6}) === 69`.
- `shared/scoring.ts:148–149` (debt arithmetic flips): `calculateTechnicalDebt(1 of each) === 225`.
- `shared/rules/registry.ts:106` (`length > 0` → `>= 0`): empty `targetFrameworks: []` must not gate a rule off forever.
- `shared/rules/lifecycle.ts:38` (`case 'experimental'` string mutant): killed by the exact `maxConfidenceFor` table.
- `shared/report/sarif.ts:71` + `72` ConditionalExpression variants: killed by the presence/absence asserts.
- `shared/rules/astHelpers.ts:638` (`complexity > threshold` → `>=`): boundary is exclusive — at-threshold function must NOT be flagged (`test/ast-helpers.test.ts`).

All regex kills were verified by evaluating the mutated patterns directly
against the new test inputs (every mutant either fails to match or captures
`"l"` instead of `"no-eval"` / misclassifies the SVG fixtures).

## How to re-run

```bash
npm run test:mutation        # full run — ~2.5h, uses reports/stryker-incremental.json
# Scoped (fast, incremental) — prove kills on specific files:
npx stryker run --mutate "shared/scoring.ts,shared/rules/suppression.ts"
```

- Incremental state: `reports/stryker-incremental.json` (delete it to force a
  cold run; it is gitignored).
- HTML report: `reports/mutation/mutation.html`.
- The mocha suite must be green (`npm run test:unit`) before a mutation run,
  or every mutant "kills" trivially.
