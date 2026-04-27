// Decision Inbox + audit search (Phase 4.5 cross-pillar aggregators).
//
// Three reads — all RLS-scoped, all fast enough to run on the home
// screen without a noticeable wait. Together they power:
//   - the "3 things waiting on you" badge
//   - the Decision Inbox (proposals + due bills + late tasks + conflicts)
//   - the family memory search ("what did we decide about school fees?")
//
// Permission semantics: everything respects the active member's role.
//   - kids see only their own tasks; never money proposals or bills
//   - kids see calendar conflicts only when they're an attendee
//   - audit search respects the same filter

import { withFamilyContext } from '../db/pool.mjs';
import { findConflicts } from '../../src/domain/calendar.ts';
import { expandRecurrence } from '../../src/domain/recurrence.ts';

const isKid = (roleKey) => roleKey === 'child_limited';

/**
 * @param {{
 *   familyId: string,
 *   memberId: string,
 *   roleKey: 'parent_admin' | 'adult_editor' | 'child_limited',
 *   horizonDays?: number
 * }} args
 */
export const buildInbox = async ({ familyId, memberId, roleKey, horizonDays = 7 }) => {
  const horizonIso = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);

  return withFamilyContext(familyId, async (client) => {
    // 1. Open proposals where the active member is in requiredApprovers.
    //    Kids only see proposals on entities they're part of (own tasks);
    //    money proposals are filtered out by the proposal_kind list.
    const allowedKinds = isKid(roleKey)
      ? ['task_assignee_swap', 'task_reschedule_due', 'task_trade_for_reward', 'task_split', 'event_move', 'event_cancel', 'event_attendee_change']
      : null; // null = no filter for adults
    const proposalConds = [`status = 'open'`, `$1 = ANY(required_approvers)`];
    const proposalValues = [memberId];
    if (allowedKinds) {
      proposalValues.push(allowedKinds);
      proposalConds.push(`proposal_kind = ANY($${proposalValues.length}::text[])`);
    }
    const { rows: proposals } = await client.query(
      `SELECT id, thread_id, proposed_by_member_id, proposal_kind, entity_kind,
              entity_id, change, expires_at, created_at
         FROM proposals
        WHERE ${proposalConds.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 50`,
      proposalValues
    );

    // 2. Bills due in the horizon window — adults only.
    const bills = isKid(roleKey)
      ? []
      : (
          await client.query(
            `SELECT id, title, amount_cents, currency, due_date, category
               FROM bills
              WHERE paid = false
                AND due_date <= $1
              ORDER BY due_date
              LIMIT 50`,
            [horizonIso]
          )
        ).rows;

    // 3. Tasks assigned to the active member that are overdue or due
    //    today. Adults also see shared-task overflow.
    const taskValues = [memberId, todayIso];
    let taskWhere = `archived = false AND completed = false AND due_date <= $2 AND owner_member_id = $1`;
    if (!isKid(roleKey)) {
      taskWhere = `archived = false AND completed = false AND due_date <= $2 AND (owner_member_id = $1 OR shared = true)`;
    }
    const { rows: tasks } = await client.query(
      `SELECT id, title, due_date, priority, reward_points, owner_member_id
         FROM tasks
        WHERE ${taskWhere}
        ORDER BY due_date NULLS LAST, priority DESC
        LIMIT 50`,
      taskValues
    );

    // 4. Calendar conflicts in the next horizonDays for the active member.
    //    Kids see only conflicts they're part of.
    const horizonStart = new Date().toISOString();
    const horizonEnd = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000).toISOString();
    const { rows: eventRows } = await client.query(
      `SELECT e.id, e.title, e.starts_at, e.ends_at, e.rrule_text,
              COALESCE(array_agg(ea.member_id) FILTER (WHERE ea.member_id IS NOT NULL), '{}') AS attendee_ids
         FROM internal_events e
         LEFT JOIN event_attendees ea ON ea.event_id = e.id
        WHERE (e.rrule_text IS NOT NULL)
           OR (e.ends_at >= $1 AND e.starts_at <= $2)
        GROUP BY e.id`,
      [horizonStart, horizonEnd]
    );
    const expandable = eventRows.map((row) => ({
      id: row.id,
      title: row.title,
      provider: 'internal',
      calendarId: 'internal',
      start: { iso: row.starts_at, allDay: false },
      end: { iso: row.ends_at, allDay: false },
      source: 'internal',
      rruleText: row.rrule_text ?? null,
      attendeeIds: row.attendee_ids ?? []
    }));
    const expanded = expandRecurrence(expandable, horizonStart, horizonEnd);
    let conflicts = findConflicts(expanded);
    if (isKid(roleKey)) {
      conflicts = conflicts.filter((pair) => pair.sharedAttendeeIds.includes(memberId));
    }

    return {
      generatedAt: new Date().toISOString(),
      proposals: proposals.map((p) => ({
        id: p.id,
        threadId: p.thread_id,
        proposedByMemberId: p.proposed_by_member_id,
        kind: p.proposal_kind,
        entityKind: p.entity_kind,
        entityId: p.entity_id,
        change: typeof p.change === 'string' ? JSON.parse(p.change) : p.change,
        expiresAt: p.expires_at,
        createdAt: p.created_at
      })),
      bills: bills.map((b) => ({
        id: b.id,
        title: b.title,
        amountCents: Number(b.amount_cents),
        currency: b.currency,
        dueDate: b.due_date,
        category: b.category
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.due_date,
        priority: t.priority,
        rewardPoints: t.reward_points,
        ownerMemberId: t.owner_member_id
      })),
      conflicts: conflicts.slice(0, 20)
    };
  });
};

/**
 * Light-weight aggregate for the home-screen badge. Does the same
 * filtering logic as buildInbox but returns only counts.
 */
export const inboxCounts = async ({ familyId, memberId, roleKey }) => {
  const inbox = await buildInbox({ familyId, memberId, roleKey });
  return {
    proposals: inbox.proposals.length,
    bills: inbox.bills.length,
    tasks: inbox.tasks.length,
    conflicts: inbox.conflicts.length,
    total: inbox.proposals.length + inbox.bills.length + inbox.tasks.length + inbox.conflicts.length
  };
};

/**
 * Family-memory search across the audit log. Returns recent rows whose
 * action / diff payload matches `q`. Permission filter strips money +
 * member events for kids.
 */
export const searchAuditLog = async ({ familyId, memberId, roleKey, q, limit = 30 }) =>
  withFamilyContext(familyId, async (client) => {
    if (!q || typeof q !== 'string' || !q.trim()) {
      return { results: [], q: '' };
    }
    const term = `%${q.toLowerCase()}%`;

    const blockedActions = isKid(roleKey)
      ? [
          'budget.shifted',
          'bill.extra_payment',
          'debt.acceleration_set',
          'goal.contribution',
          'goal.created',
          'income.recorded',
          'expense.recorded',
          'invite.created',
          'invite.accepted',
          'subscription.updated',
          'subscription.canceled'
        ]
      : [];

    const conds = [`(LOWER(action) LIKE $1 OR LOWER(diff::text) LIKE $1)`];
    const values = [term];
    if (blockedActions.length) {
      values.push(blockedActions);
      conds.push(`action <> ALL($${values.length}::text[])`);
    }
    values.push(limit);

    const { rows } = await client.query(
      `SELECT id, action, entity_kind, entity_id, diff, actor_member_id, created_at
         FROM audit_log
        WHERE ${conds.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${values.length}`,
      values
    );
    return {
      q,
      results: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityKind: r.entity_kind,
        entityId: r.entity_id,
        diff: r.diff,
        actorMemberId: r.actor_member_id,
        createdAt: r.created_at
      }))
    };
  });
