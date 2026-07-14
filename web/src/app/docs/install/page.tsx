import { Terminal, Boxes, Code2, GitPullRequest, Globe } from "lucide-react";

import CodeBlock from "@/components/docs/CodeBlock";
import Callout from "@/components/docs/Callout";
import NextStep from "@/components/docs/NextStep";
import SurfaceTabs from "@/components/docs/SurfaceTabs";

export const metadata = {
  title: "Install — CodeMore",
  description:
    "Install CodeMore as a CLI, MCP server, VS Code extension, GitHub Action, or use the hosted Web Scanner. Same brain, same report, byte-identical fingerprint.",
};

const CURSOR_MCP = `{
  "mcpServers": {
    "codemore": {
      "command": "npx",
      "args": ["-y", "codemore@latest", "serve-mcp"]
    }
  }
}`;

const CLAUDE_MCP = `{
  "mcpServers": {
    "codemore": {
      "command": "npx",
      "args": ["-y", "codemore@latest", "serve-mcp"]
    }
  }
}`;

const GH_ACTION = `# .github/workflows/codemore.yml
name: codemore
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
          fail-on: BLOCKER`;

export default function InstallPage() {
  return (
    <>
      <h1>Install in 30 seconds</h1>
      <p className="lead text-lg">
        Pick the surface that matches how you ship code. Every surface emits the
        same <code>codemore-report.json</code> v1.0.0 — the agent never has to
        learn a second shape.
      </p>

      <CodeBlock lang="shell" label="quick install">{`npx codemore@latest scan .`}</CodeBlock>

      <SurfaceTabs
        defaultId="cli"
        tabs={[
          {
            id: "cli",
            label: "CLI",
            icon: <Terminal className="w-3.5 h-3.5" />,
            panel: (
              <>
                <h2 id="cli">CLI — for one-off scans and CI scripts</h2>
                <p>
                  No global install required. Runs against any local checkout
                  and writes a <code>codemore-report.json</code> beside the
                  source.
                </p>

                <h3 id="cli-quickstart">Quick start</h3>
                <CodeBlock lang="shell">{`# one-off scan
npx codemore@latest scan .

# install globally
npm install -g codemore
codemore scan ./my-vibe-app

# CI gate — non-zero exit on any BLOCKER
codemore scan . --fail-on BLOCKER`}</CodeBlock>

                <h3 id="cli-flags">Common flags</h3>
                <CodeBlock lang="shell">{`# enable the experimental rule lifecycle tier
codemore scan . --enable-experimental

# opt-in to telemetry (rule id + severity + confidence; no paths, no content)
codemore scan . --telemetry

# layer on external adapters: ruff, biome, golangci-lint, clippy, bandit,
# gitleaks, npm-audit, pip-audit  (--external-tools all to enable everything)
codemore scan . --external-tools ruff,biome

# SARIF for GitHub code scanning
codemore scan . --format sarif --out codemore.sarif

# agentic fix loop from the CLI (needs ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY)
codemore fix . --rule <id> --write`}</CodeBlock>

                <Callout type="note" title="walker behaviour">
                  CodeMore intentionally scans secret-shaped filenames even
                  when <code>.gitignore</code> lists them — <code>.env*</code>,
                  <code>*.pem</code>, <code>firebase-adminsdk*.json</code>,
                  <code>credentials.json</code>. This is how the 2026-06-12
                  audit found real production OpenAI + Firebase keys.
                </Callout>

                <NextStep
                  href="/docs/schema"
                  title="Read the report schema"
                  description="codemore-report.json v1.0.0 — every field annotated with what the agent should do with it."
                />
              </>
            ),
          },
          {
            id: "mcp",
            label: "MCP server",
            icon: <Boxes className="w-3.5 h-3.5" />,
            panel: (
              <>
                <h2 id="mcp">MCP server — for Cursor / Claude Code / Codex</h2>
                <p>
                  The agent gets six tools: <code>scan_project</code>,
                  <code>scan_file</code>, <code>explain_issue</code>,
                  <code>suggest_fix</code>, <code>apply_fix</code>,{" "}
                  <code>validate_fix</code>. Same registry as the CLI; same
                  report.
                </p>

                <h3 id="mcp-auto">One-command install</h3>
                <CodeBlock lang="shell">{`npx codemore mcp                              # print config + every client's config path
npx codemore mcp install --client cursor      # merge-safe write (backs up first, --dry-run supported)`}</CodeBlock>
                <p>
                  Supported clients: <code>cursor</code>,{" "}
                  <code>claude-desktop</code>, <code>claude-code</code>,{" "}
                  <code>codex</code>. Or configure manually:
                </p>

                <h3 id="mcp-cursor">Cursor</h3>
                <p>Add to <code>~/.cursor/mcp.json</code>:</p>
                <CodeBlock lang="json">{CURSOR_MCP}</CodeBlock>

                <h3 id="mcp-claude">Claude Code (CLI &amp; Desktop)</h3>
                <p>
                  Add to <code>~/.claude/mcp.json</code> (Mac/Linux) or{" "}
                  <code>%APPDATA%\Claude\mcp.json</code> (Windows):
                </p>
                <CodeBlock lang="json">{CLAUDE_MCP}</CodeBlock>

                <h3 id="mcp-codex">Codex CLI</h3>
                <p>
                  Add to <code>~/.codex/mcp.json</code> in the same shape — the
                  MCP transport is standard stdio.
                </p>

                <Callout type="tip" title="testing the wire">
                  After adding the entry, ask your agent literally: <em>“use
                  the codemore scan_project tool on this workspace.”</em> If the
                  agent calls the tool and surfaces findings, the wire is live.
                </Callout>

                <NextStep
                  href="/docs/rules"
                  title="Browse the 64-rule catalog"
                  description="See exactly what each tool will surface — grouped by pack, lifecycle, severity."
                />
              </>
            ),
          },
          {
            id: "vscode",
            label: "VS Code",
            icon: <Code2 className="w-3.5 h-3.5" />,
            panel: (
              <>
                <h2 id="vscode">VS Code extension</h2>
                <p>
                  Inline diagnostics, hover-explanations, and a code-action
                  quick-fix that runs the same agentic loop the MCP server
                  exposes.
                </p>

                <h3 id="vscode-install">Install</h3>
                <ol>
                  <li>Open VS Code → Extensions → search <strong>CodeMore</strong> → Install.</li>
                  <li>Reload when prompted. Analysis runs automatically on save (configurable).</li>
                  <li>Or install the offline VSIX:</li>
                </ol>
                <CodeBlock lang="shell">{`code --install-extension codemore-<version>.vsix`}</CodeBlock>

                <h3 id="vscode-keyboard">Keyboard shortcuts</h3>
                <ul>
                  <li><code>Ctrl+Shift+Q</code> / <code>⌘+Shift+Q</code> — Open Code Quality Dashboard</li>
                  <li><code>Ctrl+.</code> on a finding — apply the agentic fix</li>
                </ul>

                <Callout type="note" title="prefers local LLM?">
                  The fix loop uses whichever model the workspace setting
                  <code>codemore.llm.provider</code> points at — OpenAI,
                  Anthropic, Gemini, or a local Ollama endpoint.
                </Callout>

                <NextStep
                  href="/docs/github-action"
                  title="Ship the gate to CI"
                  description="One-file workflow that fails the PR on any new BLOCKER since baseline."
                />
              </>
            ),
          },
          {
            id: "action",
            label: "GitHub Action",
            icon: <GitPullRequest className="w-3.5 h-3.5" />,
            panel: (
              <>
                <h2 id="action">GitHub Action</h2>
                <p>
                  PR-comment bot. Fails the build on any new BLOCKER since the
                  committed baseline. Posts the report as a downloadable
                  artefact so agents in subsequent jobs can consume it.
                </p>

                <CodeBlock lang="yaml">{GH_ACTION}</CodeBlock>

                <Callout type="warning" title="baselines matter">
                  Existing projects accrue legacy findings — the action only
                  fails on findings that are <em>new</em> vs a committed
                  <code>.codemore-baseline.json</code>. Generate one with{" "}
                  <code>codemore baseline create</code> on first adoption.
                </Callout>

                <NextStep
                  href="/docs/security-gate"
                  title="Chain SAST + SCA + secret + IaC"
                  description="Copy-paste workflow chaining CodeMore with bandit, gitleaks, npm-audit, checkov."
                />
              </>
            ),
          },
          {
            id: "web",
            label: "Web Scanner",
            icon: <Globe className="w-3.5 h-3.5" />,
            panel: (
              <>
                <h2 id="web">Web Scanner</h2>
                <p>
                  Sign in and scan a public GitHub repo or upload a ZIP. Same
                  report renders in the browser — no local install required.
                  Reasonable for sharing a finding with a teammate or running a
                  scan from a Chromebook.
                </p>

                <h3 id="web-flow">Flow</h3>
                <ol>
                  <li>Click <strong>Sign in</strong> in the top nav (GitHub OAuth).</li>
                  <li>Paste a public repo URL <em>or</em> upload a ZIP.</li>
                  <li>Scan completes in 20–90s for typical projects; the report renders inline + downloadable.</li>
                </ol>

                <Callout type="important" title="data discipline">
                  Web scans are ephemeral — the report stays in your account
                  dashboard, content is not used for training, and the opt-in
                  telemetry endpoint <strong>refuses</strong> any payload that
                  contains file paths / contents / snippets (Zod{" "}
                  <code>strict()</code> schema).
                </Callout>

                <NextStep
                  href="/docs/limitations"
                  title="What we deliberately don't catch"
                  description="Honest list of classes that need DAST / human review. Lives at /docs/limitations."
                />
              </>
            ),
          },
        ]}
      />
    </>
  );
}
