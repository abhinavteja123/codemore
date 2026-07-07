# CodeMore — Road to Production (single source of plan truth)

**Updated:** 2026-07-02 · Supersedes the priority list in `HANDOFF.md` §5.

## Where we are (verified, not aspirational)

| Fact | Value |
|---|---|
| Rule catalog | 58 rules, 6 packs, 1:1 corpus fixtures, 100% recall / 100% precision on the 116-fixture corpus |
| Real-world precision | ~77% (was 22% pre-calibration; `accuracy-report-2026-06-12.md`) |
| Tests | 111 passing (unit + white-box Phases 1–3 + surface smoke), mocha + ts-node, c8 coverage wired (`npm run test:coverage`) |
| CI | Green as of `d51ba65` lineage: install (lockfile phantom purge), lint (0 errors), compile, unit tests |
| Surfaces proven | CLI binary spawn + MCP stdio handshake (`test/surface-smoke.test.ts`), CLI↔MCP↔daemon parity (`test/parity.test.ts`), extension EDH smoke (local only) |
| Security posture | Gitignored secret-file blind spot fixed (`.pem`/`.key`/`.npmrc`/`.pypirc` + PEM private-key pattern); report schema ajv-validated in tests |
| Distribution | **Source only**: github.com/abhinavteja123/codemore (public). npm: unpublished (`codemore` free as of 2026-07-02). VS Code Marketplace: unpublished (`codemore-0.2.1.vsix` local). Docs site: undeployed. |

## Track A — Hardening (engineering, blocking for a credible 1.0)

| # | Item | Why | Effort | Tag |
|---|---|---|---|---|
| A1 | ✅ **DONE 2026-07-07** (`98f52c7`). Each `daemon/external/*.ts` parser extracted to an exported pure `parseXOutput(stdout)` fn; shared `parseShape.ts` makes malformed JSON **and** wrong-shape/old-version output fail loud (error diagnostic + null), not silent-zero. Dispatcher no longer says "ran ok" on an error diagnostic. `test/external-adapters.test.ts` = 30 canned good/empty/malformed/drift cases across all 8 adapters. 141 unit tests pass (was 111). | Adapters are the polyglot story; untested | 1 session | ~~blocking~~ done |
| A2 | ✅ **DONE 2026-07-07**. `test/validator-harness.test.ts` — 10 cases isolating `validateFix` branches the loop tests don't: partial-pass verdict (targeted line fixed, same rule fires elsewhere), ±3 line-drift tolerance both directions, `includeOtherRules`, and crash-resilience (unknown rule id / empty content / non-TS extension never throw). 151 unit tests pass. | Fix loop is a headline feature | 0.5 session | done |
| A3 | External-tool recall audit (HANDOFF Phase 11D). 🟡 **PARTIAL DONE 2026-07-07** — see `A3-recall-audit-2026-07-07.md`. Installed bandit/ruff/pip-audit/biome; ran native vs +external on flask-sqlalchemy (Python) + realistic-vibe-app (JS). Python recall honest once B101 assert-noise (264/269 bandit hits) excluded. **One real gap found:** native `core-security-hardcoded-secret-pattern` misses a hardcoded password at `todo/app.py:16` that bandit B105 catches (native scanned the file — fired todo-fixme on :17 — but the secret regex didn't match the assignment form). Also live-validated the A1 adapters on real tool output (0 drift). **Remaining:** clippy (Rust toolchain), gitleaks/golangci (binary downloads), JS recall (biome needs a config), and a real Python *app* target in `samples.json`. | Honesty of "58 rules" claim | 1 session | partial |
| A4 | Multi-IDE verification matrix — MCP config in Cursor, Claude Code, Claude Desktop, Codex CLI; screen-record each | The core pitch is "your agent reads this" | 1 session, manual | **blocking** |
| A5 | ✅ **DONE 2026-07-07**. `.c8rc.json` `all:true`; re-baselined in `test/COVERAGE-BASELINE.md` — honest repo-wide 46.55% stmts / 63.11% branch / 49.51% funcs (was 54.92% under `all:false`). `daemon/external` branch coverage 92.3% + `parseShape.ts` 100% post-A1; `runX` spawn fns still 0% (A3 territory). | Current numbers count exercised files only | 10 min | done |
| A6 | ⚠️ **Reassessed 2026-07-07 — recommend CLOSE (mostly non-task).** (1) The "scattered assembly" premise is false: `schemaVersion:` is set in exactly ONE place (`projectScanner.ts:387`); mcp (`server.ts:128`) + scan both route through `scanProject`, so there's a single assembler already — extracting a one-caller builder is YAGNI. (2) "ajv at emit" would need ajv+ajv-formats moved from devDeps→deps (breaks the published CLI otherwise) + a lockfile regen (scarred history) — for marginal gain, since `test/report-schema.test.ts` **already** validates real end-to-end `scanProject` output against `schema.json` (strict ajv), i.e. the sole emit path is already schema-enforced in CI. Only do the dep-move if you specifically want redundant prod-time validation — that's a B1 publish decision. | "Schema is the product" belongs in the product | 0.5 session | recommend close |
| A7 | Phase 6: mutation testing (StrykerJS) on `shared/rules/` | Proves tests assert, not just execute | post-launch | deferred |

## Track B — Distribution (user actions needed: accounts/tokens)

| # | Item | Notes | Tag |
|---|---|---|---|
| B1 | Publish `codemore` to npm | Name free as of 2026-07-02 — claim it soon. `npm publish` from repo root; `bin` already wired to `cli.js`. Needs npm account + 2FA token. | **blocking** |
| B2 | Publish `.vsix` to VS Code Marketplace | Publisher id `codemore` in package.json; needs Azure DevOps PAT + `vsce publish`. Repack at current commit first (v0.2.1 vsix predates today's fixes). | **blocking** |
| B3 | Deploy docs site (`web/`) | Vercel free tier fits Next.js 14; telemetry endpoint lives there too — deploy before flipping telemetry on. | **blocking** |
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
