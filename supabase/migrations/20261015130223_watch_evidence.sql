BEGIN;
ALTER TABLE offers.watchlist ADD COLUMN IF NOT EXISTS last_score INTEGER CHECK(last_score BETWEEN 0 AND 100);
ALTER TABLE offers.watchlist ADD COLUMN IF NOT EXISTS last_available BOOLEAN;
ALTER TABLE offers.watchlist ADD COLUMN IF NOT EXISTS last_price_cents BIGINT CHECK(last_price_cents>0);
COMMIT;
