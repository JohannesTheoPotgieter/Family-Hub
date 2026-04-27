-- Row Level Security for every tenant table (Phase 0.5).
--
-- The application sets `app.current_family_id` at the start of every request
-- (see server/auth/middleware.mjs → withFamilyContext). Every policy below
-- checks `family_id = current_setting('app.current_family_id', true)::uuid`.
-- The `true` arg to current_setting means "missing → null" rather than error,
-- so unauthenticated paths simply see nothing.
--
-- A separate `app_admin` role bypasses RLS for migrations + impact reports.
-- That role's grants are intentionally NOT created here — the operator
-- provisions it manually so credentials never live in the repo.

BEGIN;

-- Helper: returns the current family id (uuid) or NULL when unset.
CREATE OR REPLACE FUNCTION current_family_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_family_id', true), '')::uuid
$$;

-- Tenant tables. Order matches the original CREATE TABLE order in 0001.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'family_members',
    'invites',
    'subscriptions',
    'audit_log',
    'calendar_connections',
    'internal_events',
    'task_lists',
    'tasks',
    'bills',
    'bank_accounts',
    'transactions',
    'budgets',
    'savings_goals',
    'planner_items',
    'debts',
    'threads',
    'proposals',
    'messages'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (family_id = current_family_id())', t
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_modify ON %I FOR ALL USING (family_id = current_family_id()) WITH CHECK (family_id = current_family_id())', t
    );
  END LOOP;
END $$;

-- `families` itself is not tenant-scoped via family_id (it IS the tenant).
-- Lock it down to the row matching the active context so a member can read
-- their own family record but not another's.
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE families FORCE ROW LEVEL SECURITY;
CREATE POLICY families_self_select ON families
  FOR SELECT USING (id = current_family_id());
CREATE POLICY families_self_modify ON families
  FOR ALL USING (id = current_family_id())
  WITH CHECK (id = current_family_id());

-- `event_attendees` doesn't carry family_id directly — pull it through the
-- parent event.
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees FORCE ROW LEVEL SECURITY;
CREATE POLICY event_attendees_via_event ON event_attendees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM internal_events e
      WHERE e.id = event_attendees.event_id
        AND e.family_id = current_family_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM internal_events e
      WHERE e.id = event_attendees.event_id
        AND e.family_id = current_family_id()
    )
  );

-- `task_completions` mirrors event_attendees: tenant-scoped via parent task.
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions FORCE ROW LEVEL SECURITY;
CREATE POLICY task_completions_via_task ON task_completions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_completions.task_id
        AND t.family_id = current_family_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_completions.task_id
        AND t.family_id = current_family_id()
    )
  );

COMMIT;
