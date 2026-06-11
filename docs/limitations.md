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
