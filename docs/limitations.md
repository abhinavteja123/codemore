# What CodeMore does NOT catch

Honest list of vulnerability classes we deliberately don't try to
detect. For each: why we skip, and what to use instead.

We hold ourselves to **agent-actionable findings only** — every rule
must either be auto-fixable today, or have a deterministic remediation
template the LLM can apply. The classes below either fail that bar
(they need human judgement) or live outside static analysis altogether
(runtime / config / process).

| Class | Why CodeMore doesn't catch | Use instead |
|---|---|---|
| **Weak password policy** | Policies live in app config (min length, complexity rules, lockouts). They're not source-code shapes. AI tends to ship default minimums; the right defence is product-level. | A linter for your auth framework + an ASVS V7 review. |
| **Audit logging completeness** | "Is every admin action logged?" is a content question that requires knowing your domain. A static rule could check that `logger.info` appears in a route handler, but not whether it carries the right fields. | OWASP A09 review + a structured-log schema enforced in test. |
| **Business logic flaws** | Coupon-reuse, role-escalation, double-spend — these depend on the business invariants, which CodeMore cannot infer. | Property-based tests; dedicated logic-test suite. |
| **Race conditions / concurrency** | Static analysis cannot prove the absence of a TOCTOU. CodeMore catches the most-common single-process pattern (registry lookup → write) but not the general case. | Stress-test fixtures; thread-sanitizer; concurrent-orders fuzzer. |
| **Open S3 / GCS buckets** | The ground truth lives in cloud API state, not source. A Terraform definition might say "private" while the live bucket is public. | AWS Config / GCP Security Command Center / Steampipe. Pair with checkov in the security gate (covers the Terraform side). |
| **MFA presence / configuration** | Same as password policy — config concern, not source shape. | Your IdP's compliance dashboard; mandatory-MFA SSO. |
| **DAST findings** | We're a static analyzer. Server-side request smuggling, response-splitting, time-based blind injection — these need a running app. | OWASP ZAP / Burp Suite / sqlmap in your CI pipeline. |
| **Live secret rotation** | We flag secrets in code; we cannot verify whether the key has been rotated since the leak. | Vault / 1Password Secrets Automation + an oncall rotation rota. |
| **Insider threat / supply-chain compromise of trusted publishers** | Slopsquatting + recently-published-package CVE we flag. A trusted maintainer publishing malicious code under their own name is outside what static checks can see. | Sigstore + npm audit signatures + reproducible builds. |

## How to think about it

CodeMore is the **structured-feedback bus between scanners and coding
agents**. The wedge stays sharp by being honest about its edges. Every
rule must produce a finding the agent can act on; classes that need
human judgement, runtime observation, or external state belong in the
adjacent tools above.

If a vulnerability class you care about IS source-shape detectable and
you want it added, open an issue with a TP/FP fixture pair and we'll
calibrate against the contribution gate (see [CONTRIBUTING-RULES.md](../CONTRIBUTING-RULES.md)).

## Rules calibrated below the 75% precision bar (documented for honesty)

These rules fire but with real-world precision < 75 % on the 2026-06-12 audit
(5 real codebases — see `accuracy-report-2026-06-12.md`). They stay in the
catalog because their TPs are high-value, but agents should weight them lower:

| Rule | Real-world precision | Why | Mitigation |
|---|---:|---|---|
| `core-quality-unused-export` | ~30 % | TypeScript `import type { X }` consumption isn't tracked; entry-point files (`index.ts`, `route.ts`, `page.tsx`) and dynamic registration patterns leak through | Lower `defaultConfidence: 0.7` so agents sort it below security findings |
| `vibe-supply-chain-hallucinated-import` | ~25 % | Workspace packages + bundled deps that aren't on npm but ARE real | Read `package.json` `workspaces` field post-launch + add registry network fallback |
| `vibe-agent-tool-no-confirm` | ~50 % | Agent SDK shapes vary too widely for regex | `defaultConfidence: 0.65` so agents downgrade it |
| `core-quality-duplicate-string` | ~10 % at the old ≥3 threshold | Framework labels, severity strings, file extensions are intended-repeated | **Gated behind `--enable-experimental` as of v0.2.1**. Recalibrated in v0.2.7 (≥5 occurrences of strings ≥8 chars, test files skipped); stays experimental until re-measured |

## What changed in v0.2.1 (gitignore bypass)

By default the walker now **scans `.env*`, `*.pem`, `*.key`,
`firebase-adminsdk*.json`, `*service-account*.json`, `credentials.json`,
`serviceAccountKey.json`, `.npmrc`, `.pypirc` EVEN when `.gitignore` excludes
them.** Real-world testing found a leaked Firebase admin SDK JSON in a project
whose `.gitignore` said "ROTATE THESE KEYS" — the file was on disk, in tarballs,
in Docker images. `.gitignore` only prevents git TRACKING, not transport.

To restore the previous behaviour: `codemore scan . --respect-gitignore-fully`.
