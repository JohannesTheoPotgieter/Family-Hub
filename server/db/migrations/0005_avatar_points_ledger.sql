-- Avatar points ledger (Phase 2.4).
--
-- Append-only credit/debit history per member. Source rows survive task
-- deletion so the chore-mode UI can show "5 points earned this week" even
-- after a parent archives a chore. A future redeemPoints helper writes
-- negative `points` entries with source='reward_redeem'.

BEGIN;

CREATE TABLE avatar_points_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  task_id     uuid REFERENCES tasks(id) ON DELETE SET NULL,
  points      integer NOT NULL,
  source      text NOT NULL CHECK (source IN ('task_complete', 'reward_redeem', 'parent_award', 'parent_void')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX avatar_points_ledger_member_idx ON avatar_points_ledger (family_id, member_id, created_at DESC);

ALTER TABLE avatar_points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_points_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON avatar_points_ledger
  FOR SELECT USING (family_id = current_family_id());
CREATE POLICY tenant_isolation_modify ON avatar_points_ledger
  FOR ALL USING (family_id = current_family_id())
  WITH CHECK (family_id = current_family_id());

COMMIT;
