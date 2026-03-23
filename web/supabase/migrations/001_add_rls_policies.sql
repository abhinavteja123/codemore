-- =============================================================================
-- Migration 001: Add Row Level Security Policies
-- =============================================================================
-- This migration enables RLS on all user-facing tables to ensure users
-- can only access their own data.

-- Projects table RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see own projects"
  ON projects FOR SELECT
  USING (user_email = auth.jwt()->>'email');

CREATE POLICY "Users can only insert own projects"
  ON projects FOR INSERT
  WITH CHECK (user_email = auth.jwt()->>'email');

CREATE POLICY "Users can only update own projects"
  ON projects FOR UPDATE
  USING (user_email = auth.jwt()->>'email');

CREATE POLICY "Users can only delete own projects"
  ON projects FOR DELETE
  USING (user_email = auth.jwt()->>'email');

-- Scans table RLS
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see own scans"
  ON scans FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "Users can insert scans for own projects"
  ON scans FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE user_email = auth.jwt()->>'email'
    )
  );

-- Issues table RLS
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see own issues"
  ON issues FOR SELECT
  USING (
    scan_id IN (
      SELECT s.id FROM scans s
      JOIN projects p ON s.project_id = p.id
      WHERE p.user_email = auth.jwt()->>'email'
    )
  );

-- Suggestions table RLS
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see own suggestions"
  ON suggestions FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_email = auth.jwt()->>'email'
    )
  );
