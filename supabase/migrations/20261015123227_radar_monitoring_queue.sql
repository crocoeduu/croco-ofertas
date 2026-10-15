BEGIN;
ALTER TABLE offers.products ADD COLUMN IF NOT EXISTS catalog_id TEXT;
ALTER TABLE offers.products ADD COLUMN IF NOT EXISTS available BOOLEAN;
ALTER TABLE offers.products ADD COLUMN IF NOT EXISTS sold_quantity BIGINT;
UPDATE offers.products SET catalog_id=substring(permalink from '/p/(MLB[0-9]{6,18})') WHERE catalog_id IS NULL;
-- Keep all previously collected observations and all OAuth rows intact.
CREATE TABLE IF NOT EXISTS offers.settings (
 account_id BIGINT PRIMARY KEY, config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(config)='object'), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS offers.watchlist (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id BIGINT NOT NULL, marketplace TEXT NOT NULL DEFAULT 'mercadolivre' CHECK(marketplace IN('mercadolivre','shopee')),
 product_id TEXT NOT NULL CHECK(product_id~'^MLB[0-9]{6,18}$'), target_cents BIGINT CHECK(target_cents>0), minimum_drop INTEGER NOT NULL DEFAULT 5 CHECK(minimum_drop BETWEEN 1 AND 90),
 minimum_score INTEGER NOT NULL DEFAULT 60 CHECK(minimum_score BETWEEN 0 AND 100), free_shipping BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE,
 baseline_cents BIGINT NOT NULL CHECK(baseline_cents>0), last_checked_at TIMESTAMPTZ, next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), failures INTEGER NOT NULL DEFAULT 0 CHECK(failures>=0),
 last_error_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(account_id,marketplace,product_id)
);
CREATE INDEX IF NOT EXISTS watchlist_due ON offers.watchlist(account_id,next_check_at) WHERE active;
CREATE TABLE IF NOT EXISTS offers.notifications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id BIGINT NOT NULL, product_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('target','drop','score','affiliate_pending','affiliate_invalid','unavailable','restocked','opportunity')),
 event_key TEXT NOT NULL, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(account_id,event_key)
);
CREATE INDEX IF NOT EXISTS notifications_recent ON offers.notifications(account_id,created_at DESC);
CREATE TABLE IF NOT EXISTS offers.campaigns (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id BIGINT NOT NULL, label TEXT NOT NULL CHECK(label~'^[a-zA-Z0-9_-]{1,64}$'),
 channel TEXT NOT NULL CHECK(channel IN('site','whatsapp','telegram','instagram')), minimum_score INTEGER NOT NULL DEFAULT 60 CHECK(minimum_score BETWEEN 1 AND 100),
 category TEXT CHECK(category~'^MLB[0-9]{1,18}$'), interval_hours INTEGER NOT NULL DEFAULT 24 CHECK(interval_hours BETWEEN 1 AND 720),
 approval_mode TEXT NOT NULL DEFAULT 'manual' CHECK(approval_mode IN('manual','automatic')),
 template TEXT NOT NULL DEFAULT 'complete' CHECK(template IN('short','complete','low_price','moderate')), enabled BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(account_id,label)
);
ALTER TABLE offers.distribution_offers DROP CONSTRAINT IF EXISTS distribution_offers_state_check;
ALTER TABLE offers.distribution_offers ADD CONSTRAINT distribution_offers_state_check CHECK(state IN('candidate','approved','affiliate_pending','ready_to_send','queued','sent','expired','disabled'));
CREATE TABLE IF NOT EXISTS offers.distribution_queue (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id BIGINT NOT NULL, offer_id UUID NOT NULL REFERENCES offers.distribution_offers(id),
 marketplace TEXT NOT NULL CHECK(marketplace IN('mercadolivre','shopee')), product_id TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN('site','whatsapp','telegram','instagram')),
 affiliate_link_id UUID NOT NULL REFERENCES offers.affiliate_links(id), campaign TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN('draft','queued','validating','ready','sending','sent','failed','cancelled','expired')),
 message TEXT NOT NULL CHECK(length(message)<=6000), price_snapshot BIGINT NOT NULL CHECK(price_snapshot>0), score_snapshot INTEGER NOT NULL CHECK(score_snapshot BETWEEN 0 AND 100),
 scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), last_error_code TEXT,
 lease_until TIMESTAMPTZ, simulation_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ,
 idempotency_key TEXT NOT NULL, UNIQUE(account_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS queue_one_active ON offers.distribution_queue(account_id,marketplace,product_id,channel) WHERE state IN('draft','queued','validating','ready','sending');
CREATE INDEX IF NOT EXISTS queue_due ON offers.distribution_queue(account_id,scheduled_at) WHERE state IN('queued','ready');
CREATE TABLE IF NOT EXISTS offers.jobs (
 account_id BIGINT NOT NULL, name TEXT NOT NULL, lease_id UUID, lease_until TIMESTAMPTZ, last_started_at TIMESTAMPTZ, last_finished_at TIMESTAMPTZ,
 last_error_code TEXT, processed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(account_id,name)
);
CREATE TABLE IF NOT EXISTS offers.audit_log (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, account_id BIGINT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_recent ON offers.audit_log(account_id,created_at DESC);
CREATE OR REPLACE FUNCTION offers.audit_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,offers AS $$
BEGIN
 INSERT INTO offers.audit_log(account_id,entity,entity_id,action) VALUES(NEW.account_id,TG_TABLE_NAME,COALESCE(to_jsonb(NEW)->>'id',NEW.account_id::text),TG_OP);
 RETURN NEW;
END $$;
ALTER TABLE offers.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.distribution_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.audit_log ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE tab TEXT; BEGIN
 FOREACH tab IN ARRAY ARRAY['settings','watchlist','notifications','campaigns','distribution_queue','jobs','audit_log'] LOOP
  EXECUTE format('ALTER TABLE offers.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON offers.%I FROM PUBLIC,anon,authenticated',tab);
 END LOOP;
 FOREACH tab IN ARRAY ARRAY['affiliate_links','distribution_offers','settings','campaigns','watchlist','distribution_queue'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='audit_changes' AND tgrelid=format('offers.%I',tab)::regclass) THEN
   EXECUTE format('CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE ON offers.%I FOR EACH ROW EXECUTE FUNCTION offers.audit_change()',tab);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION offers.audit_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA offers FROM PUBLIC,anon,authenticated;
COMMIT;
