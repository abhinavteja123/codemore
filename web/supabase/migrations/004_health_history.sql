-- Health score history for trend tracking
CREATE TABLE IF NOT EXISTS health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  health_score INTEGER NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
  blocker_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  major_count INTEGER NOT NULL DEFAULT 0,
  minor_count INTEGER NOT NULL DEFAULT 0,
  info_count INTEGER NOT NULL DEFAULT 0,
  total_issues INTEGER NOT NULL DEFAULT 0,
  files_analyzed INTEGER NOT NULL DEFAULT 0,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_history_project_scanned_idx
  ON health_history(project_id, scanned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS health_history_scan_id_idx
  ON health_history(scan_id);

ALTER TABLE health_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see own health history"
  ON health_history FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE user_email = auth.jwt()->>'email'
    )
  );
