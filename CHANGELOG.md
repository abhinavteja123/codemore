# Changelog

All notable changes to CodeMore. Semantic Versioning.

## [Unreleased] — Phase 2 catalog expansion + Phase 3 agentic loop

### Added

#### Agentic fixer loop (Phase 3)

- **`daemon/services/agenticFixer.ts`** — the planner → generator → validator → retry orchestrator. Provider-agnostic by design: takes a `FixGenerator` function as input so OpenAI / Anthropic / Gemini / local-LLM / stub-for-tests all slot in without touching the loop.
- **`buildFixPrompt`** assembles the canonical prompt: rule citation, evidence, line-numbered file content, suggested-fix instructions, verification criteria, and on retry the previous validator diagnostic.
- **`stripCodeFences`** defensively strips markdown fences only when the WHOLE generator output is one fenced block (preserves markdown fixtures).
- **MCP server gains `apply_fix(instanceId)` tool** — returns the planner prompt + loop-protocol instructions so the remote agent (which IS the generator over stdio) can run the loop itself.
- **`rejectOnNewFindings`** (default true) — attempts that fix the targeted rule but introduce a new finding elsewhere are rejected.
- **`test/agentic-fixer.test.ts`** — 8 tests covering happy path, retry, exhaustion, maxAttempts respect, generator-error short-circuit, code-fence stripping, and prompt assembly. All passing.

#### Rule packs

- **`vibe-auth` pack** (new). Detectors for authentication / authorization mistakes that are disproportionately common in vibe-coded apps.
  - `vibe-auth-missing-session-check` — POST/PUT/PATCH/DELETE handler with no auth helper anywhere.
  - `vibe-auth-bola` — handler verifies a session but queries by route-param id without scoping by the authenticated user. **The 2026 #1 vuln class in vibe-coded apps.**

#### Phase 2A — pivot-debris rules (`core-quality` pack)

- `core-quality-unreachable-code` — statements after `return` / `throw` / `break` / `continue` / `process.exit()` in the same block.
- `core-quality-dead-conditional` — `if (true)` / `if (false)` / `if (X === X)` and similar constant-condition `if`s.
- `core-quality-cyclomatic-complexity` — function-likes exceeding McCabe 15.
- `core-quality-unused-variable` — local `const` / `let` / `var` declarations never referenced.
- `core-quality-unused-import` — `import` bindings never referenced.
- `core-quality-unused-export` — exports never imported anywhere in the project (uses the new `ProjectIndex.allImportedNames` set).

#### Phase 2B — missing-implementation security rules

- `vibe-no-rate-limit` (`vibe-frontend`) — API route in a project with zero rate-limit libraries.
- `vibe-no-input-validation` (`vibe-frontend`) — state-changing route reads user input without a schema validator.
- `vibe-ssrf-fetch-user-input` (`core-security`) — Tenzai 2025 class: fetch / axios.X with a user-controlled URL.
- `vibe-db-write-without-where` (`core-security`, **BLOCKER**) — UPDATE / DELETE missing a WHERE clause.
- `vibe-db-select-star-from-user-table` (`core-security`) — `SELECT *` against user-data tables.

#### Phase 2C — supply-chain + emerging rules

- `vibe-secret-in-log` (`core-security`) — logger call references a variable named like a secret without a redaction wrapper.
- `vibe-prompt-injection-sink` (`core-security`, **BLOCKER**) — LLM response flowing into `eval` / `new Function` / `child_process.*` / `sql\`...\`` / `.query(<template>)`.

### Changed / Improved

- **`ProjectIndex`** — new cross-file snapshot at `daemon/cli/projectIndex.ts`. Built once per scan and reused by every rule via `RuleContext.projectIndex`. Provides:
  - Union of every module specifier imported anywhere in the project.
  - Union of every imported BINDING NAME across the project (used by `unused-export`).
  - Inventory of API route files (Next.js App Router, Pages Router, Express).
  - Booleans for `hasRateLimitLib`, `hasValidatorLib`, `hasAuthHelper`, `hasSupabase`.
- **`validatorHarness` parses TS sources** — fix for an issue caught by the new agentic-fixer tests: `validateFix` previously left `ctx.sourceFile` null, so every AST-based rule silently passed on the patched content. Now parses `ts.SourceFile` for `.ts/.tsx/.js/.jsx/.mjs/.cjs` files.
- **Extension / CLI / MCP parity** — `registryAdapter` now caches the most recent `ProjectIndex` per workspace root and reuses it on the per-file save hot path. Without this fix, Phase 2B rules silently no-op'd in the VS Code extension after file saves.
- **Suppression hygiene** — all `/* codemore-ignore-file: ... */` blanket headers in our own source were lifted and replaced with per-line `// codemore-ignore-next-line: rule-id` + a written reason on the line ABOVE. Self-scan baseline restored to 0 BLOCKERs on the codemore repo itself.
- **VSIX packaging** — `.vscodeignore` shrinks the published extension from ~113 MB to ~2.66 MB.

### Fixed

- Dashboard webview was showing 0 issues / 0 metrics — the legacy `analysisQueue` was broadcasting empty contextMap data over a registry scan. Both legacy callbacks now no-op.
- VS Code Extension Development Host smoke test was failing on Windows usernames containing spaces — `test/edh/runTest.ts` now uses a junction (`C:\codemore`) when available and overrides every relevant env var to a space-free temp dir.
- `vibe-prompt-injection-sink` was misclassifying `regex.exec(content)` as `child_process.exec` — bare-form `exec` now requires an explicit `child_process` import; method form requires a known alias root.
- `vibe-xss-dangerously-set` TP fixture was missing a `package.json` declaring React — framework detection couldn't apply the rule's `targetFrameworks` gate, and the rule didn't fire on the fixture even though the detector was correct.

### Tests

- `test/parity.test.ts` — locks the CLI ↔ MCP-equivalent ↔ daemon-adapter parity property. 4 tests, all green on `realistic-vibe-app`.
- `test/agentic-fixer.test.ts` — 8 tests covering the planner → generator → validator → retry loop end-to-end with stub generators.
- `test/edh/` — end-to-end smoke test running in a real VS Code Extension Development Host.

### Stats

- **Catalog: 18 → 33 rules.**
- **Self-scan**: 0 BLOCKERs on the codemore repo (85 honest findings on rule-quality / complexity / unused-imports).
- **Reference apps**: scores 98–100 across all 4 Vercel / Auth.js samples; 0 NEW BLOCKERs introduced by the catalog expansion.
- **PR validator**: green throughout the sprint.

## [0.1.0] — Phase 1 (initial public-ish state)

Initial catalog of 18 rules across 5 packs (`core-quality`, `core-security`, `vibe-supabase`, `vibe-secrets`, `vibe-frontend`). CLI + MCP server + VS Code extension all shipping. Self-test corpus + reference-app calibration. See git history for details.
