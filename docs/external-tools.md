# External tool adapters

CodeMore's native catalog (59 rules) covers **TypeScript / JavaScript / SQL / Python**. Polyglot repos sometimes need broader coverage. The `--external-tools` flag wraps eight industry-standard tools and routes their output through the same `codemore-report.json` schema — so the agent loop (`apply_fix` / `validate_fix` / `suggest_fix`) keeps working uniformly.

## Quick start

```bash
codemore scan ./my-repo --external-tools ruff
codemore scan ./my-repo --external-tools ruff,biome
codemore scan ./my-repo --external-tools all   # ruff + golangci + clippy + biome + bandit + gitleaks + npm-audit + pip-audit
```

**Off by default.** None of the adapters run unless `--external-tools` is passed.

**Silent skip on missing binary.** If a tool isn't installed on `$PATH`, CodeMore prints a one-line install hint to stderr and continues with whatever IS installed. The scan never errors because of a missing external tool.

## Supported tools

| Tool | Languages / scope | Install | Output mode |
|---|---|---|---|
| **ruff** | Python | `pip install ruff` | `ruff check --output-format json` |
| **golangci-lint** | Go | [installer](https://golangci-lint.run/usage/install/) | `golangci-lint run --out-format json` |
| **clippy** | Rust | `rustup component add clippy` | `cargo clippy --message-format=json` |
| **biome** | TypeScript / JavaScript / JSON | `npm i -g @biomejs/biome` | `biome check --reporter=json` |
| **bandit** | Python security | `pip install bandit` | `bandit -r <root> -f json -q` |
| **gitleaks** | Secrets (working tree) | [releases](https://github.com/gitleaks/gitleaks) | `gitleaks detect --report-format=json --no-git` |
| **npm-audit** | npm dependency CVEs | ships with npm (needs `package-lock.json`) | `npm audit --json` |
| **pip-audit** | Python dependency CVEs | `pip install pip-audit` | `pip-audit --format json` |

## Rule-id namespace

External findings appear in your report with the rule id prefixed `ext:<tool>:<original-rule-id>`:

| Source | Example rule id |
|---|---|
| ruff | `ext:ruff:F401` (unused import), `ext:ruff:S102` (exec usage) |
| golangci | `ext:golangci:errcheck`, `ext:golangci:gosec` |
| clippy | `ext:clippy:needless_collect`, `ext:clippy:useless_format` |
| biome | `ext:biome:lint/correctness/noUnusedVariables`, `ext:biome:lint/security/noDangerouslySetInnerHtml` |

Native rule ids stay clean (e.g. `vibe-auth-bola`, `core-quality-empty-except`). The namespace makes it trivial to filter agent fixes to native-only or external-only via `--packs` (native packs only) or by inspecting `id.startsWith('ext:')` in your downstream pipeline.

## Severity translation

Each adapter has a static map from the tool's native rule category to our canonical severity. Examples:

| Source | Native | CodeMore |
|---|---|---|
| `ruff` S-rules (bandit/security) | warning | **BLOCKER** |
| `ruff` F-rules (pyflakes) | warning | MAJOR |
| `ruff` E/W-rules (pycodestyle style) | warning | MINOR |
| `golangci-lint` `gosec` | warning | **BLOCKER** |
| `golangci-lint` `errcheck` / `staticcheck` | warning | MAJOR |
| `clippy` error | error | **BLOCKER** |
| `clippy` warning | warning | MAJOR |
| `biome` `lint/security/*` | error | **BLOCKER** |
| `biome` `lint/correctness/*` | error | MAJOR |
| `biome` `lint/style/*` | warning | MINOR |

Confidence is fixed at **0.8** for every external finding — we trust the tools but not blindly.

## Suppression interop

External-tool findings are suppressible the same way as native rules:

```python
# Reason: this print is the CLI's user-facing output.
# codemore-ignore-next-line: ext:ruff:T201
print("scan complete")
```

```go
// Reason: errcheck false positive on a defer-Close idiom.
// codemore-ignore-next-line: ext:golangci:errcheck
defer file.Close()
```

The suppression filter is in our pipeline, not the external tool — so even if `ruff` doesn't understand our comment format, the suppression still removes the finding from the final report.

## How adapters work

Each adapter is a thin spawn-and-parse wrapper:

1. `spawn(<binary>, [...args], { cwd: root })`.
2. Buffer stdout. Tolerate stderr.
3. On exit:
   - Code 0 = no findings (normal).
   - Code 1 = findings present (normal for tools that exit 1 on lint hits).
   - Higher codes = error → log to stderr, return empty result.
4. Parse stdout as JSON / NDJSON.
5. Translate each entry into `ReportIssue` with `ext:<tool>:<code>` id, severity-mapped, confidence 0.8, deep-link citation.

Sources:
- `daemon/external/index.ts` — dispatcher.
- `daemon/external/ruff.ts` — Python.
- `daemon/external/golangci.ts` — Go.
- `daemon/external/clippy.ts` — Rust.
- `daemon/external/biome.ts` — TS/JS/JSON.
- `daemon/external/bandit.ts` — Python security.
- `daemon/external/gitleaks.ts` — secrets.
- `daemon/external/npm-audit.ts` / `daemon/external/pip-audit.ts` — dependency CVEs.
- `daemon/external/parseShape.ts` — shared fail-loud output validation: malformed output or valid-JSON-wrong-shape (tool version drift) produces an error diagnostic, never a silent zero-findings result.

Each adapter is ~150 lines, predominantly the spawn lifecycle. Adding a new adapter for a 9th tool follows the same template.

## Performance

All requested tools run **in parallel** with the native walk. The dispatcher awaits them at the merge point. On a 100-file project, expect:

- Native pack: ~100ms
- Ruff: ~50ms (Rust binary, very fast)
- golangci-lint: 5-30s (cold cache, depends on linter set)
- clippy: 10-60s (first run includes incremental compile)
- biome: ~200ms

Tools that exceed the per-tool `timeoutMs` (default 60s) are killed with a single `[tool] timeout` notice.

## When NOT to enable external tools

The wedge of CodeMore is "the static analyzer your AI agent reads, for vibe-coded apps." The native catalog is the IP. External tools add coverage when you have a polyglot repo OR want stylistic coverage we don't ship natively. If your project is pure TS/JS/SQL/Python, the native catalog covers it and you don't need `--external-tools`.

## Known limitations (v1)

- Biome's span-to-line conversion reads each file from disk on demand (cached). On 1000+ findings this adds ~50ms; not yet streamed.
- Clippy requires a `Cargo.toml` at the scan root or a workspace member — running on a non-Rust directory produces zero findings with a `no Cargo.toml in scan root` notice.
- Golangci-lint's per-linter config is honored as long as the user maintains their own `.golangci.yml` in the scan root.
- We don't yet stream tool output — all findings are buffered before they're merged. Long-running scans may feel quiet for tens of seconds.
