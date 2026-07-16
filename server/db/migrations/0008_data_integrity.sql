-- 0008 — data-integrity keys the write paths always assumed existed.
--
-- 1. calendar_connections: upsertCalendarConnection targeted the PRIMARY KEY
--    in its ON CONFLICT clause; a fresh uuid can never conflict, so every
--    token refresh inserted a duplicate row and reads returned an arbitrary
--    (often stale) connection. Dedupe (keep newest) and add the real key.
-- 2. transactions: the bank-sync worker relied on ON CONFLICT DO NOTHING
--    with no matching constraint (and never wrote the provider's id), so
--    every cursor replay double-counted transactions. Add external_id and
--    the partial unique key the insert needs.
-- 3. debts: setDebtAcceleration stored the "recurring monthly extra" by
--    ADDING it into min_payment_cents, compounding on every proposal.
--    Give the extra its own column.

BEGIN;

DELETE FROM calendar_connections a
USING calendar_connections b
WHERE a.family_id = b.family_id
  AND a.member_id = b.member_id
  AND a.provider = b.provider
  AND (a.created_at < b.created_at
       OR (a.created_at = b.created_at AND a.id < b.id));

CREATE UNIQUE INDEX calendar_connections_member_provider_key
  ON calendar_connections (family_id, member_id, provider);

ALTER TABLE transactions ADD COLUMN external_id text;

CREATE UNIQUE INDEX transactions_bank_external_key
  ON transactions (family_id, bank_account_id, external_id)
  WHERE external_id IS NOT NULL AND bank_account_id IS NOT NULL;

ALTER TABLE debts
  ADD COLUMN monthly_extra_cents bigint NOT NULL DEFAULT 0
    CHECK (monthly_extra_cents >= 0);

COMMIT;
