BEGIN;
ALTER TABLE offers.affiliate_links ADD COLUMN source TEXT NOT NULL DEFAULT 'other' CHECK(source IN('generator','affiliate_bar','other'));
ALTER TABLE offers.affiliate_links ADD COLUMN verification_source TEXT CHECK(verification_source IN('official_generator_declared','administrator_declared'));
ALTER TABLE offers.affiliate_links ADD COLUMN confirmed_at TIMESTAMPTZ;
ALTER TABLE offers.affiliate_links ADD COLUMN confirmed_by BIGINT;
-- Existing declarations remain administrator declarations, never an API ownership verification.
UPDATE offers.affiliate_links SET verification_source='administrator_declared',confirmed_at=verified_at,confirmed_by=account_id WHERE own_link_confirmed;
CREATE TABLE offers.whatsapp_accounts (
 account_id BIGINT PRIMARY KEY, provider TEXT NOT NULL DEFAULT 'mock' CHECK(provider IN('mock','cloud','groups','web_session')),
 enabled BOOLEAN NOT NULL DEFAULT FALSE, unofficial_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
 status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN('disconnected','connecting','qr','connected','failed')),
 account_mask TEXT NOT NULL DEFAULT '', connection_epoch UUID NOT NULL DEFAULT gen_random_uuid(),
 command TEXT NOT NULL DEFAULT 'none' CHECK(command IN('none','connect','disconnect','delete_session')),
 qr_encrypted JSONB, qr_expires_at TIMESTAMPTZ, worker_id TEXT, last_seen_at TIMESTAMPTZ,
 selected_destination UUID, paused BOOLEAN NOT NULL DEFAULT TRUE, policy JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(policy)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(provider<>'web_session' OR NOT enabled OR unofficial_confirmed)
);
CREATE TABLE offers.whatsapp_destinations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id BIGINT NOT NULL REFERENCES offers.whatsapp_accounts(account_id),
 connection_epoch UUID NOT NULL, external_id TEXT NOT NULL CHECK(length(external_id) BETWEEN 5 AND 150),
 kind TEXT NOT NULL CHECK(kind IN('group','channel','individual','mock')), name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 can_send BOOLEAN NOT NULL DEFAULT FALSE, public_confirmed BOOLEAN NOT NULL DEFAULT FALSE, declared_at TIMESTAMPTZ, declared_by BIGINT,
 verified_by_admin BOOLEAN NOT NULL DEFAULT FALSE, verified_at TIMESTAMPTZ, verified_by BIGINT,
 last_test_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(account_id,connection_epoch,external_id), UNIQUE(account_id,id),
 CHECK(NOT public_confirmed OR (declared_at IS NOT NULL AND declared_by IS NOT NULL)),
 CHECK(NOT verified_by_admin OR (last_test_at IS NOT NULL AND verified_at IS NOT NULL AND verified_by IS NOT NULL))
);
ALTER TABLE offers.whatsapp_accounts ADD CONSTRAINT whatsapp_selected_destination FOREIGN KEY(account_id,selected_destination) REFERENCES offers.whatsapp_destinations(account_id,id);
CREATE TABLE offers.worker_nonces (nonce UUID PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX worker_nonce_expiry ON offers.worker_nonces(expires_at);
ALTER TABLE offers.distribution_queue DROP CONSTRAINT distribution_queue_state_check;
ALTER TABLE offers.distribution_queue ADD CONSTRAINT distribution_queue_state_check CHECK(state IN('draft','approved','affiliate_pending','queued','claimed','validating','ready','sending','sent','failed','cancelled','expired'));
ALTER TABLE offers.distribution_queue ADD COLUMN destination_id UUID;
ALTER TABLE offers.distribution_queue ADD CONSTRAINT queue_destination_account FOREIGN KEY(account_id,destination_id) REFERENCES offers.whatsapp_destinations(account_id,id);
ALTER TABLE offers.distribution_queue ADD COLUMN catalog_product_id TEXT;
ALTER TABLE offers.distribution_queue ADD COLUMN category TEXT;
ALTER TABLE offers.distribution_queue ADD COLUMN template_id TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE offers.distribution_queue ADD COLUMN message_snapshot JSONB;
ALTER TABLE offers.distribution_queue ADD COLUMN claimed_by TEXT;
ALTER TABLE offers.distribution_queue ADD COLUMN claimed_at TIMESTAMPTZ;
ALTER TABLE offers.distribution_queue ADD COLUMN lease_expires_at TIMESTAMPTZ;
ALTER TABLE offers.distribution_queue ADD COLUMN claim_token UUID;
ALTER TABLE offers.distribution_queue ADD COLUMN requires_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE offers.distribution_queue ADD COLUMN provider_message_id TEXT;
ALTER TABLE offers.distribution_queue ADD COLUMN receipt_status TEXT CHECK(receipt_status IN('sent','delivered','read','failed'));
ALTER TABLE offers.distribution_queue ADD COLUMN payload_digest TEXT;
DROP INDEX offers.queue_one_active;
-- Retain the legacy non-destination queue while allowing independent destinations.
CREATE UNIQUE INDEX queue_one_active ON offers.distribution_queue(account_id,marketplace,product_id,channel,COALESCE(destination_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE state IN('draft','approved','queued','claimed','validating','ready','sending');
CREATE INDEX delivery_due ON offers.distribution_queue(account_id,destination_id,scheduled_at) WHERE state IN('queued','ready') AND NOT requires_review;
CREATE TABLE offers.delivery_snapshots (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id BIGINT NOT NULL, queue_id UUID NOT NULL UNIQUE REFERENCES offers.distribution_queue(id),
 destination_id UUID NOT NULL, FOREIGN KEY(account_id,destination_id) REFERENCES offers.whatsapp_destinations(account_id,id),
 product_id TEXT NOT NULL, catalog_product_id TEXT, category TEXT, price_cents BIGINT NOT NULL CHECK(price_cents>0), score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
 payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'), provider_message_id TEXT NOT NULL CHECK(length(provider_message_id) BETWEEN 1 AND 250),
 sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX delivery_history ON offers.delivery_snapshots(account_id,destination_id,sent_at DESC);
CREATE INDEX delivery_catalog ON offers.delivery_snapshots(account_id,destination_id,catalog_product_id,sent_at DESC);
CREATE FUNCTION offers.immutable_delivery() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_DELIVERY'; END $$;
CREATE TRIGGER immutable_delivery BEFORE UPDATE OR DELETE ON offers.delivery_snapshots FOR EACH ROW EXECUTE FUNCTION offers.immutable_delivery();
ALTER TABLE offers.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.whatsapp_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.worker_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers.delivery_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON offers.whatsapp_accounts,offers.whatsapp_destinations,offers.worker_nonces,offers.delivery_snapshots FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION offers.immutable_delivery() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE ON offers.whatsapp_accounts FOR EACH ROW EXECUTE FUNCTION offers.audit_change();
CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE ON offers.whatsapp_destinations FOR EACH ROW EXECUTE FUNCTION offers.audit_change();
CREATE TABLE offers.whatsapp_test_permits (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id BIGINT NOT NULL REFERENCES offers.whatsapp_accounts(account_id), destination_id UUID NOT NULL,
 connection_epoch UUID NOT NULL, authorized_by BIGINT NOT NULL, authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '15 minutes',
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sending','sent','ambiguous','cancelled')), claimed_by TEXT, provider_message_id TEXT,
 FOREIGN KEY(account_id,destination_id) REFERENCES offers.whatsapp_destinations(account_id,id)
);
CREATE UNIQUE INDEX whatsapp_single_test ON offers.whatsapp_test_permits(account_id) WHERE state IN('pending','sending');
ALTER TABLE offers.whatsapp_test_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON offers.whatsapp_test_permits FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE ON offers.whatsapp_test_permits FOR EACH ROW EXECUTE FUNCTION offers.audit_change();
CREATE TABLE IF NOT EXISTS offers.schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE offers.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON offers.schema_migrations FROM PUBLIC,anon,authenticated;
INSERT INTO offers.schema_migrations(version) VALUES('20261014212846'),('20261014225957'),('20261015123227'),('20261015130223'),('20261015143843') ON CONFLICT DO NOTHING;
COMMIT;
