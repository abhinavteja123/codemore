# CodeMore security gate (CI)

A copy-paste GitHub Actions workflow that runs the **layered security
scan** CodeMore recommends for every PR. Catches BLOCKER-severity
findings before they ship and uploads structured reports for downstream
PR-comment / dashboard tooling.

## What it runs

| Layer | Tool | Catches |
|---|---|---|
| **SAST (we own)** | `codemore scan` | All 58 native rules — SQL injection, BOLA, weak crypto, etc. |
| **SAST (we wrap)** | ruff + biome + bandit | Style + correctness + Python security |
| **Secret scan** | gitleaks | Hardcoded credentials, in working tree + git history |
| **SCA** | npm-audit + pip-audit | CVEs in declared dependencies |
| **IaC** | checkov | Dockerfile + Terraform + workflow YAML misconfigurations |

The single CodeMore invocation orchestrates SAST + secrets + SCA via
`--external-tools` and emits one `codemore-report.json`. Checkov runs
separately (different output shape, different IaC scope) and emits
`checkov-report.json`. Both reports are uploaded as workflow artifacts.

## Quick install

```bash
mkdir -p .github/workflows
curl -sSL \
  https://raw.githubusercontent.com/abhinavteja123/codemore/main/templates/.github/workflows/codemore-security-gate.yml \
  > .github/workflows/codemore-security-gate.yml
git add .github/workflows/codemore-security-gate.yml
git commit -m "ci: add codemore security gate"
```

## How the gate fails the build

CodeMore exits non-zero when **any** issue with severity ≥ `BLOCKER`
reaches the new findings set (baseline-aware if `.codemore-baseline.json`
is committed). Workflow fails. PR cannot merge.

To raise the gate (catch CRITICALs too), change the flag in the
workflow:

```yaml
--fail-on CRITICAL
```

To lower the gate temporarily during adoption, generate a baseline and
commit it:

```bash
npx codemore@latest baseline create > .codemore-baseline.json
git add .codemore-baseline.json
git commit -m "chore: codemore baseline (pre-adoption snapshot)"
```

Only NEW issues introduced AFTER the baseline date will fail the build;
pre-existing findings are recorded but pass.

## Customisation

- Comment out adapter tools you don't need (e.g. drop `bandit` on a
  pure-TS repo).
- Set `soft_fail: true` on checkov if its IaC rules are noisy on your
  repo.
- Change the `fetch-depth: 0` to a shallow value (`50`) if your repo is
  huge and gitleaks history scanning is too slow — the trade-off is
  missing secrets in older commits.
- Pin tool versions in the `Install external scanners` step for
  reproducibility.

## Caveats

- **gitleaks scans git history.** This catches old leaks that are still
  rotation-relevant. If you maintain a public-facing repo with prior
  leaks you've already rotated, add a `.gitleaksignore` file with the
  fingerprint of the historical finding.
- **npm-audit needs a lockfile.** Skipped silently if your repo doesn't
  commit `package-lock.json`.
- **pip-audit prefers `requirements.txt`.** Falls back to the active
  Python env if not present. For multi-env projects, pin the env in the
  setup-python step.

## See also

- [CodeMore CLI docs](https://codemore.tech/docs/cli)
- [Rule reference](https://codemore.tech/docs/rules)
- [What we don't catch](limitations.md)
