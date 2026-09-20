-- Shared fixed-window abuse-prevention buckets for multi-instance/serverless deployments.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key_hash varchar(64) PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
