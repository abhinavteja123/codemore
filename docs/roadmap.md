# CodeMore Roadmap

**Last Updated:** 2026-07-02

This roadmap reflects our current directional thinking. Items are subject to change based on community feedback, adoption data, and emerging priorities. Dates are estimates; we ship when ready.

---

## v0.2 → v0.3 (Q3 2026)

### External-tool recall audit

Expand the external adapters (ruff, biome, golangci-lint, clippy, bandit, gitleaks, npm-audit, pip-audit) with systematic precision/recall testing. Today we trust the tools but measure sporadically. v0.3 will include:

- Audit results for each adapter on 20+ real polyglot projects
- Severity translation validation (does `biome` "error" consistently map to our BLOCKER?)
- Performance profiling on large monorepos (1000+ files)
- Tool-version pinning guidance for reproducible scans

### Rule promotion to stable via telemetry

Today, new rules ship experimental and are manually promoted. v0.3 automates this:

- Rules in `beta` lifecycle gain promotion eligibility after 30 days of real-world telemetry
- If the opt-in telemetry shows FP rate < 5% over 30 days AND the rule passes canary projects clean, auto-promote to `stable`
- Conversely, `stable` rules whose downvote rate crosses 10% over 14 days trigger auto-demotion PR
- Dashboard at `codemore.dev/rules` shows live promotion/demotion status per rule

This keeps the < 5% false-positive bar without blocking new detectors.

### CLI apply-fix command

Today, `apply_fix` (agentic fixer loop: plan → generate → validate → retry) is MCP-only. v0.3 wraps it in the CLI:

```bash
codemore apply-fix --issue-id 01HZ9KGZQ7HBGF1XYZP2C3K4Q5 --provider openai
```

Or interactively:

```bash
codemore scan . --json | jq '.issues[0]' | codemore apply-fix --from-stdin
```

Uses the same `daemon/services/agenticFixer.ts` orchestrator. Enables headless CI workflows where the agent (Claude via Anthropic API, OpenAI, or local) fixes blockers in PR automation.

### Expanded white-box test coverage

Internals need better coverage:

- AST helpers (TS + Python) — comprehensive branch coverage
- Dataflow analysis edge cases (cross-module taint, callback chains)
- Lifecycle promotion logic (telemetry thresholds, edge cases)
- External adapter error handling (spawn failures, timeouts, JSON parse errors)
- Baseline diff logic (three-way merges, deleted-and-re-added issues)

---

## v0.3 → v0.4 (Q4 2026)

### Multi-IDE verification matrix

Formalize compatibility across all surfaces:

- **Cursor** — MCP server + extension marketplace submission
- **Claude Code** — MCP server verification, streaming output performance
- **Claude Desktop** — MCP server stability, resource limits
- **Codex CLI** — command-line interface, output formats

Publish a compatibility matrix showing which CodeMore features (apply-fix, validation loop, baseline mode) work on which IDE. Include known limitations.

### Rule catalog growth

Target 80+ native rules by end of Q4:

- **API security** — OAuth/JWT misconfigurations, CORS misuse, rate-limit bypass patterns
- **Infrastructure** — Docker image scanning, Kubernetes manifest validation
- **LLM-specific** — prompt-injection risks, model-output validation gaps
- **Frontend frameworks** — framework-specific anti-patterns (Next.js, React, Vue, Svelte)

Each rule ships with the standard 3+ fixture pair + telemetry-driven promotion path.

### Demo video + case study

- **Video:** open a real Lovable app from codemore.dev, run the scanner, send findings to Claude Code, watch BLOCKERs close automatically
- **Case study:** audit + fix cycle on 5 public open-source projects, document the before/after, time-to-fix per finding type

---

## v0.4 → v0.5 (2027 H1)

### JetBrains plugin

Bring inline diagnostics + code-action quick-fix to IntelliJ, WebStorm, GoLand, PyCharm, RubyMine. Same UX as the VS Code extension.

### Cross-language taint tracking (research)

Today we track taint within a single language (TS → SQL sink via parameterized queries). v0.5 will research:

- Taint across language boundaries (Node.js → SQL, Python → shell, etc.)
- Serialization/deserialization gaps (JSON/pickle/pickle/protobuf boundaries)
- Data-flow through configuration files

This is hard; expect this to be a multi-version research thread.

### Supply-chain security depth

- Dependency-level findings (CVE deep-links to NVD, CVSS scoring)
- License audit (GPL/AGPL detection, license-file validation)
- Provenance checks (signed npm packages, reproducible builds)

Partner with Sigstore and npm security team.

---

## Ongoing

### Corpus expansion

**116 fixture pairs today → 300+ by end of 2026.** Every new rule starts with 3+ pairs. External community can contribute fixtures via PRs.

### Documentation

- Video tutorials for rule authors
- Webinar series: "Writing a rule in 30 minutes"
- Integration guides for CI/CD platforms (GitHub Actions, GitLab CI, CircleCI)
- Migration guides for scanning with other tools (Snyk → CodeMore, SonarQube → CodeMore)

### Performance

- Parallel rule execution (today: serial within packs)
- Incremental scanning (only re-scan changed files in multi-scan mode)
- Caching of AST/dataflow analysis across scans

### Community

- Rule contribution bounty program (community members earn recognition + credit for new rules)
- CodeMore Slack community for troubleshooting and ideas
- Monthly "rule review" office hours

---

## Non-goals (intentionally out of scope)

- **DAST / runtime scanning** — CodeMore is static. For runtime issues, pair with OWASP ZAP or Burp.
- **Live cloud-state audit** — We don't query AWS/GCP/Azure. Use native compliance tools (AWS Config, Google Cloud Security Command Center) for those.
- **Manual code review replacement** — CodeMore is a force-multiplier for LLMs, not a human reviewer replacement.
- **Dependency graph visualization** — That's a dashboard feature; the report contains links.

---

## Feedback

Found something missing? Open an issue or start a discussion on GitHub. The roadmap evolves based on real adoption and community priorities.

---

## See also

- [What CodeMore does NOT catch](./limitations.md)
- [Security gate setup](./security-gate.md)
- [Rule contribution guide](../CONTRIBUTING-RULES.md)
