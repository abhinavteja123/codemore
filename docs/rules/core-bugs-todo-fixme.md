# core-bugs-todo-fixme

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| maintainability | INFO | experimental | 1.0 (clamped to 0.6 while experimental) |

## What it catches

Inline TODO / FIXME / XXX / HACK comments across:

- `// TODO …` and `/* TODO … */` (JS / TS / C-family)
- `# TODO …` (Python / shell / YAML / Dockerfile / env)
- `-- TODO …` (SQL / Lua / Haskell)

Case-insensitive on the keyword.

## Why it matters

Every team has TODO and FIXME notes; every team also forgets they exist until production hits the deferred work. The rule reports them at **INFO** — never blocks builds — but the inventory lands in every report, so reviewers can scan and decide.

AI-generated code adds these at a high rate when the LLM hits a "this might need more thought" branch. Surfacing them at INFO gives the team an inventory to triage before launch.

## Example: failing code

```ts
// TODO: validate input before proceeding
// FIXME(alice): off-by-one when n === 0
// XXX: depends on undocumented browser behaviour
// HACK: comment out for the demo, remove before prod
```

Each line produces one INFO finding.

## How to fix

Decide one of:

1. **Resolve now** — the work is small enough to inline-fix.
2. **Track externally** — create an issue, replace the comment with a link to the issue.
3. **Keep with intent** — rewrite the comment as a clear note about why this is being left, with no TODO/FIXME keyword.

## Suppression

```ts
// codemore-ignore-next-line: core-bugs-todo-fixme
// TODO(2026-Q3): refactor when the next contract migration lands
```

## References

- Industry-wide consensus that long-lived TODOs become tech debt at ~3 month half-life.
