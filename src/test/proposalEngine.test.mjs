// Integration test for server/chat/proposalEngine.mjs (Phase 1.9).
// Skipped when DATABASE_URL is unset; runs in the migrate-syntax CI job.

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const skip = !process.env.DATABASE_URL ? { skip: 'DATABASE_URL not set; skipping proposalEngine integration tests.' } : {};

const importModules = async () => {
  const { getPool, closePool } = await import('../../server/db/pool.mjs');
  const { createEvent } = await import('../../server/calendar/eventStore.mjs');
  const engine = await import('../../server/chat/proposalEngine.mjs');
  const { ROLE_PERMISSIONS } = await import('../../server/auth/permissions.mjs');
  return { getPool, closePool, createEvent, engine, ROLE_PERMISSIONS };
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
  return { familyId, momId, dadId };
};

const cleanup = async (pool, familyId) => {
  await pool.query(`DELETE FROM families WHERE id = $1`, [familyId]);
};

test('proposalEngine: event_move proposal applies after the required approver agrees', skip, async () => {
  const { getPool, closePool, createEvent, engine, ROLE_PERMISSIONS } = await importModules();
  const pool = getPool();
  const { familyId, momId, dadId } = await seedFamily(pool);
  try {
    const event = await createEvent({
      familyId,
      actorMemberId: momId,
      event: {
        title: 'Soccer practice',
        startsAt: '2026-05-06T16:00:00Z',
        endsAt: '2026-05-06T17:00:00Z',
        attendeeMemberIds: [momId]
      }
    });

    const family = [
      { id: momId, roleKey: 'parent_admin', displayName: 'Mom' },
      { id: dadId, roleKey: 'adult_editor', displayName: 'Dad' }
    ];

    const proposed = await engine.proposeChange({
      familyId,
      proposer: family[0],
      family,
      change: {
        kind: 'event_move',
        newStartIso: '2026-05-09T10:00:00Z',
        newEndIso: '2026-05-09T11:00:00Z'
      },
      entityId: event.id
    });
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
    assert.equal(decision.diff.kind, 'event_update');

    const { rows } = await pool.query(
      `SELECT starts_at, ends_at FROM internal_events WHERE id = $1`,
      [event.id]
    );
    assert.equal(new Date(rows[0].starts_at).toISOString(), '2026-05-09T10:00:00.000Z');
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('proposalEngine: decline closes the proposal without mutating the entity', skip, async () => {
  const { getPool, closePool, createEvent, engine, ROLE_PERMISSIONS } = await importModules();
  const pool = getPool();
  const { familyId, momId, dadId } = await seedFamily(pool);
  try {
    const event = await createEvent({
      familyId,
      actorMemberId: momId,
      event: {
        title: 'Date night',
        startsAt: '2026-05-08T19:00:00Z',
        endsAt: '2026-05-08T22:00:00Z'
      }
    });
    const family = [
      { id: momId, roleKey: 'parent_admin', displayName: 'Mom' },
      { id: dadId, roleKey: 'adult_editor', displayName: 'Dad' }
    ];
    const proposed = await engine.proposeChange({
      familyId,
      proposer: family[0],
      family,
      change: { kind: 'event_cancel' },
      entityId: event.id
    });
    const decision = await engine.decideOnProposal({
      familyId,
      proposalId: proposed.proposal.id,
      memberId: dadId,
      decision: 'decline',
      actorRoleKey: 'adult_editor',
      actorPermissions: ROLE_PERMISSIONS.adult_editor
    });
    assert.equal(decision.proposal.status, 'declined');
    assert.equal(decision.diff, null);

    const { rows } = await pool.query(`SELECT id FROM internal_events WHERE id = $1`, [event.id]);
    assert.equal(rows.length, 1, 'event was not deleted');
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('proposalEngine: kid cannot create a money proposal by default', skip, async () => {
  const { getPool, closePool, engine } = await importModules();
  const pool = getPool();
  const familyId = randomUUID();
  const momId = randomUUID();
  const liamId = randomUUID();
  await pool.query(
    `INSERT INTO families (id, name, owner_user_id, locale) VALUES ($1, 'Test family', $2, 'GLOBAL')`,
    [familyId, randomUUID()]
  );
  await pool.query(
    `INSERT INTO family_members (id, family_id, user_id, display_name, role_key, status)
     VALUES ($1, $2, $3, 'Mom', 'parent_admin', 'active'),
            ($4, $2, $5, 'Liam', 'child_limited', 'active')`,
    [momId, familyId, randomUUID(), liamId, randomUUID()]
  );
  try {
    const family = [
      { id: momId, roleKey: 'parent_admin', displayName: 'Mom' },
      { id: liamId, roleKey: 'child_limited', displayName: 'Liam' }
    ];
    await assert.rejects(
      engine.proposeChange({
        familyId,
        proposer: family[1],
        family,
        change: {
          kind: 'budget_category_shift',
          monthIso: '2026-05',
          fromCategory: 'A',
          toCategory: 'B',
          amountCents: 50000,
          currency: 'ZAR'
        },
        entityId: randomUUID()
      }),
      (err) => err.message === 'proposal_invalid' && err.errors?.some((e) => e.code === 'kids_money_disabled')
    );
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});
