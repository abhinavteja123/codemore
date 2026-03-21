-- CodeMore Database Schema
-- Run this in Supabase SQL Editor to set up your database

-- Projects table
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  name text not null,
  source text not null check (source in ('upload', 'github')),
  repo_full_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Scans table (analysis history)
create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  overall_score numeric not null default 0,
  files_analyzed integer not null default 0,
  total_files integer not null default 0,
  lines_of_code integer not null default 0,
  avg_complexity numeric not null default 0,
  tech_debt_minutes integer not null default 0,
  issues_by_severity jsonb not null default '{}',
  issues_by_category jsonb not null default '{}',
  issue_count integer not null default 0,
  scanned_at timestamptz default now()
);

-- Issues table (per scan)
create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null,
  severity text not null,
  file_path text not null,
  line_start integer not null default 0,
  line_end integer not null default 0,
  col_start integer not null default 0,
  col_end integer not null default 0,
  code_snippet text default '',
  confidence integer not null default 0,
  impact integer not null default 0,
  created_at timestamptz default now()
);

-- Generated fix suggestions (per issue on latest or historical scans)
create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text not null,
  original_code text not null default '',
  suggested_code text not null default '',
  diff text not null default '',
  location jsonb not null default '{}',
  confidence integer not null default 0,
  impact integer not null default 0,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Persisted project files for DB-backed project detail and re-analysis
create table if not exists project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  path text not null,
  content text not null,
  language text not null,
  size integer not null default 0,
  created_at timestamptz default now()
);

-- Scan jobs table (server-driven scan orchestration / audit trail)
create table if not exists scan_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  source_type text not null check (source_type in ('upload', 'github')),
  source_label text not null,
  files_discovered integer not null default 0,
  files_analyzed integer not null default 0,
  issue_count integer not null default 0,
  error_message text,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Indexes for performance
create index if not exists idx_projects_user on projects(user_email);
create index if not exists idx_scans_project on scans(project_id);
create index if not exists idx_scans_date on scans(scanned_at desc);
create index if not exists idx_issues_scan on issues(scan_id);
create index if not exists idx_issues_project on issues(project_id);
create index if not exists idx_issues_severity on issues(severity);
create index if not exists idx_suggestions_issue on suggestions(issue_id);
create index if not exists idx_suggestions_project on suggestions(project_id);
create index if not exists idx_project_files_project on project_files(project_id);
create unique index if not exists idx_project_files_project_path on project_files(project_id, path);
create index if not exists idx_scan_jobs_project on scan_jobs(project_id);
create index if not exists idx_scan_jobs_created on scan_jobs(created_at desc);

-- Row-level security policies
alter table projects enable row level security;
alter table scans enable row level security;
alter table issues enable row level security;
alter table suggestions enable row level security;
alter table project_files enable row level security;
alter table scan_jobs enable row level security;

drop policy if exists "Users manage own projects" on projects;
drop policy if exists "Users manage own scans" on scans;
drop policy if exists "Users manage own issues" on issues;
drop policy if exists "Users manage own suggestions" on suggestions;
drop policy if exists "Users manage own project files" on project_files;
drop policy if exists "Users manage own scan jobs" on scan_jobs;

-- These policies are only for direct client access.
-- Server-side API routes use the service role key and bypass RLS intentionally.
create policy "Users manage own projects" on projects
  for all to authenticated
  using (lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "Users manage own scans" on scans
  for all to authenticated
  using (
    exists (
      select 1
      from projects
      where projects.id = scans.project_id
        and lower(projects.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    exists (
      select 1
      from projects
      where projects.id = scans.project_id
        and lower(projects.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "Users manage own issues" on issues
  for all to authenticated
  using (
    exists (
      select 1
      from projects
      where projects.id = issues.project_id
        and lower(projects.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    exists (
      select 1
      from projects
      where projects.id = issues.project_id
        and lower(projects.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "Users manage own suggestions" on suggestions
  for all to authenticated
  using (
    exists (
      select 1
      from projects
      where projects.id = suggestions.project_id
        and lower(projects.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    exists (
      select 1
      from projects
      where projects.id = suggestions.project_id
        and lower(projects.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "Users manage own project files" on project_files
  for all to authenticated
  using (
    exists (
      select 1
      from projects
      where projects.id = project_files.project_id
        and lower(projects.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    exists (
      select 1
      from projects
      where projects.id = project_files.project_id
        and lower(projects.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "Users manage own scan jobs" on scan_jobs
  for all to authenticated
  using (
    exists (
      select 1
      from projects
      where projects.id = scan_jobs.project_id
        and lower(projects.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    exists (
      select 1
      from projects
      where projects.id = scan_jobs.project_id
        and lower(projects.user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
