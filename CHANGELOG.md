# Changelog

All notable changes to CodeMore. Semantic Versioning.

## [Unreleased] — Phase 2 catalog expansion

### Added

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
  - Inventory of API route files (Next.js App Router, Pages Router, Express).
  - Booleans for `hasRateLimitLib`, `hasValidatorLib`, `hasAuthHelper`, `hasSupabase`.
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
- `test/edh/` — end-to-end smoke test running in a real VS Code Extension Development Host.

### Stats

- **Catalog: 18 → 32 rules.**
- **Self-scan**: 0 BLOCKERs on the codemore repo (85 honest findings on rule-quality / complexity / unused-imports).
- **Reference apps**: scores 98–100 across all 4 Vercel / Auth.js samples; 0 NEW BLOCKERs introduced by the catalog expansion.
- **PR validator**: green throughout the sprint.

## [0.1.0] — Phase 1 (initial public-ish state)

Initial catalog of 18 rules across 5 packs (`core-quality`, `core-security`, `vibe-supabase`, `vibe-secrets`, `vibe-frontend`). CLI + MCP server + VS Code extension all shipping. Self-test corpus + reference-app calibration. See git history for details.
