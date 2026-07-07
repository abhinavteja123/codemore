# Changelog

All notable changes to CodeMore. Semantic Versioning.

## [0.2.2] — 2026-07-07 — pre-publish hardening: adapter drift guards, precision fixes, tester-pass defects

### Added

- **External-adapter fail-loud parsers** — every `daemon/external/*.ts` parser extracted to a pure `parseXOutput(stdout)` + shared `parseShape.ts`; malformed output AND valid-JSON-wrong-shape (tool version drift, e.g. npm v6 `advisories`) now produce an error diagnostic instead of a silent zero-findings result. 30 canned-fixture tests.
- **Vendored AI-tooling dirs skipped by the walker** — `.agents/`, `.codex/`, `.windsurf/`, `.aider/`, `.github/skills/`, and subdir-only `.claude/*/` + `.cursor/*/` (top-level `mcp.json`/`settings.json` stay scannable for `vibe-mcp-config-secret`). codemore self-scan noise −85% (2,148 → 318 findings; BLOCKERs 98 → 8, all genuine).
- **Suffix `*.env` secret carriers** (`secrets.env`, `prod.env` — docker-compose `env_file` convention) now routed to the env language and covered by the gitignore secret-bypass. Previously silently dropped (same class as the 0.2.1 `.pem` fix).
- `test/validator-harness.test.ts`, `test/external-adapters.test.ts`, `test/codemorerc-effects.test.ts`, MCP `tools/call` surface tests — suite 111 → 160.

### Fixed

- **`core-quality-unused-export`**: `ProjectIndex.allImportedNames` now also collects renamed re-exports (`export { X as Y } from`), CommonJS `require()` destructuring, and namespace member access (`import * as ns; ns.foo`) — the rule no longer flags exports consumed through those forms.
- **`core-security-shell-injection` v1.2.0**: array-args `spawn`/`spawnSync`/`execFile`/`execFileSync` without a literal truthy `shell:` option is Node's safe form and is no longer flagged (open-design: 25 → 3 BLOCKERs).
- **`core-security-path-traversal` v1.3.0**: constant-only joins (`os.path.join(CONST_DIR, "x.json")`) no longer flagged — the `\.json\b` user-input hint was matching file extensions inside string literals.
- **MCP `scan_file`**: built its RuleContext with `sourceFile: null`, so every AST rule silently skipped inline content that `scan_project` flagged. Now parses a TS AST for TS/JS.
- **MCP `scan_project`**: a nonexistent `rootPath` returned a valid empty report (agents read "clean project"); now an `isError` result.
- **`.codemorerc.json` severity remap**: a per-finding severity set by a detector silently defeated the user's rules remap; user override now outranks both.
- **Malformed `.codemorerc.json`**: loader warnings are now written to stderr instead of being silently swallowed.
- Dispatcher no longer reports "ran ok — 0 findings" for a tool that emitted an error diagnostic.

### Audit

- `accuracy-report-2026-07-07.md` — 7 codebases: 100% planted-vuln recall, ~90% BLOCKER TP post-fixes, real OpenAI key caught in a production `.env`; corpus held at 58/58 recall + 58/58 precision throughout.

## [0.2.1] — 2026-06-12 — Part 7 accuracy audit + calibration

### Added — walker hardening from multi-project testing (11 codebases)

- **`venv/` family added to universal-skip patterns** — was a critical gap. Tested project `shopsec` scanned 22,088 files inside `venv/Lib/site-packages/` before this fix. Now also skipped: `.venv/`, `__pycache__/`, `.mypy_cache/`, `.ruff_cache/`, `.pytest_cache/`, `.tox/`, `.eggs/`, `*.egg-info/`, `site-packages/`, `env/`. After fix: shopsec drops from 22,201 findings → 113 (-99.5%).
- **`triage-results/` added to universal-skip** — Part 7 audit harness writes per-project triage markdown that contains redacted-secret snippets. Without this skip, the codemore self-scan was re-flagging its own audit report as 5 BLOCKERs.

### Fixed — `core-security-hardcoded-secret-pattern` (v1.2.0)

- **Template / example env files are now exempt.** Patterns: `.env.example`, `.env.sample`, `.env.template`, `.env.dist`, `env.example`, `env.sample`. These files exist to show the format with placeholder values; flagging them was noise (Senti's `.env.example` triggered on `xoxb-your-sl…` — a placeholder).

### Re-tested on 11 real codebases (v0.2.1 final numbers)

| Project | Findings | BLOCKERs | Real-bug rate on BLOCKERs |
|---|---:|---:|---:|
| EchoVault | 122 | 10 | **100%** (real Supabase RLS-permissive policies) |
| ProofSnap | 134 | 4 | **100%** |
| AImentor | 224 | 5 | **100%** (real OpenAI keys in .env + research code) |
| Hackathonnn | 129 | 3 | **100%** (real Google API keys) |
| shopsec | 113 (was 22,201) | 5 | **100%** |
| Senti | 155 | 8 (was 9 — placeholder gone) | **100%** |
| open-design | 8,615 | 101 | **~80%** (large monorepo) |
| Gen ai | 63 | 4 | **75%** |
| NLP | 13 | 0 | n/a |
| claw-code | 5 | 0 | n/a |
| codemore (own) | 282 (was 593) | 6 | 17% (demo data in sandbox/landing) |
| **Aggregate (excl. own)** | **9,673 → 9,573** | **140** | **~85%** |

**Across 10 external codebases: ~85% TP rate on BLOCKERs.** Above the ≥ 75% production-ready bar.

### Added — walker bypass for secret-shaped filenames (the impactful one)

- **Walker now SCANS files matching well-known secret-carrier patterns even when `.gitignore` excludes them.** Patterns: `.env*`, `*.pem`, `*.key`, `firebase-adminsdk*.json`, `*service-account*.json`, `credentials.json`, `serviceAccountKey.json`, `.npmrc`, `.pypirc`. Mirrors what gitleaks / GitGuardian do.
- **`--respect-gitignore-fully`** CLI flag to opt out (default: bypass enabled).
- **Why this matters:** real-world testing on the user's `Gen ai` project found a Firebase admin SDK JSON with a live `private_key` block — sitting in the repo root with a `.gitignore` entry saying "ROTATE THESE KEYS." CodeMore v0.2.0 silently missed it. v0.2.1 catches it.

### Fixed — 5 rule calibrations from the real-world accuracy audit

- **`core-quality-duplicate-string`** demoted to `lifecycle: 'experimental'` — real-world precision was ~10% (framework labels, severity strings, file extensions are intended-repeated). Behind `--enable-experimental` until threshold-by-language tuned.
- **`core-quality-py-unused-import`** (v1.2.0) — now skips files that `from __future__ import annotations` (typing imports look unused but are runtime-string annotations), and skips imports inside `try: ... except ImportError:` (optional deps). NLP precision: ~25% → ~85%.
- **`core-quality-leftover-print`** (v1.3.0) — exempts diagnostic scripts (`inspect_*.py`, `check_*.py`, `debug_*.py`, `dump_*.py`, …) and ML scripts (`train_*.py`, `predict_*.py`, `*_pipeline.py`, OR any file importing `torch`/`tensorflow`/`tqdm`/`wandb`/`transformers`/`pytorch_lightning`/etc.). Gen ai precision: ~5% → ~88%.
- **`core-security-path-traversal`** (v1.2.0) + **`core-security-shell-injection`** (v1.1.0) — both now strip string literals + comments before matching, and classify the captured argument against the ORIGINAL content (so pure string literals still classify as `pure-literal`). Eliminates the rules' self-detection inside their own JSDoc examples. Path-traversal's user-input hint dropped bare `\bargs\b` (CLI args ≠ HTTP `req.params`).

### Added — `shared/rules/stripContent.ts`

Shared helper for `stripJsCommentsAndStrings` + `stripPyCommentsAndStrings`. Replaces the local helper that used to live inside `core-security-eval.ts`.

### Verification — real-world numbers across 5 projects

| Project | Before | After | Delta |
|---|---:|---:|---:|
| AImentor (FastAPI + React, 59K LOC) | 410 / 1 BLOCKER | **224 / 5 BLOCKERs** | -45% noise, +4 real secrets surfaced |
| Gen ai (Firebase + RAG, 16K LOC) | 116 / 0 BLOCKERs | **63 / 4 BLOCKERs** | -46% noise, **+4 real `.env` secrets** |
| NLP (Streamlit, 38K LOC) | 31 | **13** | -58% |
| codemore (self-scan, 60K LOC) | 593 / 12 BLOCKERs | **293 / 11 BLOCKERs** | -51% (self-detection fixed) |
| claw-code (clean ref, 19K LOC) | 7 | **5** | 0 BLOCKERs (unchanged) |
| **Total** | **1,157** | **598 (-48%)** | **+7 real BLOCKERs surfaced** |

- Corpus accuracy script: 58/58 recall + 58/58 precision (no regression)
- Per-rule precision on real codebases: ≥75% on every rule that fired
- Full report: `accuracy-report-2026-06-12.md`

---

## [0.2.0] — 2026-06-11 — Phase 8 + Part 5 production hardening

### Added — 10 new security rules (default-on as of this release)

- **`core-security-sql-injection-concat`** (BLOCKER) — classical SQLi via string concatenation or template-literal interpolation feeding `db.query` / `cursor.execute` / `client.raw`. Covers TS / JS / Python.
- **`core-security-path-traversal`** (BLOCKER) — `open(prefix + user_input)` / `fs.readFile(req.params.x)` / `send_file(name)` without a `abspath + startswith` guard. CWE-22.
- **`core-security-weak-hash`** (MAJOR) — MD5 / SHA-1 used in auth-context (password / token / secret hashing).
- **`core-security-insecure-deserialization`** (BLOCKER) — `pickle.loads` on request bytes, `yaml.load` without `SafeLoader`, `marshal.loads(user)`, `shelve.open(user)`. OWASP A08.
- **`vibe-file-upload-no-validation`** (MAJOR) — file save without extension allowlist / MIME check / `secure_filename`. Catches multer-without-fileFilter, Flask raw saves, plain `writeFileSync(req.file.originalname)`.
- **`vibe-cookie-missing-flags`** (MAJOR) — session middleware / `res.cookie` config missing `httpOnly: true`, `secure: true`, or `sameSite`. Covers express-session, iron-session, cookie-session, NextAuth.
- **`vibe-llm-output-to-sink`** (BLOCKER) — LLM response (OpenAI / Anthropic / LangChain) flows into `eval` / `exec` / `Function` / `os.system` / `subprocess` / SQL template, with one-level taint propagation through intermediate assignments. OWASP LLM02.
- **`vibe-agent-tool-no-confirm`** (MAJOR) — agent tool with a destructive verb name (`delete_*`, `send_*`, `transfer_*`, `deploy_*`, ...) registered without a `requires_confirmation` / `approval` / `human_in_the_loop` hint. OWASP LLM07 + LLM08.
- **`vibe-cicd-secret-in-yaml`** (BLOCKER) — literal secret in `.github/workflows/*.yml`, `echo ${{ secrets.X }}` to the job log, or `Authorization: ...` header with a bare templated token.
- **`core-security-tls-disabled`** (MAJOR) — `rejectUnauthorized: false`, `verify=False`, `urllib3.disable_warnings`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `ssl._create_unverified_context`.

### Added — 4 new external-tool adapters (opt-in via `--external-tools <name>`)

- **`bandit`** — Python SAST. Severity map: HIGH → BLOCKER, MEDIUM → MAJOR, LOW → MINOR.
- **`gitleaks`** — git secret scanner. Always BLOCKER on findings. Secret values redacted before being put into report.
- **`npm-audit`** — JS/TS CVE coverage. Reads `package-lock.json`; silent-skips on missing lockfile.
- **`pip-audit`** — Python CVE coverage. Reads `requirements.txt` if present, else `pip-audit --strict` against the active env.

### Added — CI security gate template

- **`templates/.github/workflows/codemore-security-gate.yml`** — copy-paste GitHub Action chaining CodeMore SAST + Ruff + Biome + Bandit + Gitleaks + npm-audit + pip-audit + Checkov.
- **`docs/security-gate.md`** — install + customise guide.
- **`docs/limitations.md`** — honest "what we don't catch" page.

### Added — CLI flags

- **`--external-tools <list|all>`** — engage the external adapter family (8 supported tools).
- **`--telemetry`** / **`--no-telemetry`** — opt-in anonymous fingerprint ping to `codemore.dev/api/telemetry`. Schema-validated, content-redacted.
- **`--verbose`** — surface per-adapter diagnostics to stderr.

### Added — Web

- **Docs site** at `/docs` with 48 statically-generated rule pages.
- **Opt-in telemetry endpoint** at `/api/telemetry` with strict Zod schema + 10-minute per-fingerprint rate limit + 64 KB cap.
- **Supabase migration `005_telemetry.sql`** with RLS denying all reads.

### Fixed

- **`core-quality-leftover-print`** (v1.2.0) — exempts stderr/stdout kwargs, scripts/, .github/, main.py entry points, `if __name__ == "__main__":`. Eliminated 83 FPs on a representative CLI project.
- **`core-quality-py-unused-import`** (v1.1.0) — honors `if TYPE_CHECKING:` blocks and `__all__` re-exports. Matches ruff F401 parity.
- **`vibe-py-secret-in-log`** (v1.1.0) — exempts count-prefix identifiers (`input_tokens`, `output_tokens`, `total_tokens`, ...) so LLM token counts no longer trigger.
- **Bundled biome** bumped to **1.9.4** (from 1.5.3 which lacked `--reporter=json`). SHA-256 pinned in `scripts/binary-hashes.json`.
- **External-tool diagnostic double-fire** — adapter error handler now uses an `errored` flag so only one message per skipped tool.

### Changed

- **All 58 rules now ship at `lifecycle: 'beta'`** — default scan fires every rule. Promotion bar (`<5% FP on corpus + 0% FP on Vercel reference apps`) verified by `node scripts/measure-accuracy.js` reporting **58/58 recall + 58/58 precision** across all corpus fixtures.

### Verification snapshot

- **vibe-bad-app** (synthetic): default scan reports 150 issues / 51 BLOCKERs / 58 distinct rules.
- **claw-code** (real Anthropic ref repo, 215 files, 19 K LOC): 100/100 score, 7 findings, 0 BLOCKERs.
- **CLI ↔ MCP parity**: byte-equivalent reports for the same scan target.

---

## [0.2.0-dev] — Phase 2 catalog expansion + Phase 3 agentic loop (shipped in 0.2.0; was mislabeled "Unreleased")

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
- `core-quality-duplicate-string` — same string literal repeated ≥ 3 times in the same file.

#### Phase 2B — missing-implementation security rules

- `vibe-no-rate-limit` (`vibe-frontend`) — API route in a project with zero rate-limit libraries.
- `vibe-no-input-validation` (`vibe-frontend`) — state-changing route reads user input without a schema validator.
- `vibe-ssrf-fetch-user-input` (`core-security`) — Tenzai 2025 class: fetch / axios.X with a user-controlled URL.
- `vibe-db-write-without-where` (`core-security`, **BLOCKER**) — UPDATE / DELETE missing a WHERE clause.
- `vibe-db-select-star-from-user-table` (`core-security`) — `SELECT *` against user-data tables.
- `vibe-auth-inverted` (`vibe-auth`, **BLOCKER**) — CVE-2025-48757 class: anonymous branch returns more user data than the authenticated branch.
- `vibe-supabase-anon-key-bundled` (`vibe-supabase`, **BLOCKER**) — `createClient(URL, '<literal>')` in a client-reachable file. Moltbook-incident class.

#### Phase 2C — supply-chain + emerging rules

- `vibe-secret-in-log` (`core-security`) — logger call references a variable named like a secret without a redaction wrapper.
- `vibe-prompt-injection-sink` (`core-security`, **BLOCKER**) — LLM response flowing into `eval` / `new Function` / `child_process.*` / `sql\`...\`` / `.query(<template>)`.
- `vibe-supply-chain-hallucinated-import` (`core-security`) — import of a package not declared in `package.json` (slopsquatting defence). Severity MAJOR pending v1.1 monorepo-workspace support.

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

- **Catalog: 18 → 37 rules.**
- **Phase 2A (pivot-debris): 7/7.** Phase 2B (missing-impl security): 9/9. Phase 2C (supply-chain + emerging): 3/4 (recently-published deferred — needs npm-registry network infrastructure).
- **Cross-surface smoke verified**:
  - CLI: schema v1.0.0 + 37 rules + 6 packs.
  - MCP stdio: tools `apply_fix`, `explain_issue`, `scan_file`, `scan_project`, `suggest_fix`, `validate_fix` registered; `scan_project` returns identical issue counts to CLI.
  - Daemon adapter (extension path): byte-equivalent reports per `test/parity.test.ts`.
  - VS Code EDH: 4/4 smoke tests passing.
  - PR validator: green.
  - Sample scan: BLOCKERs at 15 (all in intentionally vulnerable synthetic apps); reference apps at scores 97-99 with 0 NEW BLOCKERs.
  - Self-scan on codemore repo: 0 BLOCKERs.
- **Self-scan**: 0 BLOCKERs on the codemore repo (85 honest findings on rule-quality / complexity / unused-imports).
- **Reference apps**: scores 98–100 across all 4 Vercel / Auth.js samples; 0 NEW BLOCKERs introduced by the catalog expansion.
- **PR validator**: green throughout the sprint.

## [0.1.0] — Phase 1 (initial public-ish state)

Initial catalog of 18 rules across 5 packs (`core-quality`, `core-security`, `vibe-supabase`, `vibe-secrets`, `vibe-frontend`). CLI + MCP server + VS Code extension all shipping. Self-test corpus + reference-app calibration. See git history for details.
