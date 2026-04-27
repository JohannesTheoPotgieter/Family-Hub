-- Connective-chat support tables (Phase 3.1).
--
-- Phase 0 already shipped threads/messages/proposals with E2E semantics.
-- This migration adds the four side tables Phase 3 needs:
--   attachments              — photo/file uploads via R2 signed URL
--   reactions                — emoji reactions on messages (per-author)
--   thread_member_settings   — per-(member,thread) mute + kid visibility
--   ai_parse_quota           — daily rate-limit counter for /api/chat/parse
--
-- All four are tenant-scoped via family_id and live under RLS.

BEGIN;

-- attachments ------------------------------------------------------------

CREATE TABLE attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  uploader_id     uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  -- Where the file lives in R2. Bucket from env, key is family-scoped.
  storage_key     text NOT NULL,
  mime_type       text NOT NULL,
  byte_size       bigint NOT NULL CHECK (byte_size >= 0),
  kind            text NOT NULL CHECK (kind IN ('image', 'video', 'doc', 'audio', 'other')),
  width           integer,
  height          integer,
  caption         text,
  -- Optional message that surfaces the attachment in a thread.
  message_id      uuid REFERENCES messages(id) ON DELETE SET NULL,
  -- Either column may be set so a photo can be the visual proof on an
  -- event ("first day of school") or a transaction ("school fees receipt").
  event_id        uuid REFERENCES internal_events(id) ON DELETE SET NULL,
  transaction_id  uuid REFERENCES transactions(id) ON DELETE SET NULL,
  bill_id         uuid REFERENCES bills(id) ON DELETE SET NULL,
  -- Moderation: when the moderation API flags an upload we hide it here
  -- rather than deleting (parents need to see the trail).
  moderation_state text NOT NULL DEFAULT 'ok' CHECK (moderation_state IN ('ok', 'flagged', 'hidden')),
  moderation_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_family_kind_idx ON attachments (family_id, kind, created_at DESC);
CREATE INDEX attachments_message_idx ON attachments (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX attachments_event_idx ON attachments (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX attachments_transaction_idx ON attachments (transaction_id) WHERE transaction_id IS NOT NULL;

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON attachments
  FOR SELECT USING (family_id = current_family_id());
CREATE POLICY tenant_isolation_modify ON attachments
  FOR ALL USING (family_id = current_family_id())
  WITH CHECK (family_id = current_family_id());

-- reactions --------------------------------------------------------------

CREATE TABLE reactions (
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, member_id, emoji)
);
CREATE INDEX reactions_message_idx ON reactions (message_id);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON reactions
  FOR SELECT USING (family_id = current_family_id());
CREATE POLICY tenant_isolation_modify ON reactions
  FOR ALL USING (family_id = current_family_id())
  WITH CHECK (family_id = current_family_id());

-- thread_member_settings -------------------------------------------------
--
-- Per-(member, thread) preferences. `kid_visible` is parent-controlled (a
-- parent can hide a thread from a kid; the kid never sees it surface).
-- `muted_until` silences notifications without removing access. Both
-- default to the friendly behaviour: visible to all members, no mute.

CREATE TABLE thread_member_settings (
  family_id    uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  thread_id    uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  muted_until  timestamptz,
  kid_visible  boolean NOT NULL DEFAULT true,
  last_read_at timestamptz,
  PRIMARY KEY (thread_id, member_id)
);
CREATE INDEX thread_member_settings_member_idx ON thread_member_settings (member_id);

ALTER TABLE thread_member_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_member_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON thread_member_settings
  FOR SELECT USING (family_id = current_family_id());
CREATE POLICY tenant_isolation_modify ON thread_member_settings
  FOR ALL USING (family_id = current_family_id())
  WITH CHECK (family_id = current_family_id());

-- ai_parse_quota ---------------------------------------------------------
--
-- Daily counter per family. Free: 60/day, Family: 300/day, Pro: 600/day.
-- One row per (family_id, day_iso). Reset job not required — we just look
-- up "today" and INSERT on miss.

CREATE TABLE ai_parse_quota (
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  day_iso    date NOT NULL,
  used_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (family_id, day_iso)
);

ALTER TABLE ai_parse_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_parse_quota FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON ai_parse_quota
  FOR SELECT USING (family_id = current_family_id());
CREATE POLICY tenant_isolation_modify ON ai_parse_quota
  FOR ALL USING (family_id = current_family_id())
  WITH CHECK (family_id = current_family_id());

COMMIT;
