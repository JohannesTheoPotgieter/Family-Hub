-- Push notification subscriptions (Phase 0.9).
--
-- One row per (member, browser endpoint). The endpoint is the unique key —
-- if a user reinstalls the PWA the new subscription replaces the old one.

BEGIN;

CREATE TABLE push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_member_idx ON push_subscriptions (member_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON push_subscriptions
  FOR SELECT USING (family_id = current_family_id());
CREATE POLICY tenant_isolation_modify ON push_subscriptions
  FOR ALL USING (family_id = current_family_id())
  WITH CHECK (family_id = current_family_id());

COMMIT;
