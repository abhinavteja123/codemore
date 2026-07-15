# MCP client matrix — verified setups

"Your agent reads this" is CodeMore's core claim. This page is the receipts: every row
below was verified fresh against the **published `codemore@0.2.8`** npm package (via
`npx`, not a dev checkout) on Windows 11 / Node v24.16.0, 2026-07-15. Where a step can
only be confirmed inside a GUI we say so explicitly instead of pretending.

The server itself is one command, identical for every client:

```bash
npx -y codemore@latest serve-mcp
```

`codemore mcp` prints the snippet + your machine's exact config paths;
`codemore mcp install --client <cursor|claude-desktop>` writes them for you
(read-merge-write, backs up to `.bak`, supports `--dry-run`).

---

## Raw protocol proof (no client, just stdio)

Before trusting any IDE's UI, we spoke MCP to the published package directly:
spawned `npx -y codemore@latest serve-mcp` and exchanged newline-delimited JSON-RPC
over stdio. Actual captured responses:

**`initialize`** (protocolVersion `2024-11-05`) returned:

```json
{
  "protocolVersion": "2024-11-05",
  "capabilities": { "tools": { "listChanged": true } },
  "serverInfo": { "name": "codemore", "version": "0.2.8" }
}
```

**`tools/list`** returned exactly 6 tools:

```json
["scan_project","scan_file","explain_issue","suggest_fix","validate_fix","apply_fix"]
```

**`tools/call scan_project`** on a scratch project with planted bugs returned a full
report (`isError: false`), summary:

```json
{
  "score": 56,
  "issuesTotal": 2,
  "bySeverity": { "BLOCKER": 2, "CRITICAL": 0, "MAJOR": 0, "MINOR": 0, "INFO": 0 },
  "byCategory": { "security": 2 },
  "filesAnalyzed": 2,
  "linesOfCode": 17,
  "technicalDebtMinutes": 240
}
```

with the individual findings:

```json
{"id":"core-security-eval","severity":"BLOCKER","file":"app.js","line":3,"title":"Dynamic code execution via eval() or new Function()"}
{"id":"core-security-hardcoded-secret-pattern","severity":"BLOCKER","file":"config.js","line":3,"title":"Hardcoded provider secret in source"}
```

Honesty note: 3 bugs were planted; 0.2.8 flagged 2. The third — SQL built by string
concatenation and passed to `db.query()` — was not flagged by the published 0.2.8
(`core-security-sql-injection-concat` recall work landed after that release).

---

## Matrix

| Client | Config location (Windows) | Setup | Verified headlessly | Needs a human |
|---|---|---|---|---|
| Claude Code | `~/.claude.json` (local scope) or `.mcp.json` (project scope) | `claude mcp add codemore -- npx -y codemore@latest serve-mcp` | `claude mcp get codemore` → **✔ Connected** | `/mcp` shows 6 tools in a session |
| Cursor | `~/.cursor/mcp.json` | `codemore mcp install --client cursor` | merge + `.bak` + valid JSON; preserves existing servers | restart, MCP settings show codemore + 6 tools |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | `codemore mcp install --client claude-desktop` | merge + `.bak` + valid JSON; preserves existing servers | full restart, Developer settings show "running" |
| Codex CLI | `~/.codex/config.toml` | `codex mcp add codemore -- npx -y codemore@latest serve-mcp` | not verified (codex not installed on test machine) | run the add command, `codex mcp list` |

macOS paths: Cursor `~/.cursor/mcp.json` (same); Claude Desktop
`~/Library/Application Support/Claude/claude_desktop_config.json`. Claude Desktop has
no official Linux build; `codemore mcp` says so rather than guessing a path.

---

## Claude Code

```bash
claude mcp add codemore -- npx -y codemore@latest serve-mcp
```

Default scope is **local** (just you, just this project, stored in `~/.claude.json`).
Add `--scope user` for every project, or `--scope project` to write a shareable
`.mcp.json` at the repo root for your whole team.

Verified 2026-07-15: after the add, `claude mcp get codemore` reported —

```
codemore:
  Scope: Local config (private to you in this project)
  Status: ✔ Connected
  Type: stdio
  Command: npx
  Args: -y codemore@latest serve-mcp
```

`✔ Connected` means Claude Code actually spawned the server and completed the MCP
handshake, not just wrote the config.

**Windows/PowerShell trap:** in PowerShell, `--` is consumed by the shell before it
reaches `claude`, so the command above fails with `error: unknown option '-y'`. Run it
from cmd.exe, Git Bash, or with PowerShell's stop-parsing token:
`claude --% mcp add codemore -- npx -y codemore@latest serve-mcp`.

Human checklist: open a Claude Code session in the project → `/mcp` → codemore lists
6 tools → ask "scan this project with codemore" → screen-record the tool call.

## Cursor

```bash
npx codemore mcp install --client cursor            # writes ~/.cursor/mcp.json
npx codemore mcp install --client cursor --dry-run  # show the merge without writing
```

Verified 2026-07-15: against a `~/.cursor/mcp.json` that already contained another MCP
server, the install **merged** (pre-existing entry untouched, `codemore` added under
`mcpServers`), backed the original up to `mcp.json.bak`, and the result parsed as valid
JSON. `--dry-run` printed the exact post-merge file without writing.

Human checklist: restart Cursor → Settings → MCP → "codemore" shows green with 6
tools → in Agent chat ask "use codemore to scan this project" → screen-record.

## Claude Desktop

```bash
npx codemore mcp install --client claude-desktop
```

Config: `%APPDATA%\Claude\claude_desktop_config.json` (Windows),
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).

Verified 2026-07-15: same merge semantics as Cursor — pre-existing server entries and
unrelated top-level keys preserved, `.bak` written, output valid JSON.

**Windows quirk:** some Claude Desktop builds spawn MCP servers without a shell and
can't resolve `npx` (a `.cmd` shim) — the server shows as *disconnected* with a spawn
ENOENT in the logs. Fix: wrap the command —

```json
{ "command": "cmd", "args": ["/c", "npx", "-y", "codemore@latest", "serve-mcp"] }
```

Human checklist: fully quit Claude Desktop (system tray → Quit, not just the window) →
relaunch → Settings → Developer → codemore "running" → tools icon in chat shows the 6
codemore tools → ask "use codemore to scan <path>" → screen-record. If disconnected,
apply the `cmd /c` wrapper above.

## Codex CLI

```bash
codex mcp add codemore -- npx -y codemore@latest serve-mcp
```

or edit `~/.codex/config.toml` directly:

```toml
[mcp_servers.codemore]
command = "npx"
args = ["-y", "codemore@latest", "serve-mcp"]
```

**Not verified on the test machine** (Codex CLI wasn't installed) — the command above
is what `codemore mcp` prints; the TOML shape follows Codex's documented
`mcp_servers` table. Human checklist: install Codex CLI, run the add command,
`codex mcp list` shows codemore, then confirm the tools fire in a session.

---

## Troubleshooting

- **Server prints nothing / client hangs at startup** — the server logs only to
  stderr (`codemore: MCP server listening on stdio`); stdout is reserved for JSON-RPC.
  Silence on stdout before the client's `initialize` is correct behavior.
- **`scan_project` on a wrong path** — returns a loud `isError` result, not an empty
  "clean" report, so an agent can't misread a typo'd path as a passing scan.
- **First run is slow** — `npx codemore@latest` downloads the package on first use;
  pin a version (`codemore@0.2.8`) or `npm i -g codemore` if your client has a short
  startup timeout.
- **PowerShell eats `--`** — see the Claude Code section; affects any
  `<client> mcp add ... -- npx ...` command run from PowerShell.
- **Existing config protected** — `codemore mcp install` refuses to write when the
  existing config file is not valid JSON (it will not clobber a broken file), and
  always backs up to `<file>.bak` before writing.
