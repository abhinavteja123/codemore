# Contributing to CodeMore

Thanks for your interest in CodeMore. The project's wedge is **"the structured-feedback bus between scanners and coding agents."** Every contribution should make a Claude / Cursor / Codex agent better at fixing real production-blocking bugs in vibe-coded apps.

Two contribution paths:

- **Rule contributions** — adding new detectors. The PR template, bot-enforced fixture gate, and lifecycle states are all defined in [CONTRIBUTING-RULES.md](./CONTRIBUTING-RULES.md). Read that first if you want to ship a rule.
- **Everything else** (CLI, MCP server, extension, daemon, web, docs, scripts) — this document.

## Project layout

```
shared/             # The brain. Pure functions; no I/O.
  rules/            # Rule contract + registry + AST helpers + suppression.
  packs/<pack>/     # Per-rule modules. One file = one detector.
  report/           # schema.json + types.ts — the JSON contract.
daemon/             # Process layer.
  cli/              # `codemore` CLI entrypoints + project scanner.
  services/         # registryAdapter, validatorHarness, etc.
  mcp/              # MCP server.
src/                # VS Code extension.
web/                # Next.js dashboard (reference impl).
test/               # Mocha unit + integration tests.
corpus/             # Per-rule TP/FP fixtures.
docs/rules/         # Per-rule docs pages (one .md per rule).
```

## Quick start

```bash
# Install (no binary download in dev — set the flag).
CODEMORE_SKIP_BINARY_DOWNLOAD=1 npm ci

# Type-check everything that ships to npm.
npx tsc -p tsconfig.publish.json

# Run the CLI against a fixture.
node cli.js scan corpus/rules/vibe-no-rate-limit/tp --json --enable-experimental

# Run the rule PR validator on the working tree.
node scripts/validate-rule-pr.js

# Unit tests.
npm run test:unit
```

## How to verify your change before opening a PR

- **`npx tsc -p tsconfig.publish.json` is clean.** Anything that ships to npm must compile.
- **`node scripts/validate-rule-pr.js` reports passed.** This is the gate the CI bot runs on every PR.
- **`npm run scan:samples` produces no NEW BLOCKERs on the four Vercel / Auth.js reference apps.** The reference apps are our "false-positive canary" — they're real code that should NOT produce blockers. If your change makes them red, your rule is too aggressive or has a bug.
- **`npx mocha --require ts-node/register 'test/parity.test.ts'` is green.** The CLI, MCP, and extension paths must all return the same report.

## Commit + PR conventions

- Conventional Commits. `feat:` / `fix:` / `refactor:` / `test:` / `docs:` / `build:` / `chore:`.
- One concern per PR. A new rule, a refactor, and a docs change should be three PRs, not one.
- Commit messages explain the **why**, not the what. The diff already shows the what.
- PR description includes:
  - What changed and why.
  - How you verified (commands run, results).
  - Any follow-ups deferred (link to a tracking issue).

## Branching

- `main` is always shippable. Every commit on `main` passes CI.
- Feature branches: `feat/<short-slug>` or `<your-handle>/<topic>`.
- No long-lived feature branches; rebase + ship.

## What we will say no to

- Style-only opinions that don't catch a real bug. Prettier/ESLint already do that.
- Rules without a TP and FP fixture pair. The bot will reject these automatically; humans will too.
- "Helpful" refactors that touch surfaces beyond the change at hand. Keep the diff small.
- Adding dependencies for sugar. Every new npm dep is a supply-chain decision; bring a reason.

## Reporting bugs / asking for features

- **Bugs**: open a GitHub issue. Include the smallest reproduction, your `package.json` deps, the OS, and the exact CodeMore version (`npx codemore --version`).
- **Features**: open a GitHub discussion first if it's bigger than a small change. We'd rather agree on the shape before you write the code.

## Security

See [SECURITY.md](./SECURITY.md). Don't open public issues for security findings — use private vulnerability reporting.

## Code of conduct

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Licence

CodeMore is MIT-licensed. By contributing you agree that your contribution is licensed under the same terms.
