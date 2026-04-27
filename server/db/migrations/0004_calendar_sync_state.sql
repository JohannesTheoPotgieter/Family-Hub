-- Sync state for two-way calendar sync (Phase 1.5 closeout).
--
-- Each connection tracks one provider-specific sync cursor. Google uses an
-- opaque `nextSyncToken` from events.list; Microsoft uses the deltaLink URL
-- from /me/calendarView/delta. Storing both as text keeps the column type
-- common.

BEGIN;

ALTER TABLE calendar_connections
  ADD COLUMN sync_token       text,
  ADD COLUMN sync_resource_id text,        -- Google watch channel resource id
  ADD COLUMN sync_channel_id  text,        -- our minted channel id
  ADD COLUMN sync_channel_expires_at timestamptz;

COMMIT;
