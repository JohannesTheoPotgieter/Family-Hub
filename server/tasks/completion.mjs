// Task completion + chore reward credit (Phase 2.4 server-side).
//
// Completing a task does three things atomically:
//   1. Bumps tasks.completion_count + last_completed_at + completed.
//   2. Inserts a task_completions row recording who completed it.
//   3. Credits the task's reward_points to the completer's avatar
//      (`avatar_points_ledger`) so the chore-mode UI can read a single
//      authoritative running total per member.
//
// Recurring tasks: when `recurrence` is daily/weekly/custom, completing
// rolls the due_date to the next occurrence (using rrule when rruleText is
// present, otherwise +1 day or +1 week) and clears `completed`. The task
// stays "live" rather than being marked done; the family chore-mode UI
// shows the next instance.
//
// The avatar points ledger is a tiny new table — see
// 0005_avatar_points_ledger.sql. It's intentionally append-only so the
// audit trail stays intact even if a parent later voids a chore.

import { withFamilyContext, withTransaction } from '../db/pool.mjs';
import { cancelTaskReminder, scheduleTaskReminder } from './reminders.mjs';

/**
 * @param {{ familyId: string, actorMemberId: string, taskId: string }} args
 * @returns {Promise<{
 *   task: object,
 *   pointsAwarded: number,
 *   completionId: string,
 *   newDueDate: string | null
 * }>}
 */
export const completeTask = async ({ familyId, actorMemberId, taskId }) =>
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
      const task = currentRows[0];

      const completion = await client.query(
        `INSERT INTO task_completions (task_id, member_id) VALUES ($1, $2) RETURNING id, completed_at`,
        [taskId, actorMemberId]
      );
      const completionId = completion.rows[0].id;
      const completedAt = completion.rows[0].completed_at;

      const newDueDate = await nextDueDate(task);
      const isRecurring = newDueDate !== null;

      const update = await client.query(
        `UPDATE tasks
            SET completed = $2,
                completion_count = completion_count + 1,
                last_completed_at = $3,
                due_date = $4
          WHERE id = $1
          RETURNING *`,
        [taskId, !isRecurring, completedAt, newDueDate]
      );
      const updated = update.rows[0];

      const pointsAwarded = Number(task.reward_points ?? 0);
      if (pointsAwarded > 0) {
        await client.query(
          `INSERT INTO avatar_points_ledger (family_id, member_id, task_id, points, source)
           VALUES ($1, $2, $3, $4, 'task_complete')`,
          [familyId, actorMemberId, taskId, pointsAwarded]
        );
      }

      await client.query(
        `INSERT INTO audit_log (family_id, actor_member_id, action, entity_kind, entity_id, diff)
         VALUES ($1, $2, 'task.completed', 'task', $3, $4::jsonb)`,
        [familyId, actorMemberId, taskId, JSON.stringify({ pointsAwarded, newDueDate, completionId })]
      );

      // If this task has a thread, drop an activity card so the family
      // sees "Liam completed Walk dog (+5 points)" in the chat timeline.
      if (task.thread_id) {
        await client.query(
          `INSERT INTO messages (family_id, thread_id, author_member_id, kind, body_text)
           VALUES ($1, $2, NULL, 'activity', $3)`,
          [
            familyId,
            task.thread_id,
            JSON.stringify({
              kind: 'task_completed',
              taskTitle: task.title,
              memberId: actorMemberId,
              pointsAwarded
            })
          ]
        );
      }

      // Reschedule reminder for the new instance, or cancel if the task is
      // truly done.
      await cancelTaskReminder({ taskId, memberId: task.owner_member_id }).catch(() => {});
      if (newDueDate) {
        await scheduleTaskReminder({
          familyId,
          taskId,
          memberId: updated.owner_member_id,
          title: updated.title,
          dueDate: newDueDate
        }).catch(() => {});
      }

      return {
        task: rowToTask(updated),
        pointsAwarded,
        completionId,
        newDueDate
      };
    })
  );

/**
 * Sum of points credited to a member, optionally bounded to a window.
 * Used by chore-mode UI for the running total on the avatar tile.
 */
export const getMemberPoints = async ({ familyId, memberId, sinceIso }) =>
  withFamilyContext(familyId, async (client) => {
    const conds = ['member_id = $1'];
    const values = [memberId];
    if (sinceIso) {
      values.push(sinceIso);
      conds.push(`created_at >= $${values.length}`);
    }
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(points), 0)::int AS total FROM avatar_points_ledger WHERE ${conds.join(' AND ')}`,
      values
    );
    return rows[0]?.total ?? 0;
  });

// --- helpers -------------------------------------------------------------

const toDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return null;
};

const nextDueDate = async (task) => {
  const due = toDateOnly(task.due_date);
  if (!due) return null;
  if (task.recurrence === 'daily') return rollDate(due, 1);
  if (task.recurrence === 'weekly') return rollDate(due, 7);
  if (task.recurrence === 'custom' && task.rrule_text) {
    return nextOccurrenceFromRrule(due, task.rrule_text);
  }
  return null;
};

const rollDate = (yyyyMmDd, days) => {
  const date = new Date(`${yyyyMmDd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// Lazy import via dynamic import — `require` is unavailable in ESM.
const nextOccurrenceFromRrule = async (currentDueIso, rruleText) => {
  try {
    const rrulePkg = await import('rrule');
    const { rrulestr } = rrulePkg.default ?? rrulePkg;
    const rule = rrulestr(rruleText.replace(/^DTSTART[^\n]*\n?/i, ''), {
      dtstart: new Date(`${currentDueIso}T00:00:00Z`)
    });
    const next = rule.after(new Date(`${currentDueIso}T00:00:00Z`), false);
    return next ? next.toISOString().slice(0, 10) : null;
  } catch {
    return null;
  }
};

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
