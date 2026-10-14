BEGIN;

CREATE TABLE IF NOT EXISTS offers.affiliate_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id BIGINT NOT NULL,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('mercadolivre','shopee')),
  product_id TEXT NOT NULL CHECK (length(product_id) BETWEEN 6 AND 40),
  original_url TEXT NOT NULL CHECK (length(original_url) <= 2048 AND original_url LIKE 'https://%'),
  affiliate_url TEXT NOT NULL CHECK (length(affiliate_url) <= 2048 AND affiliate_url LIKE 'https://%'),
  channel TEXT NOT NULL CHECK (channel IN ('site','whatsapp','instagram','telegram','generic')),
  label TEXT NOT NULL DEFAULT '' CHECK (label ~ '^[a-zA-Z0-9_-]{0,64}$'),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('verified','pending','invalid','disabled')),
  provenance TEXT NOT NULL DEFAULT 'administrator_registered' CHECK (provenance='administrator_registered'),
  own_link_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status <> 'verified' OR (own_link_confirmed AND verified_at IS NOT NULL)),
  UNIQUE (account_id, marketplace, product_id, channel, label)
);
CREATE INDEX IF NOT EXISTS affiliate_lookup ON offers.affiliate_links (account_id,marketplace,product_id,channel) WHERE status='verified';

CREATE TABLE IF NOT EXISTS offers.affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_link_id UUID NOT NULL REFERENCES offers.affiliate_links(id),
  product_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('site','whatsapp','instagram','telegram','generic')),
  campaign TEXT NOT NULL DEFAULT '' CHECK (campaign ~ '^[a-zA-Z0-9_-]{0,64}$'),
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS affiliate_click_time ON offers.affiliate_clicks (affiliate_link_id,clicked_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_click_channel ON offers.affiliate_clicks (channel,clicked_at DESC);

CREATE TABLE IF NOT EXISTS offers.affiliate_channels (
  account_id BIGINT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('site','whatsapp','instagram','telegram')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  public_channel BOOLEAN NOT NULL DEFAULT FALSE,
  declared_in_program BOOLEAN NOT NULL DEFAULT FALSE,
  minimum_score INTEGER NOT NULL DEFAULT 60 CHECK (minimum_score BETWEEN 1 AND 100),
  resend_hours INTEGER NOT NULL DEFAULT 24 CHECK (resend_hours BETWEEN 1 AND 720),
  price_drop_percent INTEGER NOT NULL DEFAULT 5 CHECK (price_drop_percent BETWEEN 1 AND 90),
  score_increase INTEGER NOT NULL DEFAULT 10 CHECK (score_increase BETWEEN 1 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id,channel),
  CHECK (NOT enabled OR (public_channel AND declared_in_program))
);

CREATE TABLE IF NOT EXISTS offers.distribution_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id BIGINT NOT NULL,
  owner_hash TEXT NOT NULL REFERENCES public.meli_connections(owner_hash) ON DELETE CASCADE,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('mercadolivre','shopee')),
  product_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('site','whatsapp','instagram','telegram')),
  campaign TEXT NOT NULL DEFAULT '' CHECK (campaign ~ '^[a-zA-Z0-9_-]{0,64}$'),
  state TEXT NOT NULL DEFAULT 'candidate' CHECK (state IN ('candidate','approved','affiliate_pending','ready_to_send','sent','disabled')),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  affiliate_link_id UUID REFERENCES offers.affiliate_links(id),
  price_cents BIGINT NOT NULL CHECK (price_cents > 0),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  revalidated_at TIMESTAMPTZ,
  available BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT,
  reasons JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (state <> 'ready_to_send' OR (approved AND available AND affiliate_link_id IS NOT NULL AND revalidated_at IS NOT NULL AND message IS NOT NULL)),
  UNIQUE (account_id,marketplace,product_id,channel,campaign)
);
CREATE INDEX IF NOT EXISTS distribution_state ON offers.distribution_offers (account_id,state,updated_at DESC);

CREATE TABLE IF NOT EXISTS offers.distribution_history (
  account_id BIGINT NOT NULL,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('mercadolivre','shopee')),
  product_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('site','whatsapp','instagram','telegram')),
  last_sent_at TIMESTAMPTZ NOT NULL,
  last_sent_price BIGINT NOT NULL CHECK (last_sent_price > 0),
  last_sent_score INTEGER NOT NULL CHECK (last_sent_score BETWEEN 0 AND 100),
  verified_coupon_id UUID,
  PRIMARY KEY (account_id,marketplace,product_id,channel)
);

ALTER TABLE offers.affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.affiliate_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.distribution_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.distribution_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON offers.affiliate_links, offers.affiliate_clicks, offers.affiliate_channels, offers.distribution_offers, offers.distribution_history FROM PUBLIC, anon, authenticated;

COMMIT;
