-- False-positive fixture for vibe-supabase-rls-permissive
-- All policies here are correctly scoped. None must trigger the rule.

create table profiles (
  id uuid primary key,
  user_email text not null
);
alter table profiles enable row level security;

-- Scoped read policy.
create policy "users read own"
  on profiles for select
  using (user_email = auth.jwt()->>'email');

-- Scoped read+write policy with separate using and with check.
create policy "users update own"
  on profiles for update
  using (user_email = auth.jwt()->>'email')
  with check (user_email = auth.jwt()->>'email');

-- A comment mentioning USING (true) must NOT trigger.
-- Previously this was USING (true) but we fixed it on 2025-03-22.
create policy "safe after fix"
  on profiles for delete
  using (user_email = auth.jwt()->>'email');

-- Block comment with USING (true) inside it must also NOT trigger.
/* historical note: legacy app shipped with USING (true). do not restore. */
create policy "admin only"
  on profiles for all
  to authenticated
  using (auth.jwt() ->> 'role' = 'admin');

-- Restrictive policy. Permissive in name only — still not USING(true).
create policy "restrictive role check"
  as restrictive
  on profiles for select
  using (auth.role() = 'authenticated');
