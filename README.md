# CodeMore

> **AI-powered code intelligence for VS Code — fast, private, and developer-centric.**

CodeMore is a VS Code extension that combines automated static analysis, security scanning, and on-demand AI-powered fixes into a single zero-friction workflow. Most analysis happens entirely on your local machine, ensuring your code stays private and feedback stays instant.

---

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Supported Languages](#supported-languages)
- [Getting Started](#getting-started)
- [Commands](#commands)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Building from Source](#building-from-source)
- [Privacy & Data Usage](#privacy--data-usage)
- [Contributing](#contributing)

---

## Features

| Feature | Description |
|---|---|
| **Real-time Analysis** | Detects bugs, code smells, security vulnerabilities, and performance anti-patterns automatically on save. |
| **Built-in Static Analyzer** | Custom TypeScript AST engine evaluates cyclomatic complexity, nesting depth, dead code, and more — no AI cost. |
| **Industry-standard Linters** | Pre-bundled binaries for Biome, Ruff, Semgrep, TFLint, and Checkov. Zero setup required. |
| **On-demand AI Fixes** | Request a context-aware fix for any specific issue. AI is only called when *you* ask for it. |
| **Code Quality Dashboard** | A dedicated activity bar panel showing health metrics, issue severity breakdown, and a diff preview for every suggested fix. |
| **Multi-provider AI Support** | Works with OpenAI, Anthropic Claude, Google Gemini, or a self-hosted local LLM. |
| **Daemon Architecture** | Analysis runs in a separate process so the editor stays fully responsive during heavy scans. |

---

## How It Works

CodeMore uses a three-layer pipeline to maximize speed while keeping AI costs optional and transparent.

### Layer 1 — External Tools (always local)

On every file save, pre-bundled binaries are run in the background daemon process:

| Tool | Purpose | Languages |
|---|---|---|
| **Biome** | Linting & formatting | JavaScript, TypeScript |
| **Ruff** | Fast linting | Python |
| **Semgrep** | Security vulnerability scanning | 30+ languages |
| **TFLint** | Infrastructure-as-Code analysis | Terraform |
| **Checkov** | IaC security & compliance | Terraform, CloudFormation, K8s |

### Layer 2 — Built-in Static Analysis (always local)

CodeMore's own TypeScript-AST engine runs in parallel and detects:

- **Complexity** — cyclomatic & cognitive complexity, deeply-nested blocks
- **Dead code** — unused variables, unreachable branches, redundant imports
- **Security** — hardcoded secrets, unsafe `eval`, `innerHTML` injection risks
- **Performance** — inefficient loops, unnecessary re-renders, memory leak patterns
- **TypeScript best practices** — missing types, improper `any`, dangerous casts
- **Style** — overly long functions, excessive parameters, line length violations

### Layer 3 — AI Analysis (opt-in, on demand)

AI is **never** invoked automatically. The workflow is:

1. Open the **Code Quality Dashboard** and select any detected issue.
2. Click **Generate AI Fix**.
3. CodeMore gathers the relevant code snippet, surrounding context, imports, and existing diagnostics.
4. This focused context is sent to your configured AI provider over encrypted HTTPS.
5. The AI response is shown as a **diff preview** — review it before applying a single line.

> Your source code reaches an external server only during this explicit step.

---

## Supported Languages

| Language | External Tool | Built-in Analyzer |
|---|---|---|
| TypeScript / JavaScript | Biome, Semgrep | Full AST analysis |
| Python | Ruff, Semgrep | Partial |
| Terraform / HCL | TFLint, Checkov | — |
| CloudFormation / K8s YAML | Checkov | — |
| Go, Java, C#, Ruby, and more | Semgrep | — |

---

## Getting Started

### Installation from Marketplace

1. Open VS Code and go to the **Extensions** view (`Ctrl+Shift+X`).
2. Search for **CodeMore** and click **Install**.
3. Reload the window if prompted — analysis starts automatically when you open a workspace.

### Optional: Enable AI Fixes

1. Open **Settings** (`Ctrl+,`) and search for `codemore`.
2. Set `codemore.aiProvider` to your preferred provider (`openai`, `anthropic`, `gemini`, or `local`).
3. Enter your API key in `codemore.apiKey`.

> API keys are stored in VS Code's encrypted **Secret Storage** and never leave your machine except when making an AI request.

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