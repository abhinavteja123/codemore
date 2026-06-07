-- True-positive fixture for vibe-supabase-rls-disabled
-- Two tables, neither has RLS enabled. The rule must flag both.

create table profiles (
  id uuid primary key,
  user_email text not null,
  display_name text
);

create table if not exists posts (
  id uuid primary key,
  author_id uuid references profiles(id),
  body text
);
