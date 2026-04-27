// Integration tests for /api/v2/inbox aggregator (Phase 4.5).
// Skipped without DATABASE_URL.

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const skip = !process.env.DATABASE_URL ? { skip: 'DATABASE_URL not set; skipping inbox integration tests.' } : {};

const importModules = async () => {
  const { getPool, closePool } = await import('../../server/db/pool.mjs');
  const { buildInbox, inboxCounts, searchAuditLog } = await import('../../server/inbox/inbox.mjs');
  return { getPool, closePool, buildInbox, inboxCounts, searchAuditLog };
};

const seedFamily = async (pool) => {
  const familyId = randomUUID();
  const momId = randomUUID();
  const liamId = randomUUID();
  await pool.query(
    `INSERT INTO families (id, name, owner_user_id, locale) VALUES ($1, 'Test', $2, 'GLOBAL')`,
    [familyId, randomUUID()]
  );
  await pool.query(
    `INSERT INTO family_members (id, family_id, user_id, display_name, role_key, status)
     VALUES ($1, $2, $3, 'Mom', 'parent_admin', 'active'),
            ($4, $2, $5, 'Liam', 'child_limited', 'active')`,
    [momId, familyId, randomUUID(), liamId, randomUUID()]
  );
  return { familyId, momId, liamId };
};

const cleanup = async (pool, familyId) => {
  await pool.query(`DELETE FROM families WHERE id = $1`, [familyId]);
};

test('buildInbox: returns proposals + bills + tasks + conflicts for an adult', skip, async () => {
  const { getPool, closePool, buildInbox } = await importModules();
  const pool = getPool();
  const { familyId, momId, liamId } = await seedFamily(pool);
  try {
    // Bill due tomorrow, owned by mom (adult only).
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO bills (family_id, title, amount_cents, due_date, category)
       VALUES ($1, 'Internet', 50000, $2, 'Utilities')`,
      [familyId, tomorrow]
    );
    // Task due today, owned by mom.
    const today = new Date().toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO tasks (family_id, title, owner_member_id, due_date)
       VALUES ($1, 'Pay internet', $2, $3)`,
      [familyId, momId, today]
    );
    // Open proposal where mom is the approver.
    const threadId = (
      await pool.query(
        `INSERT INTO threads (family_id, kind, e2e_encrypted) VALUES ($1, 'family', false)
         RETURNING id`,
        [familyId]
      )
    ).rows[0].id;
    await pool.query(
      `INSERT INTO proposals (family_id, thread_id, proposed_by_member_id, proposal_kind,
                              entity_kind, entity_id, change, entity_snapshot,
                              required_approvers, approvals, expires_at)
       VALUES ($1, $2, $3, 'event_move', 'event', $4, '{}', '{}', $5, '{}',
               now() + interval '1 day')`,
      [familyId, threadId, liamId, randomUUID(), [momId]]
    );

    const inbox = await buildInbox({ familyId, memberId: momId, roleKey: 'parent_admin' });
    assert.equal(inbox.proposals.length, 1);
    assert.equal(inbox.bills.length, 1);
    assert.equal(inbox.tasks.length, 1);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('buildInbox: kid never sees bills + sees only kid-eligible proposals', skip, async () => {
  const { getPool, closePool, buildInbox } = await importModules();
  const pool = getPool();
  const { familyId, momId, liamId } = await seedFamily(pool);
  try {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO bills (family_id, title, amount_cents, due_date, category)
       VALUES ($1, 'Bond', 1500000, $2, 'Housing')`,
      [familyId, tomorrow]
    );
    const threadId = (
      await pool.query(
        `INSERT INTO threads (family_id, kind, e2e_encrypted) VALUES ($1, 'family', false)
         RETURNING id`,
        [familyId]
      )
    ).rows[0].id;
    // A money proposal where liam is in the approvers set (shouldn't happen
    // by default but tests the filter).
    await pool.query(
      `INSERT INTO proposals (family_id, thread_id, proposed_by_member_id, proposal_kind,
                              entity_kind, entity_id, change, entity_snapshot,
                              required_approvers, approvals, expires_at)
       VALUES ($1, $2, $3, 'budget_category_shift', 'budget', $4, '{}', '{}', $5, '{}',
               now() + interval '1 day')`,
      [familyId, threadId, momId, randomUUID(), [liamId]]
    );
    // A task proposal liam should see.
    await pool.query(
      `INSERT INTO proposals (family_id, thread_id, proposed_by_member_id, proposal_kind,
                              entity_kind, entity_id, change, entity_snapshot,
                              required_approvers, approvals, expires_at)
       VALUES ($1, $2, $3, 'task_assignee_swap', 'task', $4, '{}', '{}', $5, '{}',
               now() + interval '1 day')`,
      [familyId, threadId, momId, randomUUID(), [liamId]]
    );
    const inbox = await buildInbox({ familyId, memberId: liamId, roleKey: 'child_limited' });
    assert.equal(inbox.bills.length, 0); // filtered
    assert.equal(inbox.proposals.length, 1); // only task swap
    assert.equal(inbox.proposals[0].kind, 'task_assignee_swap');
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('searchAuditLog: filters audit_log rows by action / diff text', skip, async () => {
  const { getPool, closePool, searchAuditLog } = await importModules();
  const pool = getPool();
  const { familyId, momId } = await seedFamily(pool);
  try {
    await pool.query(
      `INSERT INTO audit_log (family_id, actor_member_id, action, entity_kind, diff)
       VALUES ($1, $2, 'proposal.applied', 'proposal', '{"note":"school fees split for May"}'::jsonb),
              ($1, $2, 'task.completed',  'task',     '{"taskTitle":"Walk dog"}'::jsonb),
              ($1, $2, 'budget.shifted',  'budget',   '{"fromCategory":"Entertainment","toCategory":"School fees"}'::jsonb)`,
      [familyId, momId]
    );
    const result = await searchAuditLog({
      familyId,
      memberId: momId,
      roleKey: 'parent_admin',
      q: 'school'
    });
    // Two matches: proposal note + budget toCategory.
    assert.equal(result.results.length, 2);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('searchAuditLog: kids do not see money rows even if they match', skip, async () => {
  const { getPool, closePool, searchAuditLog } = await importModules();
  const pool = getPool();
  const { familyId, momId, liamId } = await seedFamily(pool);
  try {
    await pool.query(
      `INSERT INTO audit_log (family_id, actor_member_id, action, entity_kind, diff)
       VALUES ($1, $2, 'budget.shifted',  'budget', '{"toCategory":"Entertainment"}'::jsonb),
              ($1, $2, 'task.completed',  'task',   '{"taskTitle":"Entertainment for kids"}'::jsonb)`,
      [familyId, momId]
    );
    const result = await searchAuditLog({
      familyId,
      memberId: liamId,
      roleKey: 'child_limited',
      q: 'entertainment'
    });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].entityKind, 'task');
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});
