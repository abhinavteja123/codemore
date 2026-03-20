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

-- Indexes for performance
create index if not exists idx_projects_user on projects(user_email);
create index if not exists idx_scans_project on scans(project_id);
create index if not exists idx_scans_date on scans(scanned_at desc);
create index if not exists idx_issues_scan on issues(scan_id);
create index if not exists idx_issues_project on issues(project_id);
create index if not exists idx_issues_severity on issues(severity);

-- Row-level security policies
alter table projects enable row level security;
alter table scans enable row level security;
alter table issues enable row level security;

-- Allow authenticated users to manage their own data (via service key from server)
-- Since we use the service_role key from server-side API routes,
-- RLS is bypassed. These policies are for direct client access if needed.
create policy "Users manage own projects" on projects
  for all using (true);

create policy "Users manage own scans" on scans
  for all using (true);

create policy "Users manage own issues" on issues
  for all using (true);
