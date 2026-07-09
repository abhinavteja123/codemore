<!-- codemore-ignore-file: vibe-cicd-secret-in-yaml, core-security-hardcoded-secret-pattern -->
# vibe-cicd-secret-in-yaml

**Pack:** `vibe-secrets`
**Default severity:** BLOCKER
**Languages:** YAML
**Lifecycle:** beta
**Confidence:** 0.85

## What it catches

Secrets in CI/CD pipeline YAML — `.github/workflows/*.yml`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `.circleci/config.yml`. Two failure modes:

1. **Literal secret embedded in YAML:** `api_key: "sk_live_..."`
2. **Secret echoed to the job log:** `run: echo ${{ secrets.PROD_DB_URL }}` or `run: curl -H "Authorization: $TOKEN" ...`

Pattern (2) is more common in AI-generated workflows. The developer pulls a secret from GitHub Actions' secrets vault and then `echo`s it during a debug step. That puts the secret in the workflow log, which may be public on public repos and accessible to anyone with read access on private repos.

## Why it matters

Two ways a CI workflow leaks a secret:

1. **Literal key in YAML** — once committed, it's in Git history forever. Even if you delete the file later, the secret remains in all past commits and any clones/mirrors.

2. **Echoed-secret in logs** — GitHub Actions (and most CI platforms) archive build logs. On public repos, anyone can view the log. On private repos, the log is visible to anyone with repository read access. Secrets in logs are often scraped by bots within minutes.

This is a top entry vector for credential leaks at companies using AI-assisted CI configuration.

## Example — flagged

```yaml
# .github/workflows/deploy.yml

name: Deploy
on: [push]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      # BLOCKER: literal secret in YAML.
      - name: Deploy
        env:
          API_KEY: "sk_live_RealStripeKeyValueHereLongEnough"
        run: ./deploy.sh

      # BLOCKER: echo of a secret to the job log.
      - name: Debug
        run: echo "Token is: ${{ secrets.GITHUB_TOKEN }}"

      # BLOCKER: curl with bare token in the command line.
      - name: Call API
        run: curl -H "Authorization: Bearer ${{ secrets.API_TOKEN }}" https://api.example.com
```

## Example — not flagged

```yaml
# .github/workflows/deploy.yml

name: Deploy
on: [push]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      # OK: secret pulled from the vault and NOT echoed.
      - name: Deploy
        env:
          API_KEY: ${{ secrets.STRIPE_LIVE_KEY }}
        run: ./deploy.sh

      # OK: if you need to reference a secret at runtime, pass via env var
      # and consume in the script (no echo to stdout).
      - name: Authenticate
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Script never echoes the token.
          ./authenticate.sh

      # OK: if debug output is genuinely needed, mask it explicitly.
      - name: Debug
        env:
          TOKEN: ${{ secrets.API_TOKEN }}
        run: |
          echo "::add-mask::$TOKEN"
          echo "Token is: $TOKEN"
```

## Suggested fix

**For literal secrets in YAML:**

Move the secret to GitHub's secrets vault:

1. Go to **Settings → Secrets and variables → Actions**.
2. Create a new secret: `STRIPE_LIVE_KEY`.
3. Paste the key value.
4. Reference via `${{ secrets.STRIPE_LIVE_KEY }}` in the workflow.

```yaml
# Before (bad):
env:
  API_KEY: "sk_live_RealKey..."

# After (good):
env:
  API_KEY: ${{ secrets.STRIPE_LIVE_KEY }}
```

**For echoed secrets in logs:**

Remove the echo step or mask the output explicitly:

```yaml
# Before (bad):
run: echo "Token is: ${{ secrets.API_TOKEN }}"

# After (good) — Option 1: Don't echo at all.
# Remove the line.

# After (good) — Option 2: Mask the output.
run: |
  echo "::add-mask::${{ secrets.API_TOKEN }}"
  echo "Authenticated"
```

**For Authorization headers in command lines:**

Don't interpolate the token inline; pass via stdin or use the action's `auth:` parameter:

```yaml
# Before (bad):
run: curl -H "Authorization: Bearer ${{ secrets.API_TOKEN }}" https://api.example.com

# After (good) — Option 1: Use an action's auth input.
- uses: some/action
  with:
    auth-token: ${{ secrets.API_TOKEN }}

# After (good) — Option 2: Pass via stdin.
run: |
  curl -H "Authorization: Bearer $(cat /dev/stdin)" https://api.example.com < <(echo "${{ secrets.API_TOKEN }}")
```

## Suppressing

```yaml
# Reason: this is a fake/rotated key, never used in production.
# codemore-ignore-next-line: vibe-cicd-secret-in-yaml
env:
  STAGING_KEY: "sk_test_FakeKeyForLocalTesting123"
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## References

- [GitHub Actions — Secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
- [GitHub Actions — Masking Values](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#masking-a-value-in-log)
- [GitGuardian — CI/CD Secrets Leaks](https://blog.gitguardian.com/)

## Implementation

Scans YAML files matching CI/CD workflow patterns (`.github/workflows`, `.gitlab-ci.yml`, etc.). For each match to a literal-secret pattern or an echo-secret pattern, flags the line. Uses heuristic secret patterns (Stripe prefix, JWT shape, GitHub token shape, AWS KEY ID, etc.) and echo/printf/curl patterns feeding secret interpolations.

Source: [`shared/packs/vibe-secrets/vibe-cicd-secret-in-yaml.ts`](../../shared/packs/vibe-secrets/vibe-cicd-secret-in-yaml.ts)
Fixtures: [`corpus/rules/vibe-cicd-secret-in-yaml/`](../../corpus/rules/vibe-cicd-secret-in-yaml/)
