-- True-positive fixture for vibe-supabase-rls-permissive
-- Five permissive clauses across four policies. The rule MUST flag all five.

create table profiles (id uuid primary key);
alter table profiles enable row level security;

create policy "anyone reads profiles"
  on profiles for select
  using (true);

create policy "anyone writes profiles"
  on profiles for insert
  with check (true);

create policy "wide open"
  on profiles for all
  using (true)
  with check (true);

create table posts (id uuid primary key);
alter table posts enable row level security;

-- Variation: uppercase TRUE, single line, extra whitespace.
create policy "case_variant" on posts for select using ( TRUE );
