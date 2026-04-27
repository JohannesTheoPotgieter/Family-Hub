-- Phase 4.5 — daily FX rates + bank-link state.
--
-- currency_rates carries one row per (base, quote, day_iso). Reports
-- convert at-write-time costs (avoid drift) but display-time conversions
-- pull from this table. The daily snapshot job inserts rows once per
-- midnight UTC.
--
-- bank_accounts (created in 0001) gets a few extra columns: external
-- account name + last cursor for delta sync.

BEGIN;

CREATE TABLE currency_rates (
  base_currency  text NOT NULL,
  quote_currency text NOT NULL,
  day_iso        date NOT NULL,
  rate           numeric(20, 10) NOT NULL,
  source         text NOT NULL DEFAULT 'manual',
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (base_currency, quote_currency, day_iso)
);
CREATE INDEX currency_rates_day_idx ON currency_rates (day_iso DESC);

-- Cross-tenant — exchange rates are public data, not family-scoped.
-- No RLS needed; the app role just SELECTs.

ALTER TABLE bank_accounts
  ADD COLUMN external_name text,
  ADD COLUMN sync_cursor   text,
  ADD COLUMN last_synced_at_was timestamptz; -- previous successful sync; pinned for delta windows

-- net_worth_snapshots — Phase 4.8 weekly snapshots.
CREATE TABLE net_worth_snapshots (
  family_id      uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  snapshot_date  date NOT NULL,
  assets_cents   bigint NOT NULL DEFAULT 0,
  debts_cents    bigint NOT NULL DEFAULT 0,
  net_cents      bigint NOT NULL,
  currency       text NOT NULL DEFAULT 'ZAR',
  PRIMARY KEY (family_id, snapshot_date)
);

ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_worth_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON net_worth_snapshots
  FOR SELECT USING (family_id = current_family_id());
CREATE POLICY tenant_isolation_modify ON net_worth_snapshots
  FOR ALL USING (family_id = current_family_id())
  WITH CHECK (family_id = current_family_id());

-- monthly_category_rollup — Phase 4.7 view, computed lazily.
-- Not materialized; the dataset is small enough that a regular view
-- suffices. If it gets hot we promote to a materialized view + cron.
CREATE VIEW monthly_category_rollup AS
SELECT
  family_id,
  to_char(tx_date, 'YYYY-MM') AS month_iso,
  category,
  kind,
  currency,
  SUM(amount_cents)::bigint   AS total_cents,
  COUNT(*)::int               AS tx_count
FROM transactions
GROUP BY family_id, to_char(tx_date, 'YYYY-MM'), category, kind, currency;

COMMIT;
