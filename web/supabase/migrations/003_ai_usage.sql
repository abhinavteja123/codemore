-- AI API usage tracking for cost monitoring
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  scan_id UUID REFERENCES scans(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_email_idx ON ai_usage(user_email);
CREATE INDEX IF NOT EXISTS ai_usage_created_at_idx ON ai_usage(created_at);
CREATE INDEX IF NOT EXISTS ai_usage_project_id_idx ON ai_usage(project_id);

-- Enable RLS
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see own AI usage"
  ON ai_usage FOR SELECT
  USING (user_email = auth.jwt()->>'email');

-- View for daily cost summary
CREATE OR REPLACE VIEW ai_daily_costs AS
SELECT
  user_email,
  DATE(created_at) AS date,
  provider,
  SUM(total_tokens) AS total_tokens,
  SUM(estimated_cost_usd) AS total_cost_usd,
  COUNT(*) AS api_calls
FROM ai_usage
GROUP BY user_email, DATE(created_at), provider;
