-- Execute periodically using the database scheduler. No public maintenance endpoint.
DELETE FROM rate_limit_buckets WHERE expires_at < NOW();
DELETE FROM used_oauth_states WHERE expires_at < NOW();
DELETE FROM meli_connections WHERE session_expires_at < NOW();
