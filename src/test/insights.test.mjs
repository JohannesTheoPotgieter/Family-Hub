// Integration tests for monthly rollup + net worth (Phase 4.7 + 4.8).
// Skipped without DATABASE_URL.

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const skip = !process.env.DATABASE_URL ? { skip: 'DATABASE_URL not set; skipping insights integration tests.' } : {};

const importModules = async () => {
  const { getPool, closePool } = await import('../../server/db/pool.mjs');
  const insights = await import('../../server/money/insights.mjs');
  return { getPool, closePool, insights };
};

const seedFamily = async (pool) => {
  const familyId = randomUUID();
  const momId = randomUUID();
  await pool.query(
    `INSERT INTO families (id, name, owner_user_id, locale) VALUES ($1, 'Test', $2, 'GLOBAL')`,
    [familyId, randomUUID()]
  );
  await pool.query(
    `INSERT INTO family_members (id, family_id, user_id, display_name, role_key, status)
     VALUES ($1, $2, $3, 'Mom', 'parent_admin', 'active')`,
    [momId, familyId, randomUUID()]
  );
  return { familyId, momId };
};

const cleanup = async (pool, familyId) => {
  await pool.query(`DELETE FROM families WHERE id = $1`, [familyId]);
};

test('monthlyRollup: aggregates by category + kind and reports MoM delta', skip, async () => {
  const { getPool, closePool, insights } = await importModules();
  const pool = getPool();
  const { familyId } = await seedFamily(pool);
  try {
    // April: R200 groceries, R500 inflow
    await pool.query(
      `INSERT INTO transactions (family_id, title, amount_cents, currency, tx_date, kind, category, source)
       VALUES ($1, 'Groceries', 20000, 'ZAR', '2026-04-15', 'outflow', 'Groceries', 'manual'),
              ($1, 'Salary',   500000, 'ZAR', '2026-04-25', 'inflow',  'Income',    'manual')`,
      [familyId]
    );
    // May: R350 groceries, R500 inflow
    await pool.query(
      `INSERT INTO transactions (family_id, title, amount_cents, currency, tx_date, kind, category, source)
       VALUES ($1, 'Groceries', 35000, 'ZAR', '2026-05-10', 'outflow', 'Groceries', 'manual'),
              ($1, 'Salary',   500000, 'ZAR', '2026-05-25', 'inflow',  'Income',    'manual')`,
      [familyId]
    );

    const may = await insights.monthlyRollup({ familyId, monthIso: '2026-05' });
    const groceries = may.categories.find((c) => c.category === 'Groceries' && c.kind === 'outflow');
    assert.equal(groceries.totalCents, 35000);
    assert.equal(groceries.deltaCents, 35000 - 20000);
    assert.equal(may.summary.outflowCents, 35000);
    assert.equal(may.summary.inflowCents, 500000);
    assert.equal(may.summary.spareCents, 500000 - 35000);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('netWorth: assets - debts in the same currency', skip, async () => {
  const { getPool, closePool, insights } = await importModules();
  const pool = getPool();
  const { familyId } = await seedFamily(pool);
  try {
    await pool.query(
      `INSERT INTO bank_accounts (family_id, provider, account_label, currency, last_balance_cents)
       VALUES ($1, 'manual', 'Cheque', 'ZAR', 1000000),
              ($1, 'manual', 'Savings', 'ZAR', 500000)`,
      [familyId]
    );
    await pool.query(
      `INSERT INTO debts (family_id, title, principal_cents, apr_bps, min_payment_cents, currency)
       VALUES ($1, 'Bond', 800000, 1100, 50000, 'ZAR')`,
      [familyId]
    );
    const nw = await insights.netWorth({ familyId, displayCurrency: 'ZAR' });
    assert.equal(nw.assetsCents, 1500000);
    assert.equal(nw.debtsCents, 800000);
    assert.equal(nw.netCents, 700000);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('snapshotNetWorth + listNetWorthHistory persist and read back', skip, async () => {
  const { getPool, closePool, insights } = await importModules();
  const pool = getPool();
  const { familyId } = await seedFamily(pool);
  try {
    await pool.query(
      `INSERT INTO bank_accounts (family_id, provider, account_label, currency, last_balance_cents)
       VALUES ($1, 'manual', 'Cheque', 'ZAR', 1000000)`,
      [familyId]
    );
    const first = await insights.snapshotNetWorth({ familyId });
    assert.equal(first.netCents, 1000000);
    // Re-running same day should upsert idempotently.
    await insights.snapshotNetWorth({ familyId });
    const history = await insights.listNetWorthHistory({ familyId });
    assert.equal(history.length, 1);
    assert.equal(history[0].netCents, 1000000);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});
