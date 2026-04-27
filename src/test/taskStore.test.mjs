// Integration tests for tasks (Phase 2). Skipped without DATABASE_URL;
// runs in the migrate-syntax CI job.

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const skip = !process.env.DATABASE_URL ? { skip: 'DATABASE_URL not set; skipping taskStore integration tests.' } : {};

const importModules = async () => {
  const { getPool, closePool } = await import('../../server/db/pool.mjs');
  const taskStore = await import('../../server/tasks/taskStore.mjs');
  const completion = await import('../../server/tasks/completion.mjs');
  const engine = await import('../../server/chat/proposalEngine.mjs');
  const { ROLE_PERMISSIONS } = await import('../../server/auth/permissions.mjs');
  return { getPool, closePool, taskStore, completion, engine, ROLE_PERMISSIONS };
};

const seedFamily = async (pool) => {
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
  return { familyId, momId, liamId };
};

const cleanup = async (pool, familyId) => {
  await pool.query(`DELETE FROM families WHERE id = $1`, [familyId]);
};

test('taskStore: seedDefaultTaskLists is idempotent', skip, async () => {
  const { getPool, closePool, taskStore } = await importModules();
  const pool = getPool();
  const { familyId } = await seedFamily(pool);
  try {
    const first = await taskStore.seedDefaultTaskLists(familyId);
    assert.equal(first.length, 3);
    const second = await taskStore.seedDefaultTaskLists(familyId);
    assert.equal(second.length, 0); // already seeded
    const lists = await taskStore.listTaskLists(familyId);
    assert.equal(lists.length, 3);
    assert.deepEqual(
      lists.map((l) => l.name).sort(),
      ['Errands', 'Household', 'Kids']
    );
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('taskStore: create + list + update + delete end to end', skip, async () => {
  const { getPool, closePool, taskStore } = await importModules();
  const pool = getPool();
  const { familyId, momId, liamId } = await seedFamily(pool);
  try {
    const created = await taskStore.createTask({
      familyId,
      actorMemberId: momId,
      task: {
        title: 'Walk dog',
        ownerMemberId: liamId,
        dueDate: '2026-05-10',
        rewardPoints: 5,
        recurrence: 'daily'
      }
    });
    assert.equal(created.title, 'Walk dog');
    assert.equal(created.rewardPoints, 5);
    assert.equal(created.recurrence, 'daily');

    const listed = await taskStore.listTasks({ familyId, ownerMemberId: liamId });
    assert.equal(listed.length, 1);

    const updated = await taskStore.updateTask({
      familyId,
      actorMemberId: momId,
      taskId: created.id,
      patch: { title: 'Walk the dog (every day)' }
    });
    assert.equal(updated.title, 'Walk the dog (every day)');

    await taskStore.deleteTask({ familyId, actorMemberId: momId, taskId: created.id });
    const after = await taskStore.listTasks({ familyId, ownerMemberId: liamId });
    assert.equal(after.length, 0);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('completion: completing a daily-recurring task rolls due_date forward by one day', skip, async () => {
  const { getPool, closePool, taskStore, completion } = await importModules();
  const pool = getPool();
  const { familyId, momId, liamId } = await seedFamily(pool);
  try {
    const task = await taskStore.createTask({
      familyId,
      actorMemberId: momId,
      task: {
        title: 'Make bed',
        ownerMemberId: liamId,
        dueDate: '2026-05-10',
        rewardPoints: 2,
        recurrence: 'daily'
      }
    });
    const result = await completion.completeTask({
      familyId,
      actorMemberId: liamId,
      taskId: task.id
    });
    assert.equal(result.pointsAwarded, 2);
    assert.equal(result.newDueDate, '2026-05-11');
    assert.equal(result.task.completed, false); // recurring → still live
    assert.equal(result.task.completionCount, 1);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('completion: non-recurring tasks are marked done and credit points', skip, async () => {
  const { getPool, closePool, taskStore, completion } = await importModules();
  const pool = getPool();
  const { familyId, momId, liamId } = await seedFamily(pool);
  try {
    const task = await taskStore.createTask({
      familyId,
      actorMemberId: momId,
      task: {
        title: 'Pack school bag',
        ownerMemberId: liamId,
        dueDate: '2026-05-10',
        rewardPoints: 3
      }
    });
    const result = await completion.completeTask({
      familyId,
      actorMemberId: liamId,
      taskId: task.id
    });
    assert.equal(result.task.completed, true);
    assert.equal(result.pointsAwarded, 3);
    assert.equal(result.newDueDate, null);

    const total = await completion.getMemberPoints({ familyId, memberId: liamId });
    assert.equal(total, 3);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});

test('proposal engine: task_assignee_swap applies once new owner agrees', skip, async () => {
  const { getPool, closePool, taskStore, engine, ROLE_PERMISSIONS } = await importModules();
  const pool = getPool();
  const { familyId, momId, liamId } = await seedFamily(pool);
  try {
    const task = await taskStore.createTask({
      familyId,
      actorMemberId: momId,
      task: {
        title: 'Take out trash',
        ownerMemberId: liamId,
        dueDate: '2026-05-10',
        rewardPoints: 4
      }
    });
    const family = [
      { id: momId, roleKey: 'parent_admin', displayName: 'Mom' },
      { id: liamId, roleKey: 'child_limited', displayName: 'Liam' }
    ];
    const proposed = await engine.proposeChange({
      familyId,
      proposer: family[1], // Liam
      family,
      change: {
        kind: 'task_assignee_swap',
        swaps: [{ taskId: task.id, newOwnerMemberId: momId }]
      },
      entityId: task.id
    });
    assert.ok(proposed.proposal.requiredApprovers.includes(momId));

    // Mom approves; her permission set includes proposal_approve_task.
    const decision = await engine.decideOnProposal({
      familyId,
      proposalId: proposed.proposal.id,
      memberId: momId,
      decision: 'agree',
      actorRoleKey: 'parent_admin',
      actorPermissions: ROLE_PERMISSIONS.parent_admin
    });
    assert.equal(decision.proposal.status, 'applied');

    const { rows } = await pool.query(`SELECT owner_member_id FROM tasks WHERE id = $1`, [task.id]);
    assert.equal(rows[0].owner_member_id, momId);
  } finally {
    await cleanup(pool, familyId);
    await closePool();
  }
});
