# Contributing to CodeMore

**Canonical docs:** [`CONTRIBUTING.md`](../CONTRIBUTING.md) · [`CONTRIBUTING-RULES.md`](../CONTRIBUTING-RULES.md)

This is a quick pointer page. For the full details, read the root-level files above.

---

## Two contribution paths

### 1. Rule contributions (new detectors)

Add a new security or quality rule to the catalog. **Read [`CONTRIBUTING-RULES.md`](../CONTRIBUTING-RULES.md) first.**

Every rule submission requires **five artifacts**:

1. **Rule module** — `shared/packs/<pack>/<rule-id>.ts` implementing the detection logic
2. **TP fixture** — `corpus/rules/<rule-id>/tp/` — code that MUST trigger the rule
3. **FP fixture** — `corpus/rules/<rule-id>/fp/` — code that must NOT trigger the rule
4. **Docs page** — `docs/rules/<rule-id>.md` explaining the issue and fix
5. **Registration** — entry in the pack's `index.ts`

The **bot is your first reviewer**. The CI workflow (`rule-pr-validator.yml`) checks:
- All five artifacts exist
- TP fixture triggers the rule (FP does not)
- Your rule doesn't raise the catalog's false-positive rate above 10%
- The rule follows the `Rule` interface contract (pure function, no I/O or state)

If the bot passes, human review focuses on the logic and documentation.

#### Rule lifecycle

Rules start **experimental** (off by default, confidence ≤ 0.6) and earn promotion:

| Stage | How to earn promotion |
|---|---|
| **experimental** | Ship with ≥ 1 TP/FP fixture pair. Default off; users opt in via `--enable-experimental`. |
| **beta** | ≥ 3 fixture pairs + 14-day real-world FP rate < 15% (from opt-in telemetry). Default on. |
| **stable** | 30-day FP rate < 5% + passes Vercel reference-app clean scan. Ships in default pack; agents treat it highest-confidence. |
| **deprecated** | Emits warning. Removed next major version. |

We only promote once telemetry from real projects shows the rule is low-noise. This keeps the `< 5% false-positive` bar that makes CodeMore worth running.

### 2. Everything else (CLI, MCP, extension, daemon, web, docs)

**Read [`CONTRIBUTING.md`](../CONTRIBUTING.md).**

Changes to the core platform, infrastructure, documentation, or build system. The PR bar:

- `npx tsc -p tsconfig.publish.json` — type-checks cleanly
- `npm run scan:samples` — no NEW BLOCKERs on Vercel reference apps
- `npx mocha --require ts-node/register test/parity.test.ts` — CLI, MCP, daemon emit identical reports
- Clear commit message explaining **why** (the diff shows **what**)

---

## Before opening a PR

```bash
# Type-check
npx tsc -p tsconfig.publish.json

# (Rules only) Run the bot equivalent
node scripts/validate-rule-pr.js

# Surface parity (CLI ↔ MCP ↔ daemon)
npx mocha --require ts-node/register test/parity.test.ts

# Verify no new BLOCKERs on canary projects
npm run scan:samples
```

---

## What gets reviewed

- **Rule PRs:** Logic, AST/regex correctness, detection confidence, evidence clarity, docs.
- **Platform PRs:** API design, test coverage, performance, security, maintainability.
- **Docs:** Clarity, accuracy, examples that run, links that work.

All commits land on `main` via PR. `main` is always shippable.

---

## Code of conduct

By participating, you agree to abide by the [Code of Conduct](../CODE_OF_CONDUCT.md).

---

## Security

Found a vulnerability? **Do not open a public GitHub issue.** Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-about-software-vulnerabilities/privately-reporting-a-security-vulnerability).

See [`SECURITY.md`](../SECURITY.md) for details.

---

## Questions?

- **"How do I write a rule?"** → [`CONTRIBUTING-RULES.md`](../CONTRIBUTING-RULES.md)
- **"How do I set up dev?"** → [`CONTRIBUTING.md`](../CONTRIBUTING.md), "Quick start" section
- **"What's the project's architecture?"** → [`README.md`](../README.md), "Architecture" section
- **"What does the report schema look like?"** → [`docs/schema.md`](./schema.md)
