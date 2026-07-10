-- =============================================================================
-- Migration 006: scan_artifacts — durable scan-job artifact store
-- =============================================================================
-- Vercel's serverless filesystem is read-only (mkdir under the deploy bundle
-- throws ENOENT) and per-invocation, so the old disk-based .scan-artifacts/
-- directory could never work in production: the enqueue request and the poll
-- request that processes the job may run on different lambdas. Artifacts now
-- live here. Payloads are small JSON for GitHub jobs (the access token inside
-- is AES-256-GCM encrypted by the app before insert) or a base64 zip for
-- upload jobs. Rows are deleted as soon as the job completes or fails.

CREATE TABLE IF NOT EXISTS scan_artifacts (
  job_id     text PRIMARY KEY,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Service-role access only: RLS on with no policies denies anon/authenticated;
-- the service-role key (the only thing the app server uses) bypasses RLS.
ALTER TABLE scan_artifacts ENABLE ROW LEVEL SECURITY;
