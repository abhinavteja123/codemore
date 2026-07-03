

# CodeMore
**LINK: [www.codemore.tech](https://codemore.tech/)**


**The static analyzer your AI agent reads.**

[![License: MIT](https://img.shields.io/badge/License-MIT-4ef2ca.svg?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.1-836ef3.svg?style=flat-square)](CHANGELOG.md)
[![Catalog](https://img.shields.io/badge/rules-58-success.svg?style=flat-square)](docs/rules)
[![Adapters](https://img.shields.io/badge/external%20adapters-8-blueviolet.svg?style=flat-square)](docs/external-tools.md)
[![Audit](https://img.shields.io/badge/audit-2026--06--12-pink.svg?style=flat-square)](accuracy-report-2026-06-12.md)
[![TP rate](https://img.shields.io/badge/BLOCKER%20TP%20rate-~85%25-4ef2ca.svg?style=flat-square)](accuracy-report-2026-06-12.md)

*58 native rules · 8 external adapters · CLI · MCP server · VS Code extension · GitHub Action — one report, every surface.*

</div>

---

## Why this exists

AI-assisted coding ships bugs at a measurable, growing rate:

- **45%** of AI-generated code carries an OWASP Top-10 vulnerability (Veracode 2025/26).
- **98%** of 1,072 scanned vibe-coded sites had ≥ 1 security flaw (Symbiotic).
- **70%** of audited Lovable apps shipped with Supabase RLS disabled (DEV).
- **2×** baseline secret-leak rate on AI-tool-assisted commits (GitGuardian SOSS 2026).
- **35** CVEs/month attributed to AI-generated code in March 2026, up from 6 in January.

Existing scanners (SonarQube, DeepSource, Snyk) target **human reviewers via dashboards**. CodeMore targets the **LLM that wrote the code in the first place** — and emits a schema-stable JSON report any coding agent (Cursor, Claude Code, Codex, Copilot) can read, fix, and verify against.

> **The agent that wrote the bug can also write the fix — if it can read the report.**

---

## v0.2.1 — production-ready (2026-06-12)

Audited on **10 real codebases**. Aggregate **~85% true-positive rate** on BLOCKER findings. Above DeepSource's ≥ 75% production bar.

| Project | Findings | BLOCKERs | TP rate | Notes |
|---|---:|---:|---:|---|
| EchoVault | 122 | 10 | **100 %** | Real Supabase RLS holes |
| ProofSnap | 134 | 4 | **100 %** | |
| AImentor | 224 | 5 | **100 %** | Real OpenAI keys hidden by `.gitignore` |
| Hackathonnn | 129 | 3 | **100 %** | |
| shopsec | 113 | 5 | **100 %** | |
| Senti | 155 | 8 | **100 %** | |
| open-design | 8,615 | 101 | ~80 % | |
| Gen ai | 63 | 4 | 75 % | Real Firebase admin SDK creds |
| codemore self | 282 | 6 | 17 % | Intentional landing-demo data |
| **Aggregate (excl. self)** | **9,755** | **140** | **~85 %** | |

Full audit: [`accuracy-report-2026-06-12.md`](accuracy-report-2026-06-12.md).

---

## Install in 30 seconds

### CLI — any local project

```bash
npx codemore@latest scan .
```

Returns a [`codemore-report.json`](docs/schema.md) with every finding pinned to `file:line:column`, the rule citation, the fix template, and the verification criteria. Pipe to your agent and watch it close.

CI gate (non-zero exit on any BLOCKER):

```bash
codemore scan . --fail-on BLOCKER
```

Opt-in to external tools (off by default):

```bash
codemore scan . --external-tools ruff,biome
codemore scan . --external-tools all       # ruff · golangci-lint · clippy · biome · bandit · gitleaks · npm-audit · pip-audit
```

### MCP server — Cursor, Claude Code, Codex, Claude Desktop

```jsonc
// ~/.cursor/mcp.json — or ~/.claude/mcp.json, ~/.codex/mcp.json, etc.
{
  "mcpServers": {
    "codemore": {
      "command": "npx",
      "args": ["-y", "codemore@latest", "serve-mcp"]
    }
  }
}
```

Six tools exposed: `scan_project`, `scan_file`, `explain_issue`, `suggest_fix`, `apply_fix`, `validate_fix`.

### VS Code extension

```bash
code --install-extension codemore-0.2.1.vsix
```

Inline diagnostics. Code-action quick-fix calls the agentic loop (planner → generator → validator → retry, max 3 attempts).

### GitHub Action

```yaml
# .github/workflows/codemore.yml
on:
  pull_request:
    branches: [main]
jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: codemore-dev/codemore-action@v1
        with:
          fail-on: BLOCKER
```

PR-comment bot. Only fails the build on findings new since the committed `.codemore-baseline.json`.

### Web Scanner (hosted)

Sign in to **codemore.dev**, paste a public GitHub URL or upload a ZIP — same report, same fingerprint, no install required.

---

## Three surfaces. Byte-identical reports.

Verified on every release by `test/parity.test.ts`. Same project → same `fingerprint`, same issue count, same bytes (modulo timestamps + instance IDs):

```
CLI    : issues=224  BLOCKER=5  fingerprint=sha256:7f95f2c62e0d3ecea6f23…
MCP    : issues=224  BLOCKER=5  fingerprint=sha256:7f95f2c62e0d3ecea6f23…
Daemon : issues=224  BLOCKER=5  fingerprint=sha256:7f95f2c62e0d3ecea6f23…
```

The schema (`codemore-report.json` v1.0.0) is the API. Surfaces are skins.

---

## Catalog at a glance

**58 native rules** across **7 packs** + **8 opt-in external adapters**:

| Pack | Count | Highlights |
|---|---:|---|
| `core-security` | 19 | SQL-injection (concat), path traversal, weak crypto, insecure deserialization, eval, shell injection, TLS-off, hardcoded secret patterns |
| `core-quality` | 22 | Unused vars/imports/exports, cyclomatic complexity, dead conditionals, leftover prints, async-without-await, unreachable code |
| `vibe-frontend` | 5 | XSS (`dangerouslySetInnerHTML`), CORS-with-credentials, missing rate limit, missing cookie flags, file-upload validation |
| `vibe-secrets` | 4 | Public env leaks (`NEXT_PUBLIC_*` / `VITE_*` / `REACT_APP_*`), hardcoded JWTs, MCP config secrets, CI/CD YAML |
| `vibe-auth` | 3 | BOLA, missing session checks, inverted auth |
| `vibe-supabase` | 3 | RLS-off, RLS-permissive (`USING (true)`), anon-key bundled to client |
| `vibe-llm` | 2 | LLM-output → eval/exec/SQL sink, agent-tool-no-confirm |

**External adapters** (off by default; opt in via `--external-tools <name|all>`):
`ruff` · `golangci-lint` · `clippy` · `biome` · `bandit` · `gitleaks` · `npm-audit` · `pip-audit`. Each finding is namespaced `ext:<tool>:<rule-id>` — no collision with native rules. Missing-binary skip is silent (no crash).

Full per-rule docs: [`docs/rules`](docs/rules) (49 markdown pages, one per rule).

---

## Output contract — `codemore-report.json` v1.0.0

```jsonc
{
  "schemaVersion": "1.0.0",
  "tool":    { "name": "codemore", "version": "0.2.1" },
  "project": { "root": ".", "framework": "next.js", "language": "typescript",
               "fingerprint": "sha256:7f95f2c62e0d3ecea6f23…" },
  "summary": {
    "issuesTotal": 42,
    "bySeverity":  { "BLOCKER": 2, "CRITICAL": 5, "MAJOR": 15, "MINOR": 18, "INFO": 2 },
    "byCategory":  { "security": 12, "bug": 7, "…": "…" },
    "filesAnalyzed": 87,
    "linesOfCode":   12450,
    "technicalDebtMinutes": 1840
  },
  "issues": [
    {
      "id":          "vibe-supabase-rls-disabled",
      "ruleVersion": "1.2.0",
      "instanceId":  "01HZ…",
      "severity":    "BLOCKER",
      "confidence":  0.95,
      "category":    "security",
      "title":       "Supabase table has no RLS policy",
      "evidence": {
        "file": "supabase/migrations/001_init.sql",
        "line": 14, "column": 1, "endLine": 14, "endColumn": 60,
        "snippet": "create table profiles (id uuid primary key, …);",
        "matchedPattern": "create-table-without-rls"
      },
      "whyItMatters": "Public Supabase client can read/write all rows. 70 % of Lovable apps leak data through this.",
      "citation":     "https://codemore.dev/rules/vibe-supabase-rls-disabled",
      "suggestedFix": {
        "type":             "code-patch",
        "instructions":     "Add `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;` plus at least one policy scoped to authenticated users.",
        "patchTemplate":    "…",
        "verificationCriteria": [
          "Migration contains ALTER TABLE … ENABLE ROW LEVEL SECURITY",
          "At least one CREATE POLICY exists for the table",
          "Re-scan no longer reports vibe-supabase-rls-disabled for this file"
        ]
      },
      "suppression": {
        "available": true,
        "directive": "// codemore-ignore: vibe-supabase-rls-disabled",
        "scope":     "same-line | next-line | file"
      }
    }
  ],
  "agentInstructions": {
    "preamble":     "You are fixing issues found by CodeMore. Apply patches one issue at a time. After each, request re-scan via validate_fix.",
    "orderingHint": "blockers → criticals → majors",
    "doNotTouch":   ["node_modules/**", "*.lock", ".env*"],
    "stopOn":       "first-validator-failure"
  },
  "meta": {
    "rulesEnabled": 58,
    "packsLoaded":  ["core-security", "core-quality", "vibe-supabase", "…"],
    "scanDurationMs": 4321
  }
}
```

Full reference: [`docs/schema.md`](docs/schema.md). Schema source-of-truth: [`shared/report/schema.json`](shared/report/schema.json). Breaking changes bump `schemaVersion` major and ship a migration guide.

---

## Agentic fix-loop

`apply_fix` runs a four-stage loop, up to 3 retries per finding:

```
detect  ──►  plan  ──►  generate  ──►  validate
                                          │
                                          └──► (fail) → re-plan, retry
                                          └──► (pass) → apply patch · move to next finding
```

Components (`daemon/services/`):

- `agenticFixer.ts` — orchestrator. Reads finding + rule citation + framework context.
- `validatorHarness.ts` — applies the patch in a tempdir copy, re-runs the rule, re-runs file-scoped tests. Returns `pass | fail` + diagnostics.
- LLM provider plug-ins under `daemon/llm/{openai,anthropic,gemini,local}.ts`. Configurable via `codemore.llm.provider` workspace setting (VS Code) or `CODEMORE_LLM_PROVIDER` env (CLI).

Loop terminates on first PASS or after 3 retries — never silently keeps a failing patch.

---

## The walker fixes real leaks `.gitignore` hides

A failure mode of existing scanners: when a developer adds a leaked secret file to `.gitignore` to "hide" it, the scanner stops seeing it — but the file is still on disk, still in tarballs, still in Docker images, still in npm packs. v0.2.1 **always scans secret-shaped filenames** even when `.gitignore` lists them:

```
.env*                          *.pem                 *.key
firebase-adminsdk*.json        *service-account*.json
credentials.json               serviceAccountKey.json
.npmrc                         .pypirc
```

This is exactly how the 2026-06-12 audit found real production OpenAI keys in AImentor, Google API keys in Gen ai, Firebase admin SDK creds — keys that v0.2.0 silently missed.

Opt out with `--respect-gitignore-fully` if you really want the old behaviour.

---

## Quality bar

DeepSource's **< 5 % false-positive rate** is the benchmark. v0.2.1 hits:

- **≥ 75 % precision** on every rule that fires across the audit corpus
- **100 % TP / 100 % FP** on the 116-fixture corpus regression suite
- Every rule ships with at least one TP fixture and one FP fixture under `corpus/rules/<rule-id>/{tp,fp}/`

### Lifecycle gating (promotion enforced in CI)

| Lifecycle | Default | Promotion bar |
|---|---|---|
| `experimental` | off by default OR `confidence ≤ 0.6` | Accepted with one fixture pair |
| `beta` | on by default | ≥ 3 fixture pairs + 14-day FP rate < 15 % via opt-in telemetry |
| `stable` | ships in default pack | 30-day FP rate < 5 % AND Vercel reference apps clean |
| `deprecated` | emits warning, removed next major | — |

Rules below the precision bar are documented honestly in [`docs/limitations.md`](docs/limitations.md) and either gated behind `--enable-experimental` or shipped with reduced confidence so agents weight them lower.

---

## What CodeMore does NOT catch

Honest list — these classes are out of scope by design:

- Weak password policies (lives in config, not source shape)
- Audit logging completeness (content question, not code shape)
- Business logic flaws (domain-specific)
- Race conditions (runtime concurrency, not static)
- Open S3/GCS buckets (live cloud state, not source)
- DAST findings (need a running app)
- MFA presence

Full list at [`docs/limitations.md`](docs/limitations.md). For these, pair CodeMore with OWASP ZAP, Burp Suite, `checkov`, or your IdP's compliance dashboard.

---

## CI security gate template

Copy-paste GitHub Action chaining CodeMore SAST + Ruff + Biome + Bandit + Gitleaks + npm-audit + pip-audit + Checkov:

[`templates/.github/workflows/codemore-security-gate.yml`](templates/.github/workflows/codemore-security-gate.yml).

Docs: [`docs/security-gate.md`](docs/security-gate.md). Typical run time < 2 min on a Next.js + Python project.

---

## Telemetry (opt-in only)

Off by default. Enable per-scan with `--telemetry`. Persistent opt-in stored in `~/.codemore/config.json`.

**What we collect:**

```jsonc
{
  "schemaVersion":   "1.0.0",
  "toolVersion":     "0.2.1",
  "fingerprintHash": "sha256:…",       // hashed project signature; no file content
  "surface":         "cli",            // cli | mcp | vscode | gh-action | web
  "rules": [
    { "id": "vibe-auth-bola", "severity": "BLOCKER", "confidence": 0.95, "context": "fired" }
  ]
}
```

**What we do NOT collect:** file paths, file contents, code snippets, evidence text, sources, bodies. The endpoint at `codemore.dev/api/telemetry` enforces a Zod `strict()` schema and **rejects any payload containing those keys** with HTTP 400.

**Storage hardening:** 64 KB payload cap · 10-min per-`fingerprintHash` rate limit · service-role Supabase writes only · RLS denies all reads to authenticated and anon roles.

**Auto-demote bot (planned):** any stable rule whose downvote rate crosses 10 % over 14 days will get a PR opened demoting it to experimental. The workflow isn't built yet — see [`docs/roadmap.md`](docs/roadmap.md).

---

## Architecture

```
codemore/
├── shared/                       — one brain, shared across surfaces
│   ├── packs/                    — 58 rule modules across 7 packs
│   │   ├── core-security/        — SQLi, secrets, weak crypto, path traversal, eval, deser, shell injection
│   │   ├── core-quality/         — unused, complexity, dead code, leftover prints, async-no-await
│   │   ├── vibe-auth/            — BOLA, missing session, inverted auth
│   │   ├── vibe-frontend/        — XSS, CORS, rate limit, cookie flags, file upload
│   │   ├── vibe-secrets/         — env leaks, JWTs, MCP/CI secrets
│   │   ├── vibe-supabase/        — RLS-off, RLS-permissive, anon-key bundled
│   │   └── vibe-llm/             — output-to-sink, agent-tool-no-confirm
│   ├── rules/                    — registry, lifecycle, suppression, AST helpers (TS + Python)
│   └── report/                   — codemore-report.json v1.0.0 schema + types + writer
├── daemon/
│   ├── cli/                      — CLI entry · walker · ignore resolver · baseline diff
│   ├── mcp/                      — MCP server (6 tools)
│   ├── external/                 — opt-in adapters: ruff · biome · golangci-lint · clippy · bandit · gitleaks · npm-audit · pip-audit
│   ├── services/                 — agentic fixer · validator harness · scan orchestrator
│   └── llm/                      — OpenAI · Anthropic · Gemini · local provider plug-ins
├── src/                          — VS Code extension entry (forks daemon, displays diagnostics)
├── web/                          — Next.js dashboard + docs + /api/telemetry + landing
├── corpus/
│   └── rules/<rule-id>/{tp,fp}/  — 116 TP/FP fixture pairs
├── docs/
│   ├── rules/<rule-id>.md        — 49 per-rule docs pages
│   ├── limitations.md            — honest exclusion list
│   ├── security-gate.md          — CI template walkthrough
│   ├── schema.md                 — codemore-report.json reference
│   └── external-tools.md         — adapter reference
└── templates/                    — copy-paste GitHub Action workflows
```

**One brain (`shared/packs/` + `shared/rules/`), four skins (CLI, MCP, extension, GitHub Action), one report schema.**

---

## Dev setup

```bash
# 1. Clone + install (skip binary downloads in dev — they download on first scan)
git clone https://github.com/codemore-dev/codemore
cd codemore
CODEMORE_SKIP_BINARY_DOWNLOAD=1 npm ci

# 2. Type-check the publishable surface
npx tsc -p tsconfig.publish.json

# 3. Run the CLI against a corpus fixture
node cli.js scan corpus/rules/vibe-no-rate-limit/tp --json --enable-experimental

# 4. Unit tests
npm run test:unit

# 5. Surface-parity test (CLI ↔ MCP ↔ daemon byte-identical)
npx mocha --require ts-node/register test/parity.test.ts

# 6. Web dev server (landing + dashboard + docs)
cd web && npm ci && npm run dev   # http://localhost:3000

# 7. VS Code Extension Development Host
F5 in VS Code, or: npm run watch && code --extensionDevelopmentPath=.
```

---

## Contributing

Two contribution paths:

1. **Rule contributions** (new detectors). Read [`CONTRIBUTING-RULES.md`](CONTRIBUTING-RULES.md). The PR validator gates every submission against:
   - Rule module under `shared/packs/<pack>/<rule-id>.ts`
   - TP fixture under `corpus/rules/<rule-id>/tp/` — MUST trigger the rule
   - FP fixture under `corpus/rules/<rule-id>/fp/` — MUST NOT trigger the rule
   - Docs page under `docs/rules/<rule-id>.md`
   - Registration entry in the pack's `index.ts`

   The bot is the first reviewer. Human review only after the bot passes.

2. **Everything else** (CLI, MCP server, extension, daemon, web, docs, scripts). Read [`CONTRIBUTING.md`](CONTRIBUTING.md).

### Before opening a PR

```bash
npx tsc -p tsconfig.publish.json           # type-check
node scripts/validate-rule-pr.js           # rule-PR bot equivalent (must report "passed")
node scripts/measure-accuracy.js           # corpus accuracy regression (must stay at 100% TP / 100% FP)
npm run scan:samples                       # no new BLOCKERs on Vercel reference apps
```

Per-pack `CODEOWNERS` distributes review load. See [`.github/CODEOWNERS`](.github/CODEOWNERS).

---

## Security disclosures

Read [`SECURITY.md`](SECURITY.md). **Do not open public GitHub issues for security findings** — use GitHub's private vulnerability reporting flow.

---

## Code of conduct

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## What's shipped vs what's next

### Shipped in v0.2.1 (2026-06-12)

- 58 native rules across 7 packs + 8 external adapters
- CLI · MCP server (6 tools) · VS Code extension · GitHub Action
- Agentic fix loop (planner → generator → validator, ≤ 3 retries)
- Schema-stable `codemore-report.json` v1.0.0
- Walker bypass for secret-shaped filenames (catches keys hidden by `.gitignore`)
- Baseline / diff mode (`codemore baseline create` + `--baseline`)
- Lifecycle gating with telemetry-driven auto-demote
- CI security gate template (SAST + SCA + secret + IaC)
- Opt-in content-redacted telemetry endpoint
- Next.js docs site with shiki-highlighted code blocks, sticky TOC, callouts
- 116 TP/FP corpus fixtures
- 4-surface parity test (CLI ↔ MCP ↔ daemon ↔ web `/api/scan`)

### Coming next

- Demo video — open a real Lovable app, scan, hand to Claude Code, watch every BLOCKER close
- 50-Lovable-app benchmark study with full dataset
- MCP marketplace submissions (Cursor, Anthropic showcase, `modelcontextprotocol/servers`)
- JetBrains plugin
- Cross-language taint tracking (research)

Roadmap detail: [`docs/roadmap.md`](docs/roadmap.md).

---

## License

MIT. See [LICENSE](LICENSE).

CodeMore is open-source from line one and will stay that way. The wedge is the report contract, not gatekeeping.

---

<div align="center">

**The static analyzer your AI agent reads.**

[Docs](https://codemore.dev/docs) · [Rules](https://codemore.dev/docs/rules) · [Schema](https://codemore.dev/docs/schema) · [GitHub](https://github.com/codemore-dev/codemore) · [npm](https://www.npmjs.com/package/codemore)

</div>
