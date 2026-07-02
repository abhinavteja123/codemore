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
| A1 | Phase 4: adapter parser tests — feed canned bandit/gitleaks/ruff/biome/npm-audit/pip-audit/golangci/clippy output into each `daemon/external/*.ts` parser; malformed/old-version output must fail loud, not silent-zero (the stale-biome bug class). Coverage today: 0% functions. | Adapters are the polyglot story; untested | 1 session | **blocking** |
| A2 | Phase 5: agentic-fixer branch tests — validator crash paths, partial-pass verdicts (happy paths already covered) | Fix loop is a headline feature | 0.5 session | nice-to-have |
| A3 | External-tool recall audit (HANDOFF Phase 11D) — run bandit/gitleaks/ruff on the Part-7 real codebases, diff against native findings; precision was fixed, recall never measured | Honesty of "58 rules" claim | 1 session | **blocking** |
| A4 | Multi-IDE verification matrix — MCP config in Cursor, Claude Code, Claude Desktop, Codex CLI; screen-record each | The core pitch is "your agent reads this" | 1 session, manual | **blocking** |
| A5 | Flip `.c8rc.json` to `"all": true`, re-baseline coverage | Current numbers count exercised files only | 10 min | nice-to-have |
| A6 | Extract single report builder into `shared/report/` (assembly today scattered across registryAdapter/scan/projectScanner/mcp) + run ajv validation at emit time, not just in tests | "Schema is the product" belongs in the product | 0.5 session | nice-to-have |
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
