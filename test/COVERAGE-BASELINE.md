# Coverage Baseline — repo-wide (`all: true`)

**Date:** 2026-07-07 (PLAN A5) · supersedes the 2026-07-02 `all:false` snapshot
**Command:** `npm run test:coverage` (`c8 --reporter=text --reporter=text-summary npm run test:unit`)
**Test run:** 141/141 passing (`npm run test:unit`)
**Config:** `.c8rc.json` — includes `shared/**`, `daemon/**`, `web/src/lib/**`; excludes `test/**`, `corpus/**`, `out/**`, `dist/**`, `node_modules/**`, `web/.next/**`, `**/*.test.ts`, `**/*.d.ts`, `daemon/dist/**`. **`"all": true`** as of A5 — every included source file counts, even those no test imports (they land as 0%), so these are honest *repo-wide* numbers, not coverage-of-exercised-files.

Do not use this file to gate CI — no coverage thresholds are configured yet. The drop vs the old 54.92% is expected and correct: the `all:false → all:true` flip pulls never-imported files into the denominator.

## Overall (`all: true`, 2026-07-07)

| Metric | Covered / Total | % |
|---|---|---|
| Statements | 14425 / 30982 | 46.55% |
| Branches | 1311 / 2077 | 63.11% |
| Functions | 356 / 719 | 49.51% |
| Lines | 14425 / 30982 | 46.55% |

### `daemon/external/` after A1 (2026-07-07)

| Metric | % | Notes |
|---|---|---|
| Statements | 43.2% | Parser logic now tested; `parseShape.ts` = **100%** across the board. The remaining gap is the `runX` spawn orchestration (real-binary paths, not unit-tested). |
| Branches | 92.3% | Up from the old 0/0 — the new `parseXOutput` guards give the adapters real, well-covered branch points. |
| Functions | 18.86% | The exported `parseXOutput` fns are covered; the `runX`/`runXJson` spawn entrypoints still aren't (they invoke external processes — A3 territory). |

---

## 2026-07-02 snapshot (`all: false`, 43 tests) — kept for reference, now stale

> The tables below were captured with `"all": false` and only 43 tests, before the white-box suites and A1 landed. They measure coverage-of-exercised-files, not repo-wide, so the percentages read higher than the honest numbers above. Retained only to show the earlier per-directory shape.

## Overall (old `all: false`)

| Metric | Covered / Total | % |
|---|---|---|
| Statements | 13726 / 24989 | 54.92% |
| Branches | 1087 / 1814 | 59.92% |
| Functions | 322 / 677 | 47.56% |
| Lines | 13726 / 24989 | 54.92% |

## Per-directory (from c8 text report)

### `shared/rules/`

| Metric | % | Uncovered-heavy files |
|---|---|---|
| Statements | 62.94% | `pythonHelpers.ts` (30.70%), `pythonAst.ts` (58.71%) |
| Branches | 66.24% | `pythonAst.ts` (0%), `suppression.ts` (50%) |
| Functions | 55.88% | `pythonAst.ts` (0%), `pythonHelpers.ts` (0%) |
| Lines | 62.94% | — |

### `shared/packs/` (aggregate across all sub-packs: core-quality, core-security, vibe-auth, vibe-frontend, vibe-secrets, vibe-supabase — combined covered/total, not an average of percentages)

| Metric | Covered / Total | % |
|---|---|---|
| Statements | 5977 / 9278 | 64.42% |
| Branches | 402 / 652 | 61.66% |
| Functions | 131 / 235 | 55.74% |
| Lines | 5977 / 9278 | 64.42% |

Sub-pack breakdown (lines %): core-quality 65.21%, core-security 56.46%, vibe-auth 62.77%, vibe-frontend 71.41%, vibe-secrets 90.29%, vibe-supabase 81.79%.

### `daemon/cli/`

| Metric | % | Uncovered-heavy files |
|---|---|---|
| Statements | 85.47% | `codemorercLoader.ts` (60.99%) |
| Branches | 53.05% | `codemorercLoader.ts` (25%), `projectScanner.ts` (50%) |
| Functions | 80.00% | `codemorercLoader.ts` (25%) |
| Lines | 85.47% | — |

### `daemon/external/`

| Metric | % | Notes |
|---|---|---|
| Statements | 33.07% | Every adapter file (bandit, biome, clippy, gitleaks, golangci, npm-audit, pip-audit, ruff) is between 25–37% statements, 0% functions |
| Branches | 100.00% | No branch points instrumented in these files (0/0) |
| Functions | 0.00% | No adapter entrypoint functions exercised by unit tests — these run via external process invocation, likely only covered by integration/E2E paths not in `test:unit` |
| Lines | 33.07% | — |

### `daemon/services/`

| Metric | % | Uncovered-heavy files |
|---|---|---|
| Statements | 41.26% | `externalToolRunner.ts` (29.51%), `aiService.ts` (18.88%) |
| Branches | 59.37% | `externalToolRunner.ts` (0%), `validatorHarness.ts` (26.47%) |
| Functions | 36.99% | `externalToolRunner.ts` (0%), `aiService.ts` (13.51%) |
| Lines | 41.26% | — |

### `web/src/lib/`

| Metric | % | Uncovered-heavy files |
|---|---|---|
| Statements | 48.74% | `fixSuggestions.ts` (14.07%), `database.ts` (19.71%), `supabase.ts` (43%) |
| Branches | 54.28% | `supabase.ts` (0%), `analyzer.ts` (34.69%) |
| Functions | 45.54% | `fixSuggestions.ts` (0%), `database.ts` (0%), `supabase.ts` (0%) |
| Lines | 48.74% | — |

## Directories worth flagging for Phase 3+ (surprisingly low coverage)

- **`daemon/external/`** — 33.07% statements, 0% functions across every external-tool adapter (bandit, biome, clippy, gitleaks, golangci, npm-audit, pip-audit, ruff). These wrap subprocess invocations of third-party linters/scanners; none of their entrypoint functions run under `test:unit`. Highest-value target for new white-box tests since it's an entire directory with 0% function coverage.
- **`daemon/services/externalToolRunner.ts`** — 29.51% statements, 0% branches, 0% functions. Orchestrates the external tool adapters above; same gap.
- **`daemon/services/aiService.ts`** — 18.88% statements, 13.51% functions. Only the JSON-parsing helpers are exercised (via `test/ai-fix-parser.test.ts`); the actual LLM-calling paths are untested.
- **`web/src/lib/fixSuggestions.ts`** (14.07%) and **`web/src/lib/database.ts`** (19.71%) — both 0% functions. Likely Supabase-backed persistence code not exercised outside mocked/cached paths.
- **`web/src/lib/supabase.ts`** — 43% statements, 0% branches/functions covered (client not initialized under test — `NEXT_PUBLIC_SUPABASE_URL not set` warning appears in test output).
- **`shared/rules/pythonHelpers.ts`** (30.70%) and **`shared/rules/pythonAst.ts`** (58.71%, 0% functions/branches) — Python AST support code with minimal exercise from the current TS-focused test suite.
- Most individual rule files in `shared/packs/**` sit in the 25–65% range for the "python variant" and "no-match" rule files (e.g. `core-quality-py-*.ts`, `core-security-py-*.ts`, `vibe-py-*.ts` all under 55%) — consistent with rules that only have TS-side fixtures today.
