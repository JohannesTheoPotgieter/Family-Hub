// Integration tests for money proposal diffs (Phase 4.9).
// Skipped without DATABASE_URL; runs in the migrate-syntax CI job.

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const skip = !process.env.DATABASE_URL ? { skip: 'DATABASE_URL not set; skipping moneyProposals integration tests.' } : {};

const importModules = async () => {
  const { getPool, closePool } = await import('../../server/db/pool.mjs');
  const engine = await import('../../server/chat/proposalEngine.mjs');
  const { ROLE_PERMISSIONS } = await import('../../server/auth/permissions.mjs');
  return { getPool, closePool, engine, ROLE_PERMISSIONS };
};

const seedFamily = async (pool) => {
  const familyId = randomUUID();
  const momId = randomUUID();
  const dadId = randomUUID();
  await pool.query(
    `INSERT INTO families (id, name, owner_user_id, locale) VALUES ($1, 'Test family', $2, 'GLOBAL')`,
    [familyId, randomUUID()]
  );
  await pool.query(
    `INSERT INTO family_members (id, family_id, user_id, display_name, role_key, status)
     VALUES ($1, $2, $3, 'Mom', 'parent_admin', 'active'),
            ($4, $2, $5, 'Dad', 'adult_editor', 'active')`,
    [momId, familyId, randomUUID(), dadId, randomUUID()]
  );
  await pool.query(
    `INSERT INTO threads (family_id, kind, e2e_encrypted) VALUES ($1, 'family', true)`,
    [familyId]
  );
  return { familyId, momId, dadId };
};

const cleanup = async (pool, familyId) => {
  await pool.query(`DELETE FROM families WHERE id = $1`, [familyId]);
};

test('budget_category_shift: creates / adjusts both rows after dad agrees', skip, async () => {
  const { getPool, closePool, engine, ROLE_PERMISSIONS } = await importModules();
  const pool = getPool();
  const { familyId, momId, dadId } = await seedFamily(pool);
  try {
    // Seed two budget categories so we can shift between them.
    const monthIso = '2026-05';
    await pool.query(
      `INSERT INTO budgets (family_id, month_iso, category, limit_cents, currency)
       VALUES ($1, $2, 'Entertainment', 100000, 'ZAR'),
              ($1, $2, 'School fees', 200000, 'ZAR')`,
      [familyId, monthIso]
    );

    const family = [
      { id: momId, roleKey: 'parent_admin', displayName: 'Mom' },
      { id: dadId, roleKey: 'adult_editor', displayName: 'Dad' }
    ];
    const proposed = await engine.proposeChange({
      familyId,
      proposer: family[0],
      family,
      change: {
        kind: 'budget_category_shift',
        monthIso,
        fromCategory: 'Entertainment',
        toCategory: 'School fees',
        amountCents: 50_000, // R500 — over R250 → both adults required
        currency: 'ZAR'
      },
      // The budget shift doesn't bind to a single row; we use a synthetic
      // UUID as the proposal's entity reference. The change.monthIso
      // payload is what the apply path actually uses to find rows.
      entityId: randomUUID()
    });
    // Two-key money: dad must agree.
    assert.deepEqual(proposed.proposal.requiredApprovers, [dadId]);

    const decision = await engine.decideOnProposal({
      familyId,
      proposalId: proposed.proposal.id,
      memberId: dadId,
      decision: 'agree',
      actorRoleKey: 'adult_editor',
      actorPermissions: ROLE_PERMISSIONS.adult_editor
    });
    assert.equal(decision.proposal.status, 'applied');

    const { rows } = await pool.query(
      `SELECT category, limit_cents FROM budgets WHERE family_id = $1 AND month_iso = $2 ORDER BY category`,
      [familyId, monthIso]
    );
    assert.equal(rows.length, 2);
    const map = Object.fromEntries(rows.map((r) => [r.category, r.limit_cents]));
    assert.equal(Number(map['Entertainment']), 50_000);
    assert.equal(Number(map['School fees']), 250_000);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('goal_create: applies as a new savings_goals row', skip, async () => {
  const { getPool, closePool, engine, ROLE_PERMISSIONS } = await importModules();
  const pool = getPool();
  const { familyId, momId, dadId } = await seedFamily(pool);
  try {
    const family = [
      { id: momId, roleKey: 'parent_admin', displayName: 'Mom' },
      { id: dadId, roleKey: 'adult_editor', displayName: 'Dad' }
    ];
    const goalEntityId = randomUUID();
    const proposed = await engine.proposeChange({
      familyId,
      proposer: family[0],
      family,
      change: {
        kind: 'goal_create',
        title: 'Emergency cushion',
        targetCents: 1_500_000, // R15,000 → over threshold, both adults
        currency: 'ZAR',
        targetDate: null
      },
      entityId: goalEntityId
    });

    const decision = await engine.decideOnProposal({
      familyId,
      proposalId: proposed.proposal.id,
      memberId: dadId,
      decision: 'agree',
      actorRoleKey: 'adult_editor',
      actorPermissions: ROLE_PERMISSIONS.adult_editor
    });
    assert.equal(decision.proposal.status, 'applied');

    const { rows } = await pool.query(
      `SELECT title, target_cents FROM savings_goals WHERE family_id = $1`,
      [familyId]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'Emergency cushion');
    assert.equal(Number(rows[0].target_cents), 1_500_000);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('debt_acceleration: bumps min_payment_cents on the debt row', skip, async () => {
  const { getPool, closePool, engine, ROLE_PERMISSIONS } = await importModules();
  const pool = getPool();
  const { familyId, momId, dadId } = await seedFamily(pool);
  try {
    const debtId = randomUUID();
    await pool.query(
      `INSERT INTO debts (id, family_id, title, principal_cents, apr_bps,
                          min_payment_cents, currency, strategy)
       VALUES ($1, $2, 'Bond', 100000000, 1100, 500000, 'ZAR', 'avalanche')`,
      [debtId, familyId]
    );
    const family = [
      { id: momId, roleKey: 'parent_admin', displayName: 'Mom' },
      { id: dadId, roleKey: 'adult_editor', displayName: 'Dad' }
    ];
    const proposed = await engine.proposeChange({
      familyId,
      proposer: family[0],
      family,
      change: {
        kind: 'debt_acceleration',
        monthlyExtraCents: 50_000, // R500
        currency: 'ZAR'
      },
      entityId: debtId
    });
    await engine.decideOnProposal({
      familyId,
      proposalId: proposed.proposal.id,
      memberId: dadId,
      decision: 'agree',
      actorRoleKey: 'adult_editor',
      actorPermissions: ROLE_PERMISSIONS.adult_editor
    });
    const { rows } = await pool.query(
      `SELECT min_payment_cents FROM debts WHERE id = $1`,
      [debtId]
    );
    // Original 500_000 + extra 50_000 = 550_000 cents.
    assert.equal(Number(rows[0].min_payment_cents), 550_000);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});
