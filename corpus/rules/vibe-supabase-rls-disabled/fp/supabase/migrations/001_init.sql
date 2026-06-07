-- False-positive fixture for vibe-supabase-rls-disabled
-- Two tables, both have RLS enabled in the same file. The rule must NOT flag either.
-- Also exercises: schema-qualified names, IF NOT EXISTS, quoted identifiers,
-- and a TEMP table which the rule should always skip.

create table public.profiles (
  id uuid primary key,
  user_email text not null
);

alter table public.profiles enable row level security;

create policy "users read own profile"
  on public.profiles for select
  using (user_email = auth.jwt()->>'email');

create table if not exists "Posts" (
  id uuid primary key,
  author_id uuid references public.profiles(id)
);

alter table "Posts" enable row level security;

create policy "authors read own posts"
  on "Posts" for select
  using (author_id = (select id from public.profiles where user_email = auth.jwt()->>'email'));

-- Temp tables should never be flagged.
create temp table scratch (id int);
