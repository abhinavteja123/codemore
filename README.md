# CodeMore

> **The static analyzer your AI agent reads.**
> Detect production-blocking bugs in vibe-coded apps and hand a structured, fix-ready report straight to Cursor, Claude Code, Codex, or Copilot.

CodeMore is the protocol layer between code-quality scanners and AI coding agents. It catches the systemic issues that show up in AI-generated apps — disabled Supabase RLS, public-prefixed secrets, hardcoded JWTs, permissive CORS, XSS sinks — and returns a schema-stable report (`codemore-report.json` v1.0.0) that any LLM can read, fix, and verify against.

> **Why this exists.** Veracode 2025/26: 45 % of AI-generated code carries OWASP Top-10 vulnerabilities. Symbiotic: 98 % of 1,072 scanned vibe-coded apps had ≥ 1 security flaw. GitGuardian SOSS 2026: 29 M secrets leaked on public GitHub in 2025, with AI-tool commits leaking at 2× the human baseline. Existing scanners target human reviewers via dashboards; CodeMore targets the LLM that wrote the code in the first place.

---

## Install in 30 seconds

Pick the surface that matches how you ship code.

### CLI — for any local project

```bash
npx codemore scan .
```

Or install globally:

```bash
npm install -g codemore
codemore scan ./my-vibe-app
```

### GitHub Action — for any PR on GitHub

```yaml
# .github/workflows/codemore.yml
on:
  pull_request:
jobs:
  scan:
    runs-on: ubuntu-latest
    permissions: { contents: read, pull-requests: write }
    steps:
      - uses: actions/checkout@v4
      - uses: K0802s/codemore@v1
```

Posts a fix-ready PR comment that AI coding agents can act on. Full reference: [`docs/github-action.md`](docs/github-action.md).

### MCP server — for Cursor, Claude Code, Codex

Add to your agent's MCP config (e.g. `~/.cursor/mcp.json` or `~/.config/Claude/claude_desktop_config.json`):

```jsonc
{
  "mcpServers": {
    "codemore": { "command": "npx", "args": ["codemore", "serve-mcp"] }
  }
}
```

The agent gains 6 tools: `scan_project`, `scan_file`, `explain_issue`, `suggest_fix`, **`apply_fix`**, **`validate_fix`**. The last two close the loop:

- `apply_fix(instanceId)` returns a deterministic prompt — rule citation, evidence, line-numbered file content, suggested-fix instructions, verification criteria. The agent uses it to plan a patch.
- `validate_fix(instanceId, newContent)` re-runs the same rule on the proposed new content in memory and returns a line-anchored pass/fail verdict. The agent never has to guess whether its patch worked.

The contract is a 3-attempt loop: `apply_fix → generate → validate_fix`, feeding the validator's diagnostic back into the next attempt. After three failed attempts, the agent surfaces the issue. Orchestration is documented in `daemon/services/agenticFixer.ts` and tested end-to-end at `test/agentic-fixer.test.ts`.

### VS Code extension — for IDE integration

1. Open VS Code → Extensions → search **CodeMore** → Install.
2. Reload when prompted — analysis starts automatically on save.

---

## What it catches

7 of 11 planned vibe rules ship today across 3 packs. Each rule includes a true-positive fixture, a false-positive fixture, a docs page, and is verified by the rule-PR validator bot before merge.

| Pack | Rule | Catches |
|---|---|---|
| **vibe-supabase** | `vibe-supabase-rls-disabled` | `CREATE TABLE` without `ENABLE ROW LEVEL SECURITY`. The CVE-2025-48757 / Lovable class. |
|  | `vibe-supabase-rls-permissive` | Policies with `USING (true)` or `WITH CHECK (true)` — RLS enabled but functionally off. |
| **vibe-secrets** | `vibe-public-env-leak` | `NEXT_PUBLIC_*` / `VITE_*` / `EXPO_PUBLIC_*` carrying `SERVICE_ROLE`, `SECRET`, `PRIVATE_KEY`, etc. The Moltbook class. |
|  | `vibe-hardcoded-jwt` | Three-segment JWT-shape string literals committed to source. |
|  | `vibe-mcp-config-secret` | Real credentials pasted into `mcp.json` / `claude_desktop_config.json` / `.cursor/mcp.json` env blocks. |
| **vibe-frontend** | `vibe-cors-wildcard-credentials` | `Access-Control-Allow-Origin: *` combined with credentials. Browser drops it; auth-cookied calls silently fail. |
|  | `vibe-xss-dangerously-set` | React's `dangerouslySetInnerHTML` with a dynamic source. The 86%-XSS-failure class. |

Plus 4 harder rules planned (data-flow / cross-file): `vibe-supabase-anon-key-bundled`, `vibe-no-rate-limit`, `vibe-auth-inverted`, `vibe-prompt-injection-sink`. See [`CONTRIBUTING-RULES.md`](CONTRIBUTING-RULES.md) to add one.

Every rule supports inline and file-level suppression (`// codemore-ignore: rule-id`, `-- codemore-ignore: rule-id`, `# codemore-ignore: rule-id`, `/* codemore-ignore-file: rule-id */`) and can be turned off per-project in `.codemorerc.json`.

---

## The report schema

The whole point of CodeMore is the contract. The schema is locked at v1.0.0 ([`shared/report/schema.json`](shared/report/schema.json)).

Every issue carries:

```jsonc
{
  "id": "vibe-supabase-rls-disabled",
  "instanceId": "uuid",                     // for validate_fix calls
  "severity": "BLOCKER",
  "confidence": 0.6,
  "evidence": { "file": "...", "line": 14, "snippet": "..." },
  "whyItMatters": "...",                    // for the agent's reasoning
  "citation": "https://codemore.dev/rules/vibe-supabase-rls-disabled",
  "suggestedFix": {
    "type": "code-patch",
    "instructions": "...",
    "verificationCriteria": ["..."]         // what makes the fix complete
  }
}
```

The report also includes `agentInstructions` (preamble, ordering hint, do-not-touch globs, stop-on policy) so an agent reads the file and knows how to behave.

---

## How it works (technical layers)

CodeMore is built as three layers an agent can compose:

### Layer 1 — Local-first scanning (no network)

- **Bundled linters** (Biome, Ruff, Semgrep, TFLint, Checkov) for fast, broad coverage.
- **Built-in rule registry** — the vibe pack above; pure-function detectors with lifecycle gating (experimental → beta → stable) and confidence ceilings.
- **TypeScript-AST engine** for the deeper checks (complexity, dead code, framework-specific patterns).

Source code never leaves your machine during a scan.

### Layer 2 — Structured report (v1.0.0 schema)

The output of every scan, no matter which surface ran it. Both human-readable (Markdown PR comments via the GitHub Action) and machine-readable (JSON for agents).

### Layer 3 — Agentic loop (opt-in, you control the agent)

Via the MCP server, your agent of choice (Cursor, Claude Code, Codex, …) drives the loop:

```
scan_project ──► pick issue ──► apply_fix ──► (agent generates patch) ──► validate_fix
       ▲                            ▲                                          │
       │                            └────────── (FAIL → retry, max 3) ─────────┤
       └──────────────────────── (PASS → next issue) ───────────────────────────┘
```

`apply_fix(instanceId)` returns the deterministic prompt (rule citation + evidence + line-numbered file content + verification criteria) the agent uses to plan. `validate_fix(instanceId, newContent)` re-runs the same rule on the proposed new file content in memory and returns a line-anchored pass/fail. The agent never has to guess whether its patch worked, and the loop is capped at 3 attempts per issue — same convergence curve as Snyk Agent Fix's published numbers.

---



## Commands

Access all commands via the Command Palette (`Ctrl+Shift+P`) under the `CodeMore` category.

| Command | Description |
|---|---|
| `CodeMore: Open Code Quality Dashboard` | Opens the activity bar dashboard panel. |
| `CodeMore: Analyze Workspace` | Runs a full analysis pass over all files in the workspace. |
| `CodeMore: Analyze Current File` | Analyzes only the currently active editor file. |
| `CodeMore: Apply Suggestion` | Applies a reviewed AI-generated fix to the source file. |
| `CodeMore: Restart Context Daemon` | Stops and restarts the background analysis daemon. |
| `CodeMore: Show Daemon Logs` | Opens the output channel with daemon logs for debugging. |

---

## Keyboard Shortcuts

| Action | Windows / Linux | macOS |
|---|---|---|
| Open Code Quality Dashboard | `Ctrl+Shift+Q` | `Cmd+Shift+Q` |
| Analyze Current File | `Ctrl+Shift+A` | `Cmd+Shift+A` |

Shortcuts can be rebound in **File → Preferences → Keyboard Shortcuts**.

---

## Configuration

All settings are available under **Settings → Extensions → CodeMore**.

| Setting | Type | Default | Description |
|---|---|---|---|
| `codemore.aiProvider` | `string` | `"openai"` | AI provider: `openai`, `anthropic`, `gemini`, or `local`. |
| `codemore.apiKey` | `string` | `""` | API key for the selected AI provider. |
| `codemore.autoAnalyze` | `boolean` | `true` | Automatically analyze files on save. |
| `codemore.analysisDelay` | `number` | `2000` | Milliseconds to wait after a file change before triggering analysis. |
| `codemore.analysisTools` | `string` | `"both"` | Which tools to use: `both`, `external` (Biome/Ruff/Semgrep), or `internal` (AST engine only). |
| `codemore.excludePatterns` | `array` | `["**/node_modules/**", ...]` | Glob patterns for paths to skip during analysis. |
| `codemore.maxFileSizeKB` | `number` | `500` | Files larger than this (in KB) are skipped. |
| `codemore.enableTelemetry` | `boolean` | `false` | Send anonymous usage statistics. Disabled by default. |

---

## Architecture

CodeMore uses a **daemon architecture** to keep the editor fast and responsive.

```
┌──────────────────────────────────────────────────────────┐
│                    VS Code Extension Host                │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Commands & │  │   Webview    │  │  Status Bar &  │  │
│  │   Events    │  │  Dashboard   │  │  Diagnostics   │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         └────────────────┼───────────────────┘           │
│                    JSON-RPC (stdio)                       │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│                   Context Daemon (Node.js)               │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  File Watcher│  │ Analysis     │  │  Context Map   │  │
│  │  (chokidar)  │  │ Queue        │  │  (symbol graph)│  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                 │                   │           │
│  ┌──────▼─────────────────▼───────────────────▼───────┐  │
│  │               Analysis Pipeline                     │  │
│  │  External Tools → Static Analyzer → AI Service     │  │
│  └──────────────────────────────────────────────────  │  │
└──────────────────────────────────────────────────────────┘
```

**Extension Host** — Manages the VS Code UI, registers commands, handles file system events, and communicates with the dashboard webview.

**Context Daemon** — A separate Node.js process spawned at startup. It owns the analysis pipeline, file watcher, analysis queue, and all AI communication. Isolating heavy work here prevents the editor from freezing.

**RPC Layer** — The extension host and daemon communicate over a JSON-RPC 2.0 protocol via stdio, keeping the interface clean and language-agnostic.

---

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [npm](https://www.npmjs.com/) v9 or later
- VS Code v1.85 or later

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/K0802s/codemore.git
cd codemore

# 2. Install dependencies
npm install

# 3. Download pre-built analysis binaries (Biome, Ruff, Semgrep, etc.)
npm run download-binaries

# 4. Compile all targets (extension, daemon, webview)
npm run compile

# 5. Launch the Extension Development Host
# Press F5 in VS Code, or use the "Run Extension" launch configuration
```

### Available Scripts

| Script | Description |
|---|---|
| `npm run compile` | One-shot build of extension + daemon + webview. |
| `npm run watch` | Incremental watch build of all three targets in parallel. |
| `npm run lint` | Run ESLint across `src/`, `daemon/`, and `webview/`. |
| `npm run lint:fix` | Auto-fix lint issues. |
| `npm run download-binaries` | Download binaries for the current platform only. |
| `npm run download-binaries:all` | Download binaries for all platforms (needed before `vsce package`). |
| `npm run vsce:package` | Package the extension as a `.vsix` file. |

---

## Privacy & Data Usage

| Data Type | Where it goes | When |
|---|---|---|
| Source code | **Local machine only** | During every analysis |
| Analysis results | **Local machine only** (memory / workspace storage) | Always |
| AI prompts (code snippets + context) | **Your chosen AI provider**, over HTTPS | Only on explicit "Generate AI Fix" |
| API keys | **VS Code Secret Storage** (encrypted, local) | Never transmitted |
| Telemetry | **Disabled by default** | Only if `codemore.enableTelemetry` is `true` |

We do **not** operate any backend servers that receive your source code. The only external communication is the optional AI request you initiate yourself.

---

## Contributing

Contributions are welcome! To get started:

1. Fork the repository and create a feature branch.
2. Follow the [Building from Source](#building-from-source) steps.
3. Make your changes and run `npm run lint` before opening a pull request.
4. Add tests in the `test/` directory for any new behaviour where feasible.
5. Open a pull request against `main` with a clear description of the change.

Please open an issue first for large feature additions so we can discuss the approach.

---

## License

MIT — see [LICENSE](LICENSE) for details.