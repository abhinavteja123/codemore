# Contributing Rules to CodeMore

CodeMore's value scales with its rule catalog. The contribution gate below exists so the catalog can grow **without losing the <5% false-positive bar** that makes CodeMore worth running.

The gate is bot-enforced. The bot is your first reviewer. If the bot is green, a human reviewer's only job is to read your rule's logic and your docs page.

## TL;DR

To add a rule you need **five artifacts** in one PR:

1. The rule module at `shared/packs/<pack>/<rule-id>.ts`
2. A true-positive fixture at `corpus/rules/<rule-id>/tp/`
3. A false-positive fixture at `corpus/rules/<rule-id>/fp/`
4. A docs page at `docs/rules/<rule-id>.md`
5. A registration entry in the pack's `index.ts`

The PR validator (`.github/workflows/rule-pr-validator.yml`) confirms all five exist, runs your rule against both fixtures (TP must trigger, FP must not), runs every rule in the catalog against the full corpus, and rejects the PR if your rule raises the catalog's false-positive rate above 10%.

If any of that fails, the bot leaves a comment with the exact failure. Fix and push.

---

## 1. The rule module

A rule is a pure function over a `RuleContext`. No instance state, no shared mutation. It implements the `Rule` interface from `shared/rules/Rule.ts`.

```ts
// shared/packs/vibe-supabase/vibe-supabase-rls-disabled.ts

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

export const vibeSupabaseRlsDisabled: Rule = {
  id: 'vibe-supabase-rls-disabled',
  version: '1.0.0',
  pack: 'vibe-supabase',
  lifecycle: 'experimental',           // start here, earn promotion
  languages: ['sql'],
  targetFrameworks: ['supabase'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.85,
  title: 'Supabase table missing RLS policy',
  whyItMatters:
    'The Supabase anon key shipped to the client can read or write any row in ' +
    'a table without RLS. 70% of audited Lovable apps leak data this way ' +
    '(see CVE-2025-48757).',
  citation: 'https://codemore.dev/rules/vibe-supabase-rls-disabled',

  detect(ctx: RuleContext): RuleFinding[] {
    // pure detection logic
    return [];
  },
};
```

### Naming
- **Rule id**: kebab-case, namespaced by pack. Format: `<pack>-<short-description>`.
- **Pack**: kebab-case. Existing packs: `core-security`, `core-quality`, `vibe-supabase`, `vibe-auth`, `vibe-secrets`, `vibe-frontend`. Add a new pack with one PR before adding rules to it.

### What counts as a separate rule
One rule = one pattern with one fix. If you find yourself writing `if (variant === 'a') { ... } else { ... }` inside `detect()` and emitting different titles/fixes per branch, you have two rules. Split them.

### Severity & confidence
- **defaultSeverity** is the rule's *worst case*. Findings can downgrade to a lighter severity but should not upgrade.
- **defaultConfidence** must be honest. If you wrote a regex over the file content with no contextual disambiguation, you are not at 0.95. Two-pass rules (regex candidate → AST/dataflow confirm) earn higher confidence.
- New rules ship as `lifecycle: 'experimental'`. They are off by default. They earn promotion through telemetry — see `shared/rules/lifecycle.ts` for the thresholds.

### Pure functions only
`detect()` may read `ctx`. It may not:
- Mutate `ctx` or anything reachable from it.
- Read or write the filesystem.
- Make network calls.
- Share state with other invocations via module-level variables.

Violations break parallel scans and are rejected on review even if tests pass.

---

## 2. The TP fixture (`corpus/rules/<rule-id>/tp/`)

A directory containing the minimum project structure that triggers your rule. The validator scans this directory and expects **at least one** finding with `id === <rule-id>`. Multiple-instance fixtures are encouraged — they exercise the rule on more than one shape of the failing pattern in one fixture.

```
corpus/rules/vibe-supabase-rls-disabled/tp/
  supabase/
    migrations/
      001_init.sql
```

Where `001_init.sql` contains the pattern your rule catches:

```sql
create table profiles (
  id uuid primary key,
  user_email text not null
);
```

### TP fixture rules
- Smallest possible repro. Anything not needed to trigger the rule should be deleted.
- Real code shape, not synthetic. A fixture that no human would ever write does not prove your rule is useful.
- Comment-free unless the rule depends on comments.

---

## 3. The FP fixture (`corpus/rules/<rule-id>/fp/`)

A directory containing a case that **looks like** the TP but should not trigger. This forces you to think about false positives at contribution time.

```
corpus/rules/vibe-supabase-rls-disabled/fp/
  supabase/
    migrations/
      001_init.sql
```

```sql
create table profiles (
  id uuid primary key,
  user_email text not null
);

alter table profiles enable row level security;

create policy "users read own profile"
  on profiles for select
  using (user_email = auth.jwt()->>'email');
```

### FP fixture rules
- Should differ from the TP only in the way that makes it correct.
- Should be the case that, if your rule got it wrong, a user would file an issue.
- The validator confirms zero findings with `id === <rule-id>` for this fixture.

If you cannot construct a realistic FP fixture, your detector is probably trivial and you should expand its detection logic before submitting.

---

## 4. The docs page (`docs/rules/<rule-id>.md`)

Every rule has a docs page. The schema's `citation` field links here.

```markdown
# vibe-supabase-rls-disabled

**Category:** security · **Default severity:** BLOCKER · **Lifecycle:** experimental

## What it catches

CREATE TABLE statements in Supabase migration files that are not followed by `ENABLE ROW LEVEL SECURITY`.

## Why it matters

The Supabase anon key is shipped to the client. Any reader of the bundled JS can use it to query tables that have no RLS policy. CVE-2025-48757 affected 170+ production Lovable apps this way in a single weekend.

## Example: failing code

\`\`\`sql
create table profiles (id uuid primary key, ...);
\`\`\`

## Example: how to fix

\`\`\`sql
create table profiles (id uuid primary key, ...);
alter table profiles enable row level security;
create policy "users read own" on profiles for select using (...);
\`\`\`

## Suppression

\`\`\`sql
-- codemore-ignore: vibe-supabase-rls-disabled
create table public_data (...);
\`\`\`

## References

- [CVE-2025-48757](https://...)
- [Supabase RLS docs](https://supabase.com/docs/guides/auth/row-level-security)
```

---

## 5. The registration entry

Add your rule to the pack's `index.ts` so the registry sees it:

```ts
// shared/packs/vibe-supabase/index.ts
import { vibeSupabaseRlsDisabled } from './vibe-supabase-rls-disabled';

export const vibeSupabasePack = [
  vibeSupabaseRlsDisabled,
];
```

---

## Lifecycle states

| State | Default-on? | Confidence cap | How to reach it |
|---|---|---|---|
| `experimental` | no | 0.6 | Initial state. Accepted with one TP+FP fixture pair. |
| `beta` | yes | 0.85 | ≥3 fixture pairs **and** <15% FP over 7+ days of opt-in telemetry. |
| `stable` | yes | 1.0 | <5% FP over 30+ days of opt-in telemetry. |
| `deprecated` | yes (one major) | 0.75 | Emits notice. Removed in next major. |

Promotion PRs are usually opened by the lifecycle bot, not humans. You can request promotion manually if telemetry data backs it.

Demotion happens automatically: if a stable rule's FP rate crosses 10% sustained over 14 days, the bot opens a PR demoting it. You can defend it by adding fixtures that cover the false-positive cases and tightening the detector.

See `shared/rules/lifecycle.ts` for the exact thresholds.

---

## Per-rule semver

`ruleVersion` in the report schema is semver. **Bump it on every change**:

- **PATCH**: detector internals changed, no observable difference (refactor, perf).
- **MINOR**: detector catches more cases, no new false positives.
- **MAJOR**: id changed, severity changed, finding shape changed, or known new false positives.

This lets us hot-revert a single bad rule without a CodeMore release.

---

## When to write a `RULE_RFC.md` first

Open an issue using the `RULE_RFC.md` template (not a PR) when your rule:
- Targets a language or framework not yet in the catalog.
- Introduces a new detection technique (dataflow, taint, cross-file analysis).
- Touches the registry, schema, or lifecycle policy.
- Would change `defaultSeverity` to BLOCKER for an existing rule.

Cheap PRs get the fast path. Opinionated PRs get a discussion first so we don't waste your time.

---

## What the bot checks (and what gets you rejected)

The PR validator (`.github/workflows/rule-pr-validator.yml`) rejects PRs that fail any of:

1. **Missing artifact**: rule module, TP fixture dir, FP fixture dir, docs page, or registration not present.
2. **TP fixture does not trigger**: scanning `corpus/rules/<rule-id>/tp/` returns zero findings with `id === <rule-id>` (at least one is required).
3. **FP fixture triggers**: scanning `corpus/rules/<rule-id>/fp/` returns ≥1 finding with `id === <rule-id>`.
4. **Catalog regression**: running the full registry over the full `corpus/` raises catalog-wide FP rate above 10%.
5. **Semver not bumped**: edit to an existing rule without a version bump.
6. **Schema violation**: emitted findings don't validate against `shared/report/schema.json`.

The bot leaves a comment with the exact failing check.

---

## Maintainer review checklist

Once the bot is green, the human reviewer checks:

- [ ] Rule logic is pure and matches the docs page.
- [ ] TP fixture is the minimum repro, not contrived.
- [ ] FP fixture differs from TP only in the way that makes it correct.
- [ ] `whyItMatters` cites a real incident or a real number, not vibes.
- [ ] Confidence is honest given the detection technique.
- [ ] No `console.log` or stray debug code.

Reviewers: target 10 minutes per PR. If you're spending an hour, the bot is missing a check — file an issue to add it.

---

## Code of conduct & licensing

Contributions are MIT-licensed under the project license. By submitting a PR you confirm you have the right to license the contribution under MIT.
