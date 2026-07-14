<div align="center">

<img width="125" height="125" alt="image" src="https://github.com/user-attachments/assets/d0e5d020-38ce-44f7-9426-f7fb1b931130" />


# CodeMore

### The static analyzer your AI agent reads.

AI agents ship code fast — and ship bugs fast. CodeMore scans the code, then hands the **agent that wrote it** a machine-readable report with the exact fix and the criteria to verify it. The agent closes its own findings.

[**Website**](https://codemore.tech) · [**Docs**](https://codemore.tech/docs) · [**Rule Catalog**](docs/rules) · [**Report Schema**](docs/schema.md) · [**Changelog**](CHANGELOG.md)

[![npm](https://img.shields.io/npm/v/codemore?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/codemore)
[![License: MIT](https://img.shields.io/badge/license-MIT-4ef2ca.svg?style=flat-square)](LICENSE)
[![Rules](https://img.shields.io/badge/native%20rules-64-success.svg?style=flat-square)](docs/rules)
[![Adapters](https://img.shields.io/badge/external%20adapters-8-blueviolet.svg?style=flat-square)](docs/external-tools.md)
[![Audit](https://img.shields.io/badge/last%20audit-2026--07--07-ff69b4.svg?style=flat-square)](accuracy-report-2026-07-07.md)
[![BLOCKER TP rate](https://img.shields.io/badge/BLOCKER%20TP%20rate-~90%25-4ef2ca.svg?style=flat-square)](accuracy-report-2026-07-07.md)

```bash
npx codemore@latest scan .
```

**64 native rules · 8 external adapters · CLI · MCP server · VS Code extension · GitHub Action — one report, byte-identical on every surface.**

</div>

---

## Table of contents

- [Why CodeMore](#why-codemore)
- [Quick start](#quick-start) — [CLI](#cli) · [MCP server](#mcp-server--cursor-claude-code-codex-claude-desktop) · [VS Code](#vs-code-extension) · [GitHub Action](#github-action) · [Hosted](#web-scanner-hosted)
- [What it catches](#what-it-catches)
- [The report is the product](#the-report-is-the-product)
- [Agentic fix loop](#agentic-fix-loop)
- [Accuracy, measured honestly](#accuracy-measured-honestly)
- [What CodeMore does *not* catch](#what-codemore-does-not-catch)
- [Architecture](#architecture)
- [Development](#development) · [Contributing](#contributing) · [License](#license)

---

## Why CodeMore

AI-assisted coding ships vulnerabilities at a measured, growing rate:

| Finding | Source |
|---|---|
| **45%** of AI-generated code carries an OWASP Top-10 vulnerability | Veracode 2025/26 |
| **98%** of 1,072 scanned vibe-coded sites had ≥ 1 security flaw | Symbiotic |
| **70%** of audited Lovable apps shipped with Supabase RLS disabled | DEV |
| **2×** baseline secret-leak rate on AI-tool-assisted commits | GitGuardian SOSS 2026 |
| **35 CVEs/month** attributed to AI-generated code (was 6/month in January) | March 2026 |

Existing scanners (SonarQube, DeepSource, Snyk) target **human reviewers sitting at dashboards**. But this code wasn't written by a human — and the LLM that wrote it is fully capable of fixing its own bug, *if the report is shaped for a machine reader*.

That's the wedge. CodeMore is not another SAST dashboard. **It's the report contract between a scanner and a coding agent**: every finding carries a `suggestedFix` with a patch template and explicit `verificationCriteria` — not just "here's a problem," but "here's exactly how to know you fixed it."

> **The agent that wrote the bug can also write the fix — if it can read the report.**

---

## Quick start

### CLI

```bash
npx codemore@latest scan .
```

Prints a summary to the terminal. Add `--json` for the full [report](docs/schema.md) on stdout, or `--out codemore-report.json` to write it to disk: every finding pinned to `file:line:column` with rule citation, fix template, and verification criteria. Pipe it to your agent and watch findings close.

```bash
npm install -g codemore                        # once — or prefix each command below with `npx codemore@latest`
codemore scan . --fail-on BLOCKER              # CI gate: non-zero exit on any BLOCKER
codemore scan . --external-tools ruff,biome    # opt in to external tools
codemore scan . --external-tools all           # ruff · golangci-lint · clippy · biome · bandit · gitleaks · npm-audit · pip-audit
codemore scan . --format sarif --out codemore.sarif   # GitHub code scanning (upload-sarif)
codemore fix . --rule <id> --write             # agentic fix loop from the CLI (needs an LLM API key)
codemore baseline create                       # adopt on an existing repo without drowning in legacy findings
```

### MCP server — Cursor, Claude Code, Codex, Claude Desktop

```bash
npx codemore mcp                              # print config snippet + every client's config path
npx codemore mcp install --client cursor      # merge into existing config (backs up first, --dry-run supported)
```

<details>
<summary>Manual config snippet</summary>

```jsonc
{
  "mcpServers": {
    "codemore": {
      "command": "npx",
      "args": ["-y", "codemore@latest", "serve-mcp"]
    }
  }
}
```

</details>

Six tools exposed: `scan_project` · `scan_file` · `explain_issue` · `suggest_fix` · `apply_fix` · `validate_fix`.

### VS Code extension

Install **CodeMore** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=codemore.codemore) (Extensions → search "CodeMore" → Install), or build the VSIX yourself:

```bash
npm run vsce:package                             # builds codemore-<version>.vsix
code --install-extension codemore-<version>.vsix
```

Inline diagnostics; code-action quick-fix invokes the agentic loop (plan → generate → validate → retry, max 3 attempts).

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
      - uses: abhinavteja123/codemore@v1
        with:
          fail-on: BLOCKER
```

PR-comment bot; only fails the build on findings **new since** the committed `.codemore-baseline.json`. A full copy-paste security gate chaining CodeMore + Ruff + Biome + Bandit + Gitleaks + npm-audit + pip-audit + Checkov lives at [`templates/.github/workflows/codemore-security-gate.yml`](templates/.github/workflows/codemore-security-gate.yml) ([walkthrough](docs/security-gate.md)).

### Web Scanner (hosted)

Sign in at [**codemore.tech**](https://codemore.tech), paste a public GitHub URL or upload a ZIP — same report, same fingerprint, zero install.

---

## What it catches

**64 native rules** across **6 packs**, every rule mapped to a *cited real-world incident class* — not a hypothetical:

| Pack | Rules | Highlights |
|---|---:|---|
| `core-security` | 22 | SQL injection (concat), path traversal, weak crypto, insecure deserialization, `eval`, shell injection, TLS-off, hardcoded secret patterns, hardcoded passwords (B105-class), SSRF, secret-in-log, LLM-output → eval/exec/SQL sinks, prompt-injection sinks, DB write-without-WHERE, hallucinated imports |
| `core-quality` | 21 | Unused vars/imports/exports, cyclomatic complexity, dead conditionals, leftover console/prints, async-without-await, unreachable code, loose equality, `as any`, non-null-assertion abuse |
| `vibe-frontend` | 9 | XSS (`dangerouslySetInnerHTML`), CORS-with-credentials, missing rate limit, missing cookie flags, file-upload validation, missing input validation — CORS, cookie flags and input validation each in TS + Python (Flask/FastAPI) form |
| `vibe-secrets` | 4 | Public env leaks (`NEXT_PUBLIC_*` / `VITE_*` / `REACT_APP_*`), hardcoded JWTs, MCP config secrets, CI/CD YAML secrets |
| `vibe-auth` | 5 | BOLA (TS + Python), missing session/auth checks (TS + Python), inverted auth |
| `vibe-supabase` | 3 | RLS-off, RLS-permissive (`USING (true)`), anon-key bundled to client |

**8 external adapters** (off by default, opt in via `--external-tools`): `ruff` · `golangci-lint` · `clippy` · `biome` · `bandit` · `gitleaks` · `npm-audit` · `pip-audit`. Findings are namespaced `ext:<tool>:<rule-id>` — no collision with native rules; a missing binary skips silently instead of crashing.

**The walker catches what `.gitignore` hides.** When a developer "hides" a leaked secret file by gitignoring it, most scanners stop seeing it — but it's still on disk, in tarballs, in Docker images. CodeMore always scans secret-shaped filenames (`.env*`, `*.pem`, `*.key`, `firebase-adminsdk*.json`, `credentials.json`, `.npmrc`, `.pypirc`, …) even when gitignored. This is exactly how the audits found real production OpenAI keys, Google API keys, and Firebase admin SDK creds that other tools silently missed. Opt out with `--respect-gitignore-fully`.

Per-rule documentation: [`docs/rules`](docs/rules) — 64 pages, one per rule.

---

## The report is the product

Every surface emits the same schema-stable [`codemore-report.json`](docs/schema.md) — verified **byte-identical** (modulo timestamps and instance IDs) on every release by [`test/parity.test.ts`](test/parity.test.ts):

```
CLI    : issues=224  BLOCKER=5  fingerprint=sha256:7f95f2c62e0d3ecea6f23…
MCP    : issues=224  BLOCKER=5  fingerprint=sha256:7f95f2c62e0d3ecea6f23…
Daemon : issues=224  BLOCKER=5  fingerprint=sha256:7f95f2c62e0d3ecea6f23…
```

**One brain, four skins.** The schema is the API; surfaces are interchangeable.

<details>
<summary><b>Full report example</b> — <code>codemore-report.json</code> v1.0.0</summary>

```jsonc
{
  "schemaVersion": "1.0.0",
  "tool":    { "name": "codemore", "version": "0.3.0" },
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
      "citation":     "https://codemore.tech/rules/vibe-supabase-rls-disabled",
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
    "rulesEnabled": 64,
    "packsLoaded":  ["core-security", "core-quality", "vibe-supabase", "…"],
    "scanDurationMs": 4321
  }
}
```

</details>

Schema source-of-truth: [`shared/report/schema.json`](shared/report/schema.json). Breaking changes bump `schemaVersion` major and ship a migration guide.

---

## Agentic fix loop

`apply_fix` runs a four-stage loop, up to 3 retries per finding — it terminates on first PASS and **never silently keeps a failing patch**:

```
detect  ──►  plan  ──►  generate  ──►  validate
                                          │
                                          ├──► (fail) → re-plan, retry (≤ 3)
                                          └──► (pass) → apply patch · next finding
```

- [`agenticFixer.ts`](daemon/services/agenticFixer.ts) — orchestrator; reads finding + rule citation + framework context
- [`validatorHarness.ts`](daemon/services/validatorHarness.ts) — applies the patch in a tempdir copy, re-runs the rule, re-runs file-scoped tests, returns `pass | fail` + diagnostics
- LLM provider plug-ins: OpenAI · Anthropic · Gemini · local, configurable via workspace setting (VS Code) or `CODEMORE_LLM_PROVIDER` env (CLI)

---

## Accuracy, measured honestly

Synthetic benchmarks lie; real codebases don't. Every release is audited against real projects, and the numbers are published — including the bad ones.

**2026-07-07 audit** ([full report](accuracy-report-2026-07-07.md)) — 7 codebases (Python app, 1.35M-LOC TS monorepo, polyglot Rust, synthetic ground-truth apps, self-scan): **100% of planted vulnerabilities detected**, a real OpenAI key caught in a production `.env`, **~90% BLOCKER true-positive rate**, self-scan noise reduced 85% after fixing four false-positive classes.

**2026-06-12 audit** ([full report](accuracy-report-2026-06-12.md)) — 10 real codebases, aggregate **~85% BLOCKER TP rate**, above DeepSource's ≥ 75% production bar:

<details>
<summary>Per-project results</summary>

| Project | Findings | BLOCKERs | TP rate | Notes |
|---|---:|---:|---:|---|
| EchoVault | 122 | 10 | **100%** | Real Supabase RLS holes |
| ProofSnap | 134 | 4 | **100%** | |
| AImentor | 224 | 5 | **100%** | Real OpenAI keys hidden by `.gitignore` |
| Hackathonnn | 129 | 3 | **100%** | |
| shopsec | 113 | 5 | **100%** | |
| Senti | 155 | 8 | **100%** | |
| open-design | 8,615 | 101 | ~80% | |
| Gen ai | 63 | 4 | 75% | Real Firebase admin SDK creds |
| codemore self | 282 | 6 | 17% | Intentional landing-demo data |
| **Aggregate (excl. self)** | **9,755** | **140** | **~85%** | |

</details>

### Quality gates, enforced in CI

- **100% TP / 100% FP** on the 128-fixture corpus regression suite — every rule ships with at least one true-positive and one false-positive fixture under `corpus/rules/<rule-id>/{tp,fp}/`
- Lifecycle gating: rules are `experimental` → `beta` → `stable`, promotion requires fixture pairs plus real-world FP-rate evidence via opt-in telemetry; rules below the precision bar are gated behind `--enable-experimental` or ship with reduced confidence so agents weight them lower

| Lifecycle | Default | Promotion bar |
|---|---|---|
| `experimental` | off by default | one fixture pair |
| `beta` | on by default | ≥ 3 fixture pairs + 14-day FP rate < 15% |
| `stable` | ships in default pack | 30-day FP rate < 5% + reference apps clean |
| `deprecated` | warns, removed next major | — |

---

## What CodeMore does *not* catch

Out of scope **by design** — static analysis can't judge these, and an agent can't auto-fix them from a source diff. The rule is *"agent-actionable or it's not a rule"*:

Weak password policies · audit-log completeness · business-logic flaws · race conditions · open S3/GCS buckets · DAST findings · MFA presence.

Full list with reasoning: [`docs/limitations.md`](docs/limitations.md). For these, pair CodeMore with OWASP ZAP, Burp Suite, `checkov`, or your IdP's compliance dashboard.

---

## Telemetry — opt-in only

Off by default. Enable per-scan with `--telemetry`. Collected: tool version, hashed project fingerprint, surface, rule-fire events. **Never collected:** file paths, contents, snippets, evidence text — the endpoint enforces a Zod `strict()` schema and rejects any payload containing those keys with HTTP 400. 64 KB payload cap, per-fingerprint rate limiting, RLS denies all reads.

---

## Architecture

```
codemore/
├── shared/                       ← one brain, shared across all surfaces
│   ├── packs/                    ← 64 rule modules across 6 packs
│   ├── rules/                    ← registry, lifecycle gating, suppression, AST helpers (TS + Python)
│   └── report/                   ← codemore-report.json v1.0.0 schema + types + writer
├── daemon/
│   ├── cli/                      ← CLI entry · walker · ignore resolver · baseline diff
│   ├── mcp/                      ← MCP server (6 tools)
│   ├── external/                 ← 8 opt-in adapters, fail-loud parsers
│   ├── services/                 ← agentic fixer · validator harness · scan orchestrator
│   └── llm/                      ← OpenAI · Anthropic · Gemini · local provider plug-ins
├── src/                          ← VS Code extension (forks daemon, renders diagnostics)
├── web/                          ← Next.js: landing · dashboard · docs · /api/telemetry
├── corpus/rules/<id>/{tp,fp}/    ← 64 TP/FP fixture pairs, 1:1 with the rule catalog
├── docs/                         ← schema · limitations · security-gate · 64 per-rule pages
└── templates/                    ← copy-paste GitHub Action workflows
```

**One brain (`shared/`), four skins (CLI, MCP, extension, Action), one report schema** — kept honest by the parity test, not by a slogan.

---

## Development

```bash
git clone https://github.com/abhinavteja123/codemore
cd codemore
npm ci                                         # postinstall skips binary downloads in dev automatically

npx tsc -p tsconfig.publish.json               # type-check the publishable surface
npm run test:unit                              # unit tests (mocha + ts-node)
npx mocha --require ts-node/register test/parity.test.ts   # surface-parity proof

node cli.js scan corpus/rules/vibe-no-rate-limit/tp --json --enable-experimental

cd web && npm ci && npm run dev                # landing + dashboard + docs → localhost:3000
```

VS Code extension: `F5` in VS Code, or `npm run watch` + `code --extensionDevelopmentPath=.`

---

## Contributing

Two paths:

1. **New rules** — read [`CONTRIBUTING-RULES.md`](CONTRIBUTING-RULES.md). The PR bot gates every submission: rule module + TP fixture (must fire) + FP fixture (must not fire) + docs page + pack registration. The bot is the first reviewer; humans review after it passes.
2. **Everything else** (CLI, MCP, extension, daemon, web, docs) — read [`CONTRIBUTING.md`](CONTRIBUTING.md).

Before opening a PR:

```bash
npx tsc -p tsconfig.publish.json           # type-check
node scripts/validate-rule-pr.js           # rule-PR bot equivalent (must report "passed")
node scripts/measure-accuracy.js           # corpus regression (must stay 100% TP / 100% FP)
npm run test:unit                          # full unit suite
```

Found a false positive? [Open a rule-FP report](.github/ISSUE_TEMPLATE) — FP reports directly feed the beta→stable promotion pipeline.

**Security findings:** do **not** open a public issue — use GitHub's private vulnerability reporting flow ([`SECURITY.md`](SECURITY.md)).

---

## Roadmap

- MCP registry listing (VS Code Marketplace: live)
- Demo video: open a real vibe-coded app, scan, hand the report to Claude Code, watch every BLOCKER close
- 50-app benchmark study with published dataset
- Telemetry-driven rule auto-demotion — live: nightly [`auto-demote-rules.yml`](.github/workflows/auto-demote-rules.yml) opens a review issue when a rule's FP rate crosses 10%
- JetBrains plugin · cross-language taint tracking (research)

Details: [`docs/roadmap.md`](docs/roadmap.md).

---

## License

MIT — see [LICENSE](LICENSE). CodeMore is open source from line one and stays that way. The wedge is the report contract, not gatekeeping.

---

<div align="center">

**The static analyzer your AI agent reads.**

[Website](https://codemore.tech) · [Docs](https://codemore.tech/docs) · [Rules](https://codemore.tech/docs/rules) · [Schema](https://codemore.tech/docs/schema) · [npm](https://www.npmjs.com/package/codemore) · [Code of Conduct](CODE_OF_CONDUCT.md)

</div>
