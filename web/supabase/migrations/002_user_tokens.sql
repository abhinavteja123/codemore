-- =============================================================================
-- Migration 002: User Tokens Table
-- =============================================================================
-- Stores OAuth tokens server-side instead of in JWT cookies.
-- Tokens are accessible only via service role (never from client).

CREATE TABLE user_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, provider)
);

-- Create index for fast lookups
CREATE INDEX user_tokens_email_provider_idx ON user_tokens(user_email, provider);

-- Enable RLS but only allow service role access
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

-- No policies = only service role can access
-- This is intentional - tokens should never be read from client
