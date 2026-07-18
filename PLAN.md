# CodeMore — Road to Production (single source of plan truth)

**Updated:** 2026-07-15 · Supersedes the priority list in `HANDOFF.md` §5.

## Where we are (verified, not aspirational)

| Fact | Value |
|---|---|
| Rule catalog | 64 rules (5 Python-parity rules added in 0.3.0), 6 packs, 1:1 corpus fixtures, 64/64 TP + 64/64 FP |
| Real-world precision | ~77% post-calibration (`accuracy-report-2026-06-12.md`); 50-app benchmark 2026-07-15 (`benchmark/REPORT.md`) surfaced 4 calibration follow-ups → Track D below |
| Tests | 182 unit (mocha + ts-node) + corpus harness; mutation baseline `test/MUTATION-BASELINE.md` (16.72% overall / 35.97% covered — `npm run test:mutation`, manual pre-release gate, not CI) |
| CI | Green; Release v0.3.0 green (self-scan 0 BLOCKERs after `95f98e8`) |
| Surfaces proven | CLI binary spawn + MCP stdio handshake (`test/surface-smoke.test.ts`), CLI↔MCP↔daemon parity (`test/parity.test.ts`), extension EDH smoke (local only); web scans route through the same shared `scanProject()` since 0.3.0 |
| Security posture | Gitignored secret-file blind spot fixed (`.pem`/`.key`/`.npmrc`/`.pypirc` + PEM private-key pattern); report schema ajv-validated in tests |
| Distribution | npm `codemore@0.3.0` · VS Code Marketplace 0.2.8 (0.3.0 VSIX pending) · MCP registry listed (`io.github.abhinavteja123/codemore`) · codemore.tech live |

## Track A — Hardening (engineering, blocking for a credible 1.0)

| # | Item | Why | Effort | Tag |
|---|---|---|---|---|
| A1 | ✅ **DONE 2026-07-07** (`98f52c7`). Each `daemon/external/*.ts` parser extracted to an exported pure `parseXOutput(stdout)` fn; shared `parseShape.ts` makes malformed JSON **and** wrong-shape/old-version output fail loud (error diagnostic + null), not silent-zero. Dispatcher no longer says "ran ok" on an error diagnostic. `test/external-adapters.test.ts` = 30 canned good/empty/malformed/drift cases across all 8 adapters. 141 unit tests pass (was 111). | Adapters are the polyglot story; untested | 1 session | ~~blocking~~ done |
| A2 | ✅ **DONE 2026-07-07**. `test/validator-harness.test.ts` — 10 cases isolating `validateFix` branches the loop tests don't: partial-pass verdict (targeted line fixed, same rule fires elsewhere), ±3 line-drift tolerance both directions, `includeOtherRules`, and crash-resilience (unknown rule id / empty content / non-TS extension never throw). 151 unit tests pass. | Fix loop is a headline feature | 0.5 session | done |
| A3 | External-tool recall audit (HANDOFF Phase 11D). 🟡 **PARTIAL DONE 2026-07-07** — see `A3-recall-audit-2026-07-07.md`. Installed bandit/ruff/pip-audit/biome; ran native vs +external on flask-sqlalchemy (Python) + realistic-vibe-app (JS). Python recall honest once B101 assert-noise (264/269 bandit hits) excluded. **One real gap found:** native `core-security-hardcoded-secret-pattern` misses a hardcoded password at `todo/app.py:16` that bandit B105 catches (native scanned the file — fired todo-fixme on :17 — but the secret regex didn't match the assignment form). ✅ **B105 gap CLOSED 2026-07-08** — new rule `core-security-hardcoded-password` (CRITICAL, beta) ships in 0.2.6; catalog 58 → 59. Also live-validated the A1 adapters on real tool output (0 drift). **Remaining:** clippy (Rust toolchain), gitleaks/golangci (binary downloads), JS recall (biome needs a config), and a real Python *app* target in `samples.json`. | Honesty of "58 rules" claim | 1 session | partial |
| A4 | ✅ **DONE 2026-07-15** (`f14e871`). `docs/ide-matrix.md`: raw stdio handshake PASS (6 tools, real scan evidence); Claude Code live-connected (`claude mcp add`); Cursor verified (dry-run + synthetic full install); Claude Desktop config written live with `.bak`; Codex honestly unverified (binary absent). README links it. Remaining: GUI screen-recordings per the doc's checklists. | The core pitch is "your agent reads this" | 1 session, manual | ~~blocking~~ done |
| A5 | ✅ **DONE 2026-07-07**. `.c8rc.json` `all:true`; re-baselined in `test/COVERAGE-BASELINE.md` — honest repo-wide 46.55% stmts / 63.11% branch / 49.51% funcs (was 54.92% under `all:false`). `daemon/external` branch coverage 92.3% + `parseShape.ts` 100% post-A1; `runX` spawn fns still 0% (A3 territory). | Current numbers count exercised files only | 10 min | done |
| A6 | ⚠️ **Reassessed 2026-07-07 — recommend CLOSE (mostly non-task).** (1) The "scattered assembly" premise is false: `schemaVersion:` is set in exactly ONE place (`projectScanner.ts:387`); mcp (`server.ts:128`) + scan both route through `scanProject`, so there's a single assembler already — extracting a one-caller builder is YAGNI. (2) "ajv at emit" would need ajv+ajv-formats moved from devDeps→deps (breaks the published CLI otherwise) + a lockfile regen (scarred history) — for marginal gain, since `test/report-schema.test.ts` **already** validates real end-to-end `scanProject` output against `schema.json` (strict ajv), i.e. the sole emit path is already schema-enforced in CI. Only do the dep-move if you specifically want redundant prod-time validation — that's a B1 publish decision. | "Schema is the product" belongs in the product | 0.5 session | recommend close |
| A7 | ✅ **DONE 2026-07-15** (`b095586`, `b1abc67`). StrykerJS on `shared/**`: 12,032 mutants, 157-min run, 16.72% overall / 35.97% covered-only (structurally low — packs are gated by the corpus harness, not mocha; see `test/MUTATION-BASELINE.md`). 10 worst survivors killed with exact-value assertions; tests 167 → 182. `npm run test:mutation` = manual pre-release gate, NOT CI. | Proves tests assert, not just execute | post-launch | done |

## Track B — Distribution (user actions needed: accounts/tokens)

| # | Item | Notes | Tag |
|---|---|---|---|
| B1 | 🟡 **PARTIAL 2026-07-08** — Publish `codemore` to npm | `codemore@0.2.5` live (`npx codemore` works). 0.2.6 tagged locally, pending tag push (CI publish needs `NPM_TOKEN` secret). | ~~blocking~~ partial |
| B2 | 🟡 **PARTIAL 2026-07-08** — Publish `.vsix` to VS Code Marketplace | 0.2.6 VSIX built at 2.84 MB (was 118.72 MB before the `*.tgz` .vscodeignore fix); Marketplace upload pending (Azure DevOps PAT + `vsce publish`). | ~~blocking~~ partial |
| B3 | 🟡 **PARTIAL 2026-07-08** — Deploy docs site (`web/`) | Live on Vercel at codemore.tech. Env vars partial: auth works; Supabase + Gemini keys pending. Telemetry stays off until env complete. | ~~blocking~~ partial |
| B4 | MCP marketplace/registry submissions | After B1 (install command must exist) | nice-to-have |
| B5 | Demo video + 50-app benchmark study | Launch marketing tier | nice-to-have |

## Track C — Trust flywheel (post-launch)

| # | Item | Notes |
|---|---|---|
| C1 | Opt-in telemetry live (endpoint exists, Zod-strict, path/content-rejecting) | Needs B3 |
| C2 | First beta→stable promotions | Requires 30-day telemetry <2% FP per rule — impossible before C1 |
| C3 | `auto-demote-rules.yml` nightly workflow | README already describes it as planned |

## Suggested order

1. A1 + A3 (one session: adapters + recall audit share the same real-codebase harness)
2. B1 + B2 + B3 (one sitting, mostly account setup; repack vsix after A1 lands)
3. A4 multi-IDE matrix → launch
4. C1→C2→C3 flywheel; A2/A5/A6 opportunistically; A7 post-launch

## What we deliberately do NOT do

Unchanged from `docs/limitations.md`: no password-policy judgment, no business-logic flaws, no race detection, no infra scanning. "Agent-actionable or it's not a rule."
