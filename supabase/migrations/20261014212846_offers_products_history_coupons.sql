BEGIN;
-- Isolated from OAuth tables. Node pg uses the existing private database connection.
CREATE SCHEMA IF NOT EXISTS offers;
REVOKE ALL ON SCHEMA offers FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS offers.products (
  owner_hash TEXT NOT NULL REFERENCES public.meli_connections(owner_hash) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider='mercadolivre'),
  product_id TEXT NOT NULL CHECK (product_id ~ '^MLB[0-9]{6,18}$'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
  price_cents BIGINT NOT NULL CHECK (price_cents BETWEEN 1 AND 100000000000),
  currency TEXT NOT NULL CHECK (currency='BRL'),
  previous_price_cents BIGINT CHECK (previous_price_cents BETWEEN 1 AND 100000000000),
  permalink TEXT NOT NULL,
  image_url TEXT,
  category TEXT,
  condition TEXT NOT NULL CHECK (condition IN ('new','used','not_specified')),
  free_shipping BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(owner_hash,provider,product_id)
);

CREATE TABLE IF NOT EXISTS offers.price_observations (
  owner_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  product_id TEXT NOT NULL,
  bucket BIGINT NOT NULL,
  price_cents BIGINT NOT NULL CHECK (price_cents BETWEEN 1 AND 100000000000),
  currency TEXT NOT NULL CHECK (currency='BRL'),
  condition TEXT NOT NULL CHECK (condition IN ('new','used','not_specified')),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(owner_hash,provider,product_id,bucket),
  FOREIGN KEY(owner_hash,provider,product_id) REFERENCES offers.products(owner_hash,provider,product_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS observations_lookup ON offers.price_observations(owner_hash,provider,product_id,observed_at DESC);

CREATE TABLE IF NOT EXISTS offers.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash TEXT NOT NULL REFERENCES public.meli_connections(owner_hash) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[A-Z0-9_-]{3,40}$'),
  kind TEXT NOT NULL CHECK (kind IN ('percent','fixed')),
  amount_units BIGINT NOT NULL CHECK (amount_units BETWEEN 1 AND 100000000000 AND (kind<>'percent' OR amount_units<=10000)),
  minimum_purchase_cents BIGINT NOT NULL DEFAULT 0 CHECK (minimum_purchase_cents BETWEEN 0 AND 100000000000),
  maximum_discount_cents BIGINT CHECK (maximum_discount_cents BETWEEN 1 AND 100000000000),
  product_id TEXT CHECK (product_id ~ '^MLB[0-9]{6,18}$'),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at>starts_at),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source='manual'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS coupons_owner_expiry ON offers.coupons(owner_hash,expires_at);

ALTER TABLE offers.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.coupons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA offers FROM PUBLIC, anon, authenticated;
COMMIT;
