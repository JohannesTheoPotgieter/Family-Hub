// Connective-chat proposal engine (Phase 1.9 + Phase 3.6).
//
// Server side of the proposal lifecycle:
//   propose  → row in `proposals`, plus a 'proposal' message in the thread
//   approve  → record approval; if quorum reached, call applyDiff atomically
//   decline  → close the proposal (counter is a fresh proposal)
//
// All approval logic lives in src/domain/proposals.ts (pure). This module
// owns the DB transaction + the entity-mutation step. Each proposal kind
// maps to a typed `EntityDiff`; Phase 1 ships the event-related diffs
// (event_update, event_attendees_update). Task + money diffs land alongside
// Phases 2.7 and 4.9.

import { getPool, withFamilyContext, withTransaction } from '../db/pool.mjs';
import {
  applyProposal,
  isApprovalDeclined,
  requiredApprovers,
  validateProposal
} from '../../src/domain/proposals.ts';
import { ensureEventThread, updateEvent } from '../calendar/eventStore.mjs';
import { ensureTaskThread, updateTask } from '../tasks/taskStore.mjs';

const TTL_MS = 72 * 60 * 60 * 1000;

const proposalEntityKindFor = (changeKind) => {
  if (changeKind.startsWith('event_')) return 'event';
  if (changeKind.startsWith('task_')) return 'task';
  if (changeKind === 'goal_create' || changeKind === 'goal_contribution') return 'savings_goal';
  if (changeKind === 'bill_extra_payment') return 'bill';
  if (changeKind === 'debt_acceleration') return 'debt';
  if (changeKind === 'budget_category_shift') return 'budget';
  return 'transaction';
};

/**
 * Author a new proposal. Returns the inserted row + the thread message id.
 *
 * @param {{
 *   familyId: string,
 *   proposer: { id: string, roleKey: string, displayName: string },
 *   family: { id: string, roleKey: string, displayName: string }[],
 *   change: object,
 *   entityId: string,
 *   threadId?: string,
 *   nowIso?: string
 * }} args
 */
export const proposeChange = async ({
  familyId,
  proposer,
  family,
  change,
  entityId,
  threadId,
  nowIso = new Date().toISOString()
}) => {
  const errors = validateProposal(change, proposer);
  if (errors.length) {
    const err = new Error('proposal_invalid');
    err.status = 400;
    err.errors = errors;
    throw err;
  }

  const required = requiredApprovers(change, proposer, family);
  const approvals = Object.fromEntries(required.map((id) => [id, 'pending']));
  const expiresAt = new Date(Date.parse(nowIso) + TTL_MS).toISOString();
  const entityKind = proposalEntityKindFor(change.kind);

  return withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      // Resolve the object thread for the entity. Lazy-creation lives on
      // the entity's own store module so a fresh propose-on-detail-screen
      // works without setup.
      let resolvedThreadId = threadId;
      if (!resolvedThreadId) {
        if (entityKind === 'event') {
          resolvedThreadId = await ensureEventThread({ familyId, eventId: entityId });
        } else if (entityKind === 'task') {
          resolvedThreadId = await ensureTaskThread({ familyId, taskId: entityId });
        }
      }
      if (!resolvedThreadId) {
        const err = new Error('threadId is required for this entity kind in this build');
        err.status = 400;
        throw err;
      }

      // Snapshot the entity at proposal time so we can detect drift on apply.
      const snapshot = await snapshotEntity(client, entityKind, entityId);

      const { rows: proposalRows } = await client.query(
        `INSERT INTO proposals (
            family_id, thread_id, proposed_by_member_id, proposal_kind,
            entity_kind, entity_id, change, entity_snapshot,
            required_approvers, approvals, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          familyId,
          resolvedThreadId,
          proposer.id,
          change.kind,
          entityKind,
          entityId,
          JSON.stringify(change),
          JSON.stringify(snapshot ?? {}),
          required,
          JSON.stringify(approvals),
          expiresAt
        ]
      );
      const proposalRow = proposalRows[0];

      const { rows: messageRows } = await client.query(
        `INSERT INTO messages (family_id, thread_id, author_member_id, kind, body_text, proposal_id)
         VALUES ($1,$2,$3,'proposal',$4,$5) RETURNING id`,
        [familyId, resolvedThreadId, proposer.id, '[proposal]', proposalRow.id]
      );

      return { proposal: rowToProposal(proposalRow), messageId: messageRows[0].id };
    })
  );
};

/**
 * Record an approval decision and, if the proposal now has full consensus,
 * apply the entity diff in the same transaction. Returns the post-decision
 * proposal state plus the diff (when applied).
 *
 * @param {{
 *   familyId: string,
 *   proposalId: string,
 *   memberId: string,
 *   decision: 'agree' | 'decline',
 *   actorRoleKey: 'parent_admin' | 'adult_editor' | 'child_limited',
 *   actorPermissions: string[]
 * }} args
 */
export const decideOnProposal = async ({
  familyId,
  proposalId,
  memberId,
  decision,
  actorRoleKey,
  actorPermissions
}) => {
  if (decision !== 'agree' && decision !== 'decline') {
    const err = new Error('decision must be agree|decline');
    err.status = 400;
    throw err;
  }

  return withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rows } = await client.query(
        `SELECT * FROM proposals WHERE id = $1 FOR UPDATE`,
        [proposalId]
      );
      if (!rows.length) {
        const err = new Error('proposal not found');
        err.status = 404;
        throw err;
      }
      const row = rows[0];

      if (row.status !== 'open') {
        const err = new Error(`proposal is ${row.status}`);
        err.status = 409;
        throw err;
      }
      if (Date.parse(row.expires_at) < Date.now()) {
        await client.query(`UPDATE proposals SET status = 'expired' WHERE id = $1`, [proposalId]);
        const err = new Error('proposal expired');
        err.status = 410;
        throw err;
      }
      if (!row.required_approvers.includes(memberId)) {
        const err = new Error('not an approver for this proposal');
        err.status = 403;
        throw err;
      }

      // Server-side enforcement of the role-permission check that mirrors
      // the client UI hint. Two-key money requires the approver actually
      // has proposal_approve_money — UI bypass attempts get 403.
      const approveKey = `proposal_approve_${proposalEntityKindFor(row.proposal_kind) === 'event' ? 'event' : proposalEntityKindFor(row.proposal_kind) === 'task' ? 'task' : 'money'}`;
      if (!actorPermissions.includes(approveKey)) {
        const err = new Error('forbidden');
        err.status = 403;
        err.permission = approveKey;
        throw err;
      }

      const approvals = { ...row.approvals, [memberId]: decision };

      // Build the in-memory proposal that domain code expects.
      const proposal = rowToProposal({ ...row, approvals });

      // Record decline first so it short-circuits.
      if (isApprovalDeclined(proposal)) {
        await client.query(
          `UPDATE proposals SET approvals = $2, status = 'declined' WHERE id = $1`,
          [proposalId, JSON.stringify(approvals)]
        );
        await audit(client, {
          familyId,
          actorMemberId: memberId,
          action: 'proposal.declined',
          entityKind: 'proposal',
          entityId: proposalId,
          diff: { decision, by: memberId }
        });
        return { proposal: { ...proposal, status: 'declined' }, diff: null };
      }

      // Save the agreement first so re-running applyDiff is safe.
      await client.query(
        `UPDATE proposals SET approvals = $2 WHERE id = $1`,
        [proposalId, JSON.stringify(approvals)]
      );

      const result = applyProposal({ ...proposal, approvals });
      if (!result.ok) {
        // Pure validator says we're not done — common for "needs another
        // approver". Audit the partial decision and return.
        await audit(client, {
          familyId,
          actorMemberId: memberId,
          action: 'proposal.approval_recorded',
          entityKind: 'proposal',
          entityId: proposalId,
          diff: { decision, by: memberId }
        });
        return { proposal: { ...proposal, approvals }, diff: null };
      }

      const diff = result.diff;
      await applyDiff(client, {
        familyId,
        actorMemberId: memberId,
        diff,
        proposalId
      });

      await client.query(
        `UPDATE proposals SET status = 'applied', applied_at = now() WHERE id = $1`,
        [proposalId]
      );
      await audit(client, {
        familyId,
        actorMemberId: memberId,
        action: 'proposal.applied',
        entityKind: 'proposal',
        entityId: proposalId,
        diff
      });

      return { proposal: { ...proposal, status: 'applied', approvals }, diff };
    })
  );
};

// --- diff application ----------------------------------------------------

const applyDiff = async (client, { familyId, actorMemberId, diff, proposalId }) => {
  switch (diff.kind) {
    case 'event_update':
      await updateEvent({
        familyId,
        actorMemberId,
        eventId: diff.eventId,
        patch: {
          startsAt: diff.patch.startsAt,
          endsAt: diff.patch.endsAt,
          // Cancel = soft-delete via title prefix? No — schema has no
          // canceled column today. Until that lands (Phase 1 follow-up),
          // event_cancel maps to a delete; the event_update path with
          // canceled=true is reserved.
        }
      });
      if (diff.patch.canceled) {
        // event_cancel collapses to delete in this build. The Phase 3 chat
        // UI surfaces "Cancelled" as a timeline activity card.
        const { deleteEvent } = await import('../calendar/eventStore.mjs');
        await deleteEvent({ familyId, actorMemberId, eventId: diff.eventId });
      }
      return;

    case 'task_update':
      await updateTask({
        familyId,
        actorMemberId,
        taskId: diff.taskId,
        patch: {
          ownerMemberId: diff.patch.ownerMemberId,
          dueDate: diff.patch.dueDate,
          // rewardPointsDelta is a relative bump — turn it into the absolute
          // new value via a tiny read inside the same transaction. We do
          // this inline because the store API takes absolute values.
          ...(typeof diff.patch.rewardPointsDelta === 'number'
            ? await applyRewardDelta(client, diff.taskId, diff.patch.rewardPointsDelta)
            : {})
        }
      });
      return;

    case 'tasks_swap':
      // Swap is just multiple owner changes; iterate so each goes through
      // the audited updateTask path with reminder rescheduling.
      for (const swap of diff.swaps) {
        await updateTask({
          familyId,
          actorMemberId,
          taskId: swap.taskId,
          patch: { ownerMemberId: swap.newOwnerMemberId }
        });
      }
      return;

    case 'event_attendees_update': {
      // We re-derive the new attendee set inside the transaction so a
      // concurrent invitation can't be silently overwritten.
      const { rows } = await client.query(
        `SELECT member_id FROM event_attendees WHERE event_id = $1`,
        [diff.eventId]
      );
      const current = new Set(rows.map((r) => r.member_id));
      for (const id of diff.add) current.add(id);
      for (const id of diff.remove) current.delete(id);

      await client.query(`DELETE FROM event_attendees WHERE event_id = $1`, [diff.eventId]);
      if (current.size) {
        const ids = [...current];
        const placeholders = ids
          .map((id, i) => `($1, $${i + 2}, 'pending', false)`)
          .join(', ');
        await client.query(
          `INSERT INTO event_attendees (event_id, member_id, rsvp, is_organizer)
             VALUES ${placeholders}`,
          [diff.eventId, ...ids]
        );
      }
      return;
    }

    default: {
      const err = new Error(`diff kind ${diff.kind} not supported in this build`);
      err.status = 501;
      throw err;
    }
  }
};

const applyRewardDelta = async (client, taskId, delta) => {
  const { rows } = await client.query(
    `SELECT reward_points FROM tasks WHERE id = $1`,
    [taskId]
  );
  if (!rows.length) return {};
  return { rewardPoints: Math.max(0, rows[0].reward_points + delta) };
};

// --- helpers -------------------------------------------------------------

const snapshotEntity = async (client, entityKind, entityId) => {
  if (entityKind === 'event') {
    const { rows } = await client.query(
      `SELECT id, title, starts_at, ends_at, all_day FROM internal_events WHERE id = $1`,
      [entityId]
    );
    return rows[0] ?? null;
  }
  if (entityKind === 'task') {
    const { rows } = await client.query(
      `SELECT id, title, owner_member_id, due_date, reward_points FROM tasks WHERE id = $1`,
      [entityId]
    );
    return rows[0] ?? null;
  }
  return null;
};

const rowToProposal = (row) => ({
  id: row.id,
  threadId: row.thread_id,
  proposedByMemberId: row.proposed_by_member_id,
  entityKind: row.entity_kind,
  entityId: row.entity_id,
  change: typeof row.change === 'string' ? JSON.parse(row.change) : row.change,
  requiredApprovers: row.required_approvers,
  approvals:
    typeof row.approvals === 'string' ? JSON.parse(row.approvals) : row.approvals,
  status: row.status,
  createdAtIso: row.created_at,
  expiresAtIso: row.expires_at
});

const audit = async (client, { familyId, actorMemberId, action, entityKind, entityId, diff }) => {
  await client.query(
    `INSERT INTO audit_log (family_id, actor_member_id, action, entity_kind, entity_id, diff)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [familyId, actorMemberId, action, entityKind, entityId, JSON.stringify(diff)]
  );
};
