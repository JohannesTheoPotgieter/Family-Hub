// tasks + task_lists DB layer (Phase 2.1, 2.2, 2.6).
//
// Mirrors server/calendar/eventStore.mjs in shape: pure CRUD against tasks
// and task_lists, scoped through withFamilyContext, audit-logged on every
// mutation. Reminders are scheduled via the lifecycle hooks (slice 2);
// proposal diffs apply through proposalEngine (slice 3).
//
// `recordTaskSyncMetadata` is reserved for the eventual provider write-
// through (e.g. Microsoft Todo, Google Tasks); not used yet but kept in the
// shape so the slice-5 equivalent is mechanical.

import { withFamilyContext, withTransaction } from '../db/pool.mjs';
import {
  cancelTaskReminder,
  scheduleTaskReminder
} from './reminders.mjs';

const rowToTask = (row) => ({
  id: row.id,
  familyId: row.family_id,
  listId: row.list_id ?? null,
  parentTaskId: row.parent_task_id ?? null,
  title: row.title,
  notes: row.notes ?? undefined,
  ownerMemberId: row.owner_member_id,
  shared: row.shared,
  dueDate: row.due_date ?? null,
  recurrence: row.recurrence,
  rruleText: row.rrule_text ?? null,
  priority: row.priority,
  rewardPoints: row.reward_points,
  completed: row.completed,
  completionCount: row.completion_count,
  lastCompletedAt: row.last_completed_at ?? null,
  archived: row.archived,
  threadId: row.thread_id ?? null,
  createdAt: row.created_at
});

const rowToList = (row) => ({
  id: row.id,
  familyId: row.family_id,
  name: row.name,
  ordinal: row.ordinal,
  createdAt: row.created_at
});

// --- task_lists ----------------------------------------------------------

const DEFAULT_LISTS = [
  { name: 'Household', ordinal: 0 },
  { name: 'Errands', ordinal: 1 },
  { name: 'Kids', ordinal: 2 }
];

/**
 * Insert the three default lists for a brand-new family. Idempotent — does
 * nothing if any task_lists row already exists for this family. The Clerk
 * user.created webhook calls this right after creating the family + owner
 * member.
 */
export const seedDefaultTaskLists = async (familyId) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `SELECT 1 FROM task_lists WHERE family_id = $1 LIMIT 1`,
      [familyId]
    );
    if (rows.length) return [];
    const inserted = [];
    for (const def of DEFAULT_LISTS) {
      const result = await client.query(
        `INSERT INTO task_lists (family_id, name, ordinal) VALUES ($1, $2, $3)
         RETURNING *`,
        [familyId, def.name, def.ordinal]
      );
      inserted.push(rowToList(result.rows[0]));
    }
    return inserted;
  });

export const listTaskLists = async (familyId) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM task_lists ORDER BY ordinal, name`
    );
    return rows.map(rowToList);
  });

export const createTaskList = async ({ familyId, name, ordinal = 0 }) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO task_lists (family_id, name, ordinal) VALUES ($1, $2, $3)
       RETURNING *`,
      [familyId, name, ordinal]
    );
    return rowToList(rows[0]);
  });

export const deleteTaskList = async ({ familyId, listId }) =>
  withFamilyContext(familyId, async (client) => {
    const { rowCount } = await client.query(
      `DELETE FROM task_lists WHERE id = $1`,
      [listId]
    );
    return rowCount > 0;
  });

// --- tasks ---------------------------------------------------------------

/**
 * @param {{
 *   familyId: string,
 *   listId?: string | null,
 *   ownerMemberId?: string | null,
 *   includeArchived?: boolean
 * }} args
 */
export const listTasks = async ({ familyId, listId, ownerMemberId, includeArchived = false }) =>
  withFamilyContext(familyId, async (client) => {
    const conds = [];
    const values = [];
    if (listId) {
      values.push(listId);
      conds.push(`list_id = $${values.length}`);
    }
    if (ownerMemberId) {
      values.push(ownerMemberId);
      conds.push(`owner_member_id = $${values.length}`);
    }
    if (!includeArchived) conds.push('archived = false');
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await client.query(
      `SELECT * FROM tasks ${where} ORDER BY due_date NULLS LAST, created_at DESC`,
      values
    );
    return rows.map(rowToTask);
  });

/**
 * @param {{
 *   familyId: string,
 *   actorMemberId: string,
 *   task: {
 *     title: string,
 *     notes?: string | null,
 *     listId?: string | null,
 *     parentTaskId?: string | null,
 *     ownerMemberId: string,
 *     shared?: boolean,
 *     dueDate?: string | null,
 *     recurrence?: 'none' | 'daily' | 'weekly' | 'custom',
 *     rruleText?: string | null,
 *     priority?: 'low' | 'normal' | 'high',
 *     rewardPoints?: number
 *   }
 * }} args
 */
export const createTask = async ({ familyId, actorMemberId, task }) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rows } = await client.query(
        `INSERT INTO tasks (
            family_id, list_id, parent_task_id, title, notes, owner_member_id,
            shared, due_date, recurrence, rrule_text, priority, reward_points
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          familyId,
          task.listId ?? null,
          task.parentTaskId ?? null,
          task.title,
          task.notes ?? null,
          task.ownerMemberId,
          Boolean(task.shared),
          task.dueDate ?? null,
          task.recurrence ?? 'none',
          task.rruleText ?? null,
          task.priority ?? 'normal',
          Number(task.rewardPoints ?? 0)
        ]
      );
      const row = rows[0];
      await audit(client, {
        familyId,
        actorMemberId,
        action: 'task.created',
        entityKind: 'task',
        entityId: row.id,
        diff: {
          title: task.title,
          dueDate: task.dueDate ?? null,
          ownerMemberId: task.ownerMemberId
        }
      });
      // Reminder is best-effort — never blocks task creation if Redis is down.
      if (row.due_date) {
        await scheduleTaskReminder({
          familyId,
          taskId: row.id,
          memberId: row.owner_member_id,
          title: row.title,
          dueDate: row.due_date
        }).catch(() => {});
      }
      return rowToTask(row);
    })
  );

export const updateTask = async ({ familyId, actorMemberId, taskId, patch }) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rows: currentRows } = await client.query(
        `SELECT * FROM tasks WHERE id = $1 FOR UPDATE`,
        [taskId]
      );
      if (!currentRows.length) {
        const err = new Error('task not found');
        err.status = 404;
        throw err;
      }
      const current = currentRows[0];

      const set = [];
      const values = [];
      const push = (column, value) => {
        values.push(value);
        set.push(`${column} = $${values.length}`);
      };
      if (patch.title !== undefined) push('title', patch.title);
      if (patch.notes !== undefined) push('notes', patch.notes);
      if (patch.listId !== undefined) push('list_id', patch.listId);
      if (patch.parentTaskId !== undefined) push('parent_task_id', patch.parentTaskId);
      if (patch.ownerMemberId !== undefined) push('owner_member_id', patch.ownerMemberId);
      if (patch.shared !== undefined) push('shared', patch.shared);
      if (patch.dueDate !== undefined) push('due_date', patch.dueDate);
      if (patch.recurrence !== undefined) push('recurrence', patch.recurrence);
      if (patch.rruleText !== undefined) push('rrule_text', patch.rruleText);
      if (patch.priority !== undefined) push('priority', patch.priority);
      if (patch.rewardPoints !== undefined) push('reward_points', patch.rewardPoints);
      if (patch.archived !== undefined) push('archived', patch.archived);

      let updated = current;
      if (set.length) {
        values.push(taskId);
        const { rows } = await client.query(
          `UPDATE tasks SET ${set.join(', ')} WHERE id = $${values.length} RETURNING *`,
          values
        );
        updated = rows[0];
      }

      await audit(client, {
        familyId,
        actorMemberId,
        action: 'task.updated',
        entityKind: 'task',
        entityId: taskId,
        diff: patchDiff(current, updated)
      });

      // Re-schedule reminder when due_date or owner shifts; cancel if due_date
      // cleared.
      const dueChanged = current.due_date !== updated.due_date;
      const ownerChanged = current.owner_member_id !== updated.owner_member_id;
      if (dueChanged || ownerChanged) {
        await cancelTaskReminder({ taskId, memberId: current.owner_member_id }).catch(() => {});
        if (updated.due_date) {
          await scheduleTaskReminder({
            familyId,
            taskId,
            memberId: updated.owner_member_id,
            title: updated.title,
            dueDate: updated.due_date
          }).catch(() => {});
        }
      }

      return rowToTask(updated);
    })
  );

export const deleteTask = async ({ familyId, actorMemberId, taskId }) =>
  withFamilyContext(familyId, async (client) => {
    const { rows: pre } = await client.query(
      `SELECT owner_member_id FROM tasks WHERE id = $1`,
      [taskId]
    );
    const ownerId = pre[0]?.owner_member_id;
    const result = await withTransaction(client, async () => {
      const { rowCount } = await client.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);
      if (!rowCount) {
        const err = new Error('task not found');
        err.status = 404;
        throw err;
      }
      await audit(client, {
        familyId,
        actorMemberId,
        action: 'task.deleted',
        entityKind: 'task',
        entityId: taskId,
        diff: {}
      });
      return { ok: true };
    });
    if (ownerId) await cancelTaskReminder({ taskId, memberId: ownerId }).catch(() => {});
    return result;
  });

/**
 * Lazy thread creation for the task entity — same pattern as
 * ensureEventThread. Phase 3 chat UI uses this when a user opens a task's
 * detail screen for the first time.
 */
export const ensureTaskThread = async ({ familyId, taskId }) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rows } = await client.query(
        `SELECT thread_id FROM tasks WHERE id = $1 FOR UPDATE`,
        [taskId]
      );
      if (!rows.length) {
        const err = new Error('task not found');
        err.status = 404;
        throw err;
      }
      if (rows[0].thread_id) return rows[0].thread_id;
      const { rows: thread } = await client.query(
        `INSERT INTO threads (family_id, kind, entity_kind, entity_id, e2e_encrypted)
         VALUES ($1, 'object', 'task', $2, false)
         RETURNING id`,
        [familyId, taskId]
      );
      const threadId = thread[0].id;
      await client.query(`UPDATE tasks SET thread_id = $1 WHERE id = $2`, [threadId, taskId]);
      return threadId;
    })
  );

// --- helpers -------------------------------------------------------------

const audit = async (client, { familyId, actorMemberId, action, entityKind, entityId, diff }) => {
  await client.query(
    `INSERT INTO audit_log (family_id, actor_member_id, action, entity_kind, entity_id, diff)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [familyId, actorMemberId, action, entityKind, entityId, JSON.stringify(diff)]
  );
};

const patchDiff = (before, after) => {
  const diff = {};
  for (const key of [
    'title', 'notes', 'list_id', 'parent_task_id', 'owner_member_id',
    'shared', 'due_date', 'recurrence', 'rrule_text', 'priority',
    'reward_points', 'archived'
  ]) {
    if (before[key] !== after[key]) diff[key] = { from: before[key], to: after[key] };
  }
  return diff;
};
