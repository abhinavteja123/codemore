-- =============================================================================
-- Migration 007: rule_events — per-rule telemetry verdicts for the
-- beta→stable promotion flywheel
-- =============================================================================
-- One row per rule verdict, fanned out by /api/telemetry from each opt-in
-- ping. Stores ONLY: rule id, verdict, tool version, timestamp. No file
-- paths, no code content, no snippets, no fingerprints — the endpoint's
-- strict Zod schema is the privacy contract and rejects anything
-- content-shaped before this insert can happen.
--
-- Verdict semantics (derived from each ping's per-rule vote/context):
--   tp         — vote 'up', or context 'resolved' (user accepted + fixed it)
--   fp         — vote 'down'
--   suppressed — context 'suppressed'
-- Plain 'fired' entries with no vote carry no verdict and are NOT stored
-- here; they stay in telemetry_pings (migration 005).

CREATE TABLE IF NOT EXISTS rule_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_id      text NOT NULL,
  verdict      text NOT NULL CHECK (verdict IN ('tp', 'fp', 'suppressed')),
  tool_version text NOT NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

-- The promotion/demotion report aggregates per rule over a trailing window.
CREATE INDEX IF NOT EXISTS rule_events_rule_time_idx
  ON rule_events (rule_id, occurred_at DESC);

-- Service-role access only: RLS on with no policies denies anon/authenticated;
-- the service-role key (the only thing the app server uses) bypasses RLS.
ALTER TABLE rule_events ENABLE ROW LEVEL SECURITY;

-- Aggregate view — per-rule verdict counts over the trailing 30 days.
-- Exposes counts only (same posture as telemetry_pings_aggregate in 005).
-- Consumed by scripts/telemetry-report.js and the nightly
-- .github/workflows/auto-demote-rules.yml via the service-role key.
CREATE OR REPLACE VIEW rule_events_stats_30d AS
SELECT
  rule_id,
  count(*)                                       AS events,
  count(*) FILTER (WHERE verdict = 'tp')         AS tp,
  count(*) FILTER (WHERE verdict = 'fp')         AS fp,
  count(*) FILTER (WHERE verdict = 'suppressed') AS suppressed
FROM rule_events
WHERE occurred_at > now() - interval '30 days'
GROUP BY rule_id;

COMMENT ON TABLE rule_events IS
  'Per-rule telemetry verdicts (tp/fp/suppressed). Powers beta->stable '
  'promotion reports and the nightly auto-demote review workflow. '
  'Contains no paths, content, or fingerprints.';
