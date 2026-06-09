export const metadata = {
  title: 'Install — CodeMore',
};

export default function InstallPage() {
  return (
    <>
      <h1>Install</h1>
      <p>Pick the surface that matches how you ship code.</p>

      <h2>CLI</h2>
      <p>Best for one-off scans on a checkout, CI scripts, and GitHub Actions.</p>
      <pre><code>{`# one-off
npx codemore scan .

# install globally
npm install -g codemore
codemore scan ./my-vibe-app

# CI gate
codemore scan . --fail-on BLOCKER
`}</code></pre>

      <h2>MCP server (Cursor / Claude Code / Codex CLI)</h2>
      <p>
        Wire the MCP server into your agent&apos;s configuration. The agent gains 6 tools:
        <code>scan_project</code>, <code>scan_file</code>, <code>explain_issue</code>,
        <code>suggest_fix</code>, <code>apply_fix</code>, <code>validate_fix</code>.
      </p>

      <h3>Cursor</h3>
      <p>Add to <code>~/.cursor/mcp.json</code>:</p>
      <pre><code>{`{
  "mcpServers": {
    "codemore": { "command": "npx", "args": ["codemore", "serve-mcp"] }
  }
}`}</code></pre>

      <h3>Claude Code (CLI)</h3>
      <p>Add to <code>~/.config/Claude/claude_desktop_config.json</code> (or the Windows equivalent under <code>%APPDATA%\Claude\</code>):</p>
      <pre><code>{`{
  "mcpServers": {
    "codemore": { "command": "npx", "args": ["codemore", "serve-mcp"] }
  }
}`}</code></pre>

      <h3>Codex CLI</h3>
      <p>Add to <code>~/.codex/mcp.json</code> in the same shape.</p>

      <h2>VS Code extension</h2>
      <ol>
        <li>Open VS Code → Extensions → search <strong>CodeMore</strong> → Install.</li>
        <li>Reload when prompted. Analysis runs automatically on save (configurable).</li>
        <li>
          Use the <em>Open Code Quality Dashboard</em> command (<code>Ctrl+Shift+Q</code> /
          <code>⌘+Shift+Q</code>) for the webview.
        </li>
      </ol>

      <h2>GitHub Action</h2>
      <p>Save as <code>.github/workflows/codemore.yml</code>:</p>
      <pre><code>{`on:
  pull_request:
jobs:
  scan:
    runs-on: ubuntu-latest
    permissions: { contents: read, pull-requests: write }
    steps:
      - uses: actions/checkout@v4
      - uses: K0802s/codemore@v1
`}</code></pre>

      <h2>External tool adapters</h2>
      <p>
        For polyglot repos, opt into the wrapper layer for Ruff (Python), golangci-lint (Go),
        clippy (Rust), or Biome (TS/JS):
      </p>
      <pre><code>{`codemore scan ./my-repo --external-tools ruff
codemore scan ./my-repo --external-tools ruff,biome
codemore scan ./my-repo --external-tools all
`}</code></pre>
    </>
  );
}
