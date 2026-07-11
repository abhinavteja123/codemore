# vibe-supabase-rls-disabled

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER | beta | 0.85 |

**Pack:** `vibe-supabase`

## What it catches

`CREATE TABLE` statements in SQL files that are not paired with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` **in the same file**.

## Why it matters

The Supabase anon key is shipped to the browser. Any reader of the bundled JavaScript can use it to read or write rows in tables that have no Row Level Security policy.

- **CVE-2025-48757** (March 2025, CVSS 9.3) affected 170+ production Lovable apps in a single weekend through this exact class of bug.
- A community audit of 50 vibe-coded apps found **70%** had RLS completely disabled (DEV, 2026).
- The Lovable EdTech leak exposed 18,697 student records, including 4,538 university accounts.

If you ship a Supabase table without RLS, the anon key in your client bundle is effectively a public read/write API for that table.

## Example: failing code

```sql
create table profiles (
  id uuid primary key,
  user_email text not null
);
```

The rule reports a BLOCKER on the `create table` line.

## Example: how to fix

```sql
create table profiles (
  id uuid primary key,
  user_email text not null
);

alter table profiles enable row level security;

create policy "users read own profile"
  on profiles for select
  using (user_email = auth.jwt()->>'email');

create policy "users update own profile"
  on profiles for update
  using (user_email = auth.jwt()->>'email');
```

Two things matter:

1. `ENABLE ROW LEVEL SECURITY` turns RLS on. Without a policy, all access is denied — that is safe but unusable.
2. Add at least one `CREATE POLICY` that scopes rows to the authenticated user. **Do not use `USING (true)`** — that is equivalent to having no RLS.

## Known limitations

This rule scans **one file at a time**. If you enable RLS in a later migration file (for example `002_security.sql`), this rule will still flag the `create table` from the earlier migration.

Workarounds:

- Recommended: enable RLS in the same migration that creates the table. It is the safer pattern anyway — a deploy that runs the create migration but fails the RLS migration leaves the table publicly readable.
- If you must split them, suppress the rule for that file:
  ```sql
  /* codemore-ignore-file: vibe-supabase-rls-disabled */
  ```

Cross-migration analysis will land when the registry exposes a project-wide context API (tracked under the registry roadmap).

## Suppression

```sql
-- codemore-ignore: vibe-supabase-rls-disabled
create table public_announcements (id uuid primary key, body text);
```

Or file-wide:

```sql
/* codemore-ignore-file: vibe-supabase-rls-disabled */
```

The suppression parser recognises `--` (SQL), `#` (Python/shell/YAML), and `//` (JS/TS) as single-line comment leaders, and `/* ... */` for file-wide directives across all languages.

## How to verify the fix

The rule's `verificationCriteria` (read by the AI agent applying the fix) require:

1. Migration file contains `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY` (case-insensitive).
2. At least one `CREATE POLICY` exists for the table.
3. Re-scan reports `vibe-supabase-rls-disabled` resolved for the file.

## References

- [Supabase: Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [CVE-2025-48757](https://nvd.nist.gov/vuln/detail/CVE-2025-48757)
- [VibeEval — Lovable Security Report, Feb 2026](https://vibe-eval.com/updates/lovable-security-report-feb-2026/)
- [DEV — I Audited 50 Vibe-Coded Apps. Here's What Broke.](https://dev.to/rishabh_kumar_6d865c83a4d/i-audited-50-vibe-coded-apps-heres-what-broke-1pb6)
