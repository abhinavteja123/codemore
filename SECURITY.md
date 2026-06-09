# Security Policy

CodeMore is a security tool. We hold ourselves to a higher bar than the rules we ship.

## Supported versions

Until v1.0.0 we only support the latest `0.x` release on the `main` branch. Pre-1.0 releases do not receive backported fixes.

| Version  | Supported |
| -------- | --------- |
| 0.x      | ✅ latest only |
| < 0.1.0  | ❌ |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately via GitHub's [private vulnerability reporting](https://github.com/codemore/codemore-vscode/security/advisories/new) (Security tab → Advisories → "Report a vulnerability"). If that isn't available, email the maintainer listed in `package.json` with the subject line `CodeMore security report`.

Include:
- A description of the issue and its impact.
- A minimal reproduction (smallest fixture / commands that demonstrate it).
- Your assessment of the severity (BLOCKER / CRITICAL / MAJOR / MINOR per our own scale).
- Whether you've published anything about it.

You will get an acknowledgement within **72 hours** and a public fix or coordinated disclosure plan within **14 days** for verified reports.

## What counts as a vulnerability in CodeMore

The tool itself ingests untrusted code and produces a structured report consumed by AI agents. The threat model includes:

- **Code execution via fixture parsing** — a malicious file that, when scanned, causes the analyzer to execute attacker-controlled code. (Our AST work is parse-only, but report this if you find a way around that.)
- **Command injection through subprocess invocations** — `scripts/download-binaries.js`, `scripts/validate-rule-pr.js`, or any path that calls `execSync` / `execFile` with a string that the caller doesn't fully control.
- **Sensitive data exfiltration** — anywhere the daemon or CLI sends file content to a third party without an explicit opt-in flag.
- **Path traversal** — fixture paths or report file paths that escape the project root in a way that lets an attacker read or write outside it.
- **Validator harness sandbox escape** — `daemon/services/validatorHarness.ts` runs rule logic against patched content; report any way the patched content can affect the host process.

## What is NOT a vulnerability

- A rule producing a false positive or false negative — open a regular issue or PR.
- A scan being slow or noisy on a particular project — same.
- The MCP server accepting a connection from any local stdio client — that's by design for the integration model.

## Coordinated disclosure

We follow a 90-day default disclosure window from the date of acknowledgement. If a fix lands faster, the advisory is published with the fix. If it takes longer, we coordinate the date with the reporter.

Credit is given by name in the advisory unless the reporter prefers anonymity.
