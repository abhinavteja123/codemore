# CodeMore — GitHub Action

Add CodeMore to any repo on GitHub in under a minute. On every pull request, the action scans your project, posts a fix-ready report as a PR comment, and (optionally) fails the check if any BLOCKER is present.

## Quickstart

Create `.github/workflows/codemore.yml` in your repo:

```yaml
name: CodeMore

on:
  pull_request:
  push:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write   # required for the PR comment
    steps:
      - uses: actions/checkout@v4
      - uses: K0802s/codemore@v1
```

That's it. On every PR you'll get a comment like this:

```
## CodeMore Scan — score 73/100

❌ Blocking issues found.

| Files | LOC | Tech debt | BLOCKER | CRITICAL | MAJOR | MINOR | INFO |
| 142   | 8.4k| 920 min   | 4       | 7        | 18    | 12    | 0    |

🛑 vibe-supabase-rls-disabled — supabase/migrations/001_init.sql:14
   Supabase table missing RLS policy
   <details>Suggested fix + verification criteria</details>

🛑 vibe-public-env-leak — .env.local:6
   ...
```

The comment is **upserted**: subsequent PR scans update the same comment instead of stacking new ones.

## Configuration

All inputs are optional.

| Input | Default | Description |
|---|---|---|
| `path` | `.` | Project root to scan, relative to the workspace. |
| `fail-on` | `BLOCKER` | Fail the action if any finding has severity >= this. Use `NONE` to never fail. |
| `packs` | _(all)_ | Comma-separated rule packs to enable. E.g. `vibe-supabase,vibe-secrets`. |
| `experimental` | `true` | Include rules in `lifecycle: experimental`. Recommended while the catalog is young. |
| `comment-on-pr` | `true` | Post the report as a PR comment. |
| `upload-artifact` | `true` | Upload the JSON report as a workflow artifact. |

### Tighter gate example

```yaml
- uses: K0802s/codemore@v1
  with:
    fail-on: CRITICAL          # fail on CRITICAL or higher
    packs: vibe-supabase,vibe-secrets
    experimental: false
```

### Scan a subdirectory

```yaml
- uses: K0802s/codemore@v1
  with:
    path: apps/web
```

### Reuse outputs in subsequent steps

```yaml
- id: codemore
  uses: K0802s/codemore@v1
  with:
    fail-on: NONE
- run: |
    echo "score=${{ steps.codemore.outputs.score }}"
    echo "blockers=${{ steps.codemore.outputs.blockers }}"
    echo "report=${{ steps.codemore.outputs.report-path }}"
```

## What the AI agent sees

The PR comment includes a structured "For the AI agent reading this" block with instructions to call CodeMore's MCP tool `validate_fix(instanceId, newContent)` after each proposed patch. Coding agents (Copilot, Claude Code, Cursor) registered with the CodeMore MCP server can read the comment, propose fixes one-by-one, and verify each fix before moving on.

## Permissions

The action needs:

- `contents: read` — to scan your code
- `pull-requests: write` — only required if `comment-on-pr: true`

If you set `comment-on-pr: false`, you can drop the `pull-requests: write` scope.

## Pinning a version

Pin to a major (`@v1`) for security patches without breaking changes:

```yaml
- uses: K0802s/codemore@v1
```

Pin to an exact SHA for full reproducibility:

```yaml
- uses: K0802s/codemore@<commit-sha>
```

## Troubleshooting

**The PR comment never appears.** Confirm the workflow has `permissions: pull-requests: write` and that the event is `pull_request` (not `pull_request_target`). Forks have reduced permissions by default; for forks consider running the scan on `push` and posting a status check instead.

**The action takes forever.** First run downloads the catalog dependencies (~10 s). Subsequent runs use the GitHub Actions Node cache and finish in 5–15 s for typical vibe-coded repos.

**False positive.** Per-rule suppression directives let you silence one location:

```sql
-- codemore-ignore-next-line: vibe-supabase-rls-permissive
create policy "public read" on public_data for select using (true);
```

Or disable a rule globally for the project via `.codemorerc.json`:

```jsonc
{
  "rules": {
    "vibe-public-env-leak": "off"
  }
}
```

If the rule is consistently wrong, please [open an issue](https://github.com/K0802s/codemore/issues) with the failing pattern — the catalog is contributed-to and improvements land fast.

## Adding rules

The catalog is open-source. See [`CONTRIBUTING-RULES.md`](../CONTRIBUTING-RULES.md) for the rule-PR spec: each rule ships with a TP fixture, an FP fixture, a docs page, and is bot-validated before review.
