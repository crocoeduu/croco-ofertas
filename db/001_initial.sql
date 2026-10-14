BEGIN;
CREATE TABLE IF NOT EXISTS meli_connections (
  owner_hash TEXT PRIMARY KEY CHECK (owner_hash ~ '^[a-f0-9]{64}$'),
  user_id BIGINT NOT NULL,
  access_token JSONB NOT NULL,
  refresh_token JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  session_expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT NOT NULL, bucket BIGINT NOT NULL, hits INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(key,bucket)
);
CREATE TABLE IF NOT EXISTS used_oauth_states (
  state_hash TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_expiry ON rate_limit_buckets(expires_at);
CREATE INDEX IF NOT EXISTS oauth_expiry ON used_oauth_states(expires_at);
COMMIT;
