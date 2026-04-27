-- Family-Hub initial schema (Phase 0.1 + 0.11)
-- Postgres 15+. Run as a transaction. RLS policies are added in 0002.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- families ---------------------------------------------------------------

CREATE TABLE families (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  owner_user_id            uuid NOT NULL,
  locale                   text NOT NULL DEFAULT 'GLOBAL' CHECK (locale IN ('ZA', 'GLOBAL')),
  province                 text,
  loadshedding_area_code   text,
  tax_year_start_month     smallint NOT NULL DEFAULT 1 CHECK (tax_year_start_month BETWEEN 1 AND 12),
  plan                     text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'family', 'family_pro')),
  trial_ends_at            timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE family_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id       uuid,
  display_name  text NOT NULL,
  role_key      text NOT NULL CHECK (role_key IN ('parent_admin', 'adult_editor', 'child_limited')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'removed')),
  avatar_key    text,
  pin_hash      text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX family_members_family_idx ON family_members (family_id);
CREATE UNIQUE INDEX family_members_user_idx ON family_members (family_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  email               text NOT NULL,
  role_key            text NOT NULL CHECK (role_key IN ('parent_admin', 'adult_editor', 'child_limited')),
  token_hash          text NOT NULL,
  invited_by_member_id uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  accepted_at         timestamptz
);
CREATE INDEX invites_family_idx ON invites (family_id);
CREATE UNIQUE INDEX invites_token_idx ON invites (token_hash);

CREATE TABLE subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  stripe_customer_id       text NOT NULL,
  stripe_subscription_id   text,
  plan                     text NOT NULL DEFAULT 'free',
  status                   text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  current_period_end       timestamptz,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscriptions_family_idx ON subscriptions (family_id);
CREATE UNIQUE INDEX subscriptions_stripe_customer_idx ON subscriptions (stripe_customer_id);

CREATE TABLE audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  actor_member_id  uuid REFERENCES family_members(id) ON DELETE SET NULL,
  action           text NOT NULL,
  entity_kind      text NOT NULL,
  entity_id        uuid,
  diff             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_family_created_idx ON audit_log (family_id, created_at DESC);

-- calendar ---------------------------------------------------------------

CREATE TABLE calendar_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id               uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id               uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  provider                text NOT NULL CHECK (provider IN ('google', 'microsoft', 'caldav', 'ics')),
  account_label           text,
  tokens_encrypted        bytea,
  last_synced_at          timestamptz,
  sync_watch_channel_id   text,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calendar_connections_family_idx ON calendar_connections (family_id);

CREATE TABLE internal_events (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  calendar_connection_id   uuid REFERENCES calendar_connections(id) ON DELETE SET NULL,
  external_id              text,
  title                    text NOT NULL,
  description              text,
  location                 text,
  starts_at                timestamptz NOT NULL,
  ends_at                  timestamptz NOT NULL,
  all_day                  boolean NOT NULL DEFAULT false,
  rrule_text               text,
  recurrence_parent_id     uuid REFERENCES internal_events(id) ON DELETE CASCADE,
  etag                     text,
  last_modified_remote     timestamptz,
  thread_id                uuid, -- FK added after threads table created
  created_by_member_id     uuid REFERENCES family_members(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);
CREATE INDEX internal_events_family_starts_idx ON internal_events (family_id, starts_at);
CREATE UNIQUE INDEX internal_events_external_idx ON internal_events (calendar_connection_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE event_attendees (
  event_id      uuid NOT NULL REFERENCES internal_events(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  rsvp          text NOT NULL DEFAULT 'pending' CHECK (rsvp IN ('pending', 'yes', 'no', 'maybe')),
  is_organizer  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (event_id, member_id)
);

-- tasks ------------------------------------------------------------------

CREATE TABLE task_lists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name         text NOT NULL,
  ordinal      integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_lists_family_idx ON task_lists (family_id, ordinal);

CREATE TABLE tasks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id            uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  list_id              uuid REFERENCES task_lists(id) ON DELETE SET NULL,
  parent_task_id       uuid REFERENCES tasks(id) ON DELETE CASCADE,
  title                text NOT NULL,
  notes                text,
  owner_member_id      uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  shared               boolean NOT NULL DEFAULT false,
  due_date             date,
  recurrence           text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'custom')),
  rrule_text           text,
  priority             text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  reward_points        integer NOT NULL DEFAULT 0,
  completed            boolean NOT NULL DEFAULT false,
  completion_count     integer NOT NULL DEFAULT 0,
  last_completed_at    timestamptz,
  archived             boolean NOT NULL DEFAULT false,
  thread_id            uuid,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_family_idx ON tasks (family_id);
CREATE INDEX tasks_owner_idx ON tasks (family_id, owner_member_id);

CREATE TABLE task_completions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  completed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_completions_task_idx ON task_completions (task_id, completed_at DESC);

-- money ------------------------------------------------------------------

CREATE TABLE bills (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                 uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title                     text NOT NULL,
  amount_cents              bigint NOT NULL,
  currency                  text NOT NULL DEFAULT 'ZAR',
  due_date                  date NOT NULL,
  category                  text NOT NULL DEFAULT 'Other',
  paid                      boolean NOT NULL DEFAULT false,
  paid_date                 date,
  proof_file_key            text,
  notes                     text,
  recurrence                text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'monthly')),
  recurrence_day            smallint CHECK (recurrence_day IS NULL OR recurrence_day BETWEEN 1 AND 31),
  generated_from_bill_id    uuid REFERENCES bills(id) ON DELETE SET NULL,
  auto_create_transaction   boolean NOT NULL DEFAULT true,
  linked_transaction_id     uuid,
  thread_id                 uuid,
  created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bills_family_due_idx ON bills (family_id, due_date);

CREATE TABLE bank_accounts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id              uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  provider               text NOT NULL CHECK (provider IN ('stitch', 'plaid', 'truelayer', 'manual')),
  external_account_id    text,
  account_label          text NOT NULL,
  currency               text NOT NULL DEFAULT 'ZAR',
  last_balance_cents     bigint,
  last_synced_at         timestamptz,
  tokens_encrypted       bytea
);
CREATE INDEX bank_accounts_family_idx ON bank_accounts (family_id);

CREATE TABLE transactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id               uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title                   text NOT NULL,
  amount_cents            bigint NOT NULL,
  currency                text NOT NULL DEFAULT 'ZAR',
  tx_date                 date NOT NULL,
  kind                    text NOT NULL CHECK (kind IN ('inflow', 'outflow')),
  category                text NOT NULL DEFAULT 'Other',
  notes                   text,
  source                  text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'bill', 'statement', 'bank_link')),
  source_bill_id          uuid REFERENCES bills(id) ON DELETE SET NULL,
  statement_import_id     uuid,
  statement_file_name     text,
  bank_account_id         uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  thread_id               uuid,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_family_date_idx ON transactions (family_id, tx_date DESC);

ALTER TABLE bills
  ADD CONSTRAINT bills_linked_transaction_fkey
  FOREIGN KEY (linked_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;

CREATE TABLE budgets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  month_iso     text NOT NULL CHECK (month_iso ~ '^\d{4}-\d{2}$'),
  category      text NOT NULL,
  limit_cents   bigint NOT NULL CHECK (limit_cents >= 0),
  currency      text NOT NULL DEFAULT 'ZAR',
  thread_id     uuid
);
CREATE UNIQUE INDEX budgets_family_month_category_idx ON budgets (family_id, month_iso, category);

CREATE TABLE savings_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title         text NOT NULL,
  target_cents  bigint NOT NULL CHECK (target_cents >= 0),
  saved_cents   bigint NOT NULL DEFAULT 0 CHECK (saved_cents >= 0),
  currency      text NOT NULL DEFAULT 'ZAR',
  target_date   date,
  thread_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX savings_goals_family_idx ON savings_goals (family_id);

CREATE TABLE planner_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  category              text NOT NULL,
  description           text NOT NULL,
  kind                  text NOT NULL CHECK (kind IN ('income', 'expense')),
  is_fixed              boolean NOT NULL DEFAULT true,
  monthly_overrides     jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_amount_cents  bigint NOT NULL DEFAULT 0,
  currency              text NOT NULL DEFAULT 'ZAR',
  is_active             boolean NOT NULL DEFAULT true
);
CREATE INDEX planner_items_family_idx ON planner_items (family_id);

CREATE TABLE debts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id          uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title              text NOT NULL,
  principal_cents    bigint NOT NULL CHECK (principal_cents >= 0),
  apr_bps            integer NOT NULL CHECK (apr_bps >= 0),
  min_payment_cents  bigint NOT NULL CHECK (min_payment_cents >= 0),
  currency           text NOT NULL DEFAULT 'ZAR',
  strategy           text NOT NULL DEFAULT 'avalanche' CHECK (strategy IN ('avalanche', 'snowball')),
  paid_off           boolean NOT NULL DEFAULT false,
  thread_id          uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX debts_family_idx ON debts (family_id);

-- connective chat (Phase 0.11) -------------------------------------------

CREATE TABLE threads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('family', 'direct', 'object')),
  entity_kind       text CHECK (entity_kind IN ('event', 'task', 'bill', 'transaction', 'budget', 'savings_goal', 'debt')),
  entity_id         uuid,
  direct_member_a   uuid REFERENCES family_members(id) ON DELETE CASCADE,
  direct_member_b   uuid REFERENCES family_members(id) ON DELETE CASCADE,
  e2e_encrypted     boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'family' AND entity_kind IS NULL AND entity_id IS NULL AND direct_member_a IS NULL AND direct_member_b IS NULL) OR
    (kind = 'direct' AND entity_kind IS NULL AND entity_id IS NULL AND direct_member_a IS NOT NULL AND direct_member_b IS NOT NULL AND direct_member_a < direct_member_b) OR
    (kind = 'object' AND entity_kind IS NOT NULL AND entity_id IS NOT NULL AND direct_member_a IS NULL AND direct_member_b IS NULL)
  )
);
CREATE UNIQUE INDEX threads_family_singleton_idx ON threads (family_id) WHERE kind = 'family';
CREATE UNIQUE INDEX threads_direct_pair_idx ON threads (family_id, direct_member_a, direct_member_b) WHERE kind = 'direct';
CREATE UNIQUE INDEX threads_object_idx ON threads (family_id, entity_kind, entity_id) WHERE kind = 'object';

-- back-fill thread_id foreign keys now that threads exists.
ALTER TABLE internal_events  ADD CONSTRAINT internal_events_thread_fkey  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL;
ALTER TABLE tasks            ADD CONSTRAINT tasks_thread_fkey            FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL;
ALTER TABLE bills            ADD CONSTRAINT bills_thread_fkey            FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL;
ALTER TABLE transactions     ADD CONSTRAINT transactions_thread_fkey     FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL;
ALTER TABLE budgets          ADD CONSTRAINT budgets_thread_fkey          FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL;
ALTER TABLE savings_goals    ADD CONSTRAINT savings_goals_thread_fkey   FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL;
ALTER TABLE debts            ADD CONSTRAINT debts_thread_fkey            FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL;

CREATE TABLE proposals (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  thread_id                   uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  proposed_by_member_id       uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  proposal_kind               text NOT NULL,
  entity_kind                 text NOT NULL CHECK (entity_kind IN ('event', 'task', 'bill', 'transaction', 'budget', 'savings_goal', 'debt')),
  entity_id                   uuid NOT NULL,
  change                      jsonb NOT NULL,
  entity_snapshot             jsonb NOT NULL,
  required_approvers          uuid[] NOT NULL,
  approvals                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'declined', 'expired', 'countered')),
  applied_at                  timestamptz,
  expires_at                  timestamptz NOT NULL,
  countered_by_proposal_id    uuid REFERENCES proposals(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proposals_family_status_idx ON proposals (family_id, status, created_at DESC);
CREATE INDEX proposals_thread_idx ON proposals (thread_id, created_at DESC);

CREATE TABLE messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  thread_id           uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author_member_id    uuid REFERENCES family_members(id) ON DELETE SET NULL,
  kind                text NOT NULL CHECK (kind IN ('text', 'activity', 'proposal')),
  body_text           text,
  body_ciphertext     bytea,
  proposal_id         uuid REFERENCES proposals(id) ON DELETE SET NULL,
  attachments         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- exactly one of body_text / body_ciphertext is non-null
  CHECK ((body_text IS NULL) <> (body_ciphertext IS NULL))
);
CREATE INDEX messages_thread_created_idx ON messages (thread_id, created_at DESC);

COMMIT;
