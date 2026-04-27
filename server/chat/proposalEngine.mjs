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
import {
  contributeToGoal,
  createGoal,
  ensureBillThread,
  ensureBudgetThread,
  ensureDebtThread,
  ensureSavingsGoalThread,
  insertOneOffTransaction,
  recordBillExtraPayment,
  setDebtAcceleration,
  shiftBudgetCategory
} from '../money/moneyStore.mjs';
import { fanOutProposalPush } from './proposalPush.mjs';
import { broadcast } from '../realtime/sse.mjs';

const TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Counter an existing proposal: mark the original 'countered' (closed,
 * with a pointer to the replacement) and propose the new change in one
 * transaction. The original's audit trail stays intact; the new
 * proposal goes through the normal propose path so realtime fan-out +
 * push notifications work as usual.
 *
 * @param {{
 *   familyId: string,
 *   originalProposalId: string,
 *   proposer: object,
 *   family: object[],
 *   change: object,
 *   entityId: string,
 *   threadId?: string
 * }} args
 */
export const counterProposal = async ({
  familyId,
  originalProposalId,
  proposer,
  family,
  change,
  entityId,
  threadId
}) => {
  const result = await proposeChange({
    familyId,
    proposer,
    family,
    change,
    entityId,
    threadId
  });
  // Close the original out-of-tx (a small race is acceptable; audit log
  // captures the order) — the only consequence of the original staying
  // 'open' for a few ms is an extra realtime event.
  const { getPool } = await import('../db/pool.mjs');
  const pool = getPool();
  await pool.query(
    `UPDATE proposals
        SET status = 'countered', countered_by_proposal_id = $2
      WHERE id = $1 AND status = 'open'`,
    [originalProposalId, result.proposal.id]
  );
  await pool.query(
    `INSERT INTO audit_log (family_id, actor_member_id, action, entity_kind, entity_id, diff)
     VALUES ($1, $2, 'proposal.countered', 'proposal', $3, $4::jsonb)`,
    [familyId, proposer.id, originalProposalId, JSON.stringify({ replacedBy: result.proposal.id })]
  );
  broadcast({
    type: 'proposal.countered',
    familyId,
    proposalId: originalProposalId,
    counteredByProposalId: result.proposal.id
  });
  return result;
};

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
        switch (entityKind) {
          case 'event':
            resolvedThreadId = await ensureEventThread({ familyId, eventId: entityId });
            break;
          case 'task':
            resolvedThreadId = await ensureTaskThread({ familyId, taskId: entityId });
            break;
          case 'bill':
            resolvedThreadId = await ensureBillThread({ familyId, entityId });
            break;
          case 'budget':
            // For budget proposals the entityId is the YYYY-MM month — there
            // may be no row yet. Fall through and require an explicit
            // threadId in that case (typed via the family thread).
            break;
          case 'debt':
            resolvedThreadId = await ensureDebtThread({ familyId, entityId });
            break;
          case 'savings_goal':
            // goal_create has no entity yet; only goal_contribution does.
            if (change.kind === 'goal_contribution') {
              resolvedThreadId = await ensureSavingsGoalThread({ familyId, entityId });
            }
            break;
          default:
            break;
        }
      }
      if (!resolvedThreadId) {
        // Fall back to the family thread for proposals with no per-entity
        // thread (e.g. goal_create, budget shifts on a brand-new month).
        const { rows: famThread } = await client.query(
          `SELECT id FROM threads WHERE family_id = $1 AND kind = 'family' LIMIT 1`,
          [familyId]
        );
        resolvedThreadId = famThread[0]?.id ?? null;
      }
      if (!resolvedThreadId) {
        const err = new Error('no thread available for this proposal');
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

      const result = { proposal: rowToProposal(proposalRow), messageId: messageRows[0].id };

      // Realtime fan-out — every connected client in the family sees the
      // proposal land immediately, so the [Agree]/[Decline] card renders
      // in the thread without a refresh.
      broadcast({
        type: 'proposal.created',
        familyId,
        threadId: resolvedThreadId,
        proposal: result.proposal,
        messageId: result.messageId
      });

      // Push fan-out happens out-of-tx so a slow web-push provider doesn't
      // block the propose request. Best-effort.
      fanOutProposalPush({
        familyId,
        proposalId: proposalRow.id,
        proposerName: proposer.displayName,
        summary: proposalSummary(change),
        approverIds: required
      }).catch(() => {});

      return result;
    })
  );
};

const proposalSummary = (change) => {
  switch (change.kind) {
    case 'event_move':
      return `Move event to ${change.newStartIso?.slice(0, 16) ?? 'a new time'}`;
    case 'event_cancel':
      return 'Cancel this event';
    case 'task_assignee_swap':
      return `Swap chore (${change.swaps?.length ?? 0} task${(change.swaps?.length ?? 0) === 1 ? '' : 's'})`;
    case 'task_reschedule_due':
      return change.newDueDate ? `Reschedule task to ${change.newDueDate}` : 'Clear task due date';
    case 'budget_category_shift':
      return `Move R${(change.amountCents / 100).toFixed(0)} from ${change.fromCategory} → ${change.toCategory}`;
    case 'bill_extra_payment':
      return `Add R${(change.extraAmountCents / 100).toFixed(0)} extra to bill`;
    case 'debt_acceleration':
      return `Pay R${(change.monthlyExtraCents / 100).toFixed(0)} extra to debt monthly`;
    case 'goal_contribution':
      return `Add R${(change.amountCents / 100).toFixed(0)} to goal`;
    case 'goal_create':
      return `New goal: ${change.title}`;
    default:
      return 'New proposal';
  }
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

      // Realtime fan-out for the applied transition — connected clients
      // flip the proposal card from 'open' → 'applied' instantly + can
      // refresh the underlying entity via the diff payload.
      broadcast({
        type: 'proposal.applied',
        familyId,
        threadId: row.thread_id,
        proposalId,
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

    case 'budget_shift':
      await shiftBudgetCategory({
        familyId,
        actorMemberId,
        monthIso: diff.monthIso,
        fromCategory: diff.fromCategory,
        toCategory: diff.toCategory,
        amountCents: diff.amountCents,
        currency: diff.currency
      });
      return;

    case 'bill_extra_payment':
      await recordBillExtraPayment({
        familyId,
        actorMemberId,
        billId: diff.billId,
        extraAmountCents: diff.extraAmountCents,
        currency: diff.currency
      });
      return;

    case 'debt_acceleration_set':
      await setDebtAcceleration({
        familyId,
        actorMemberId,
        debtId: diff.debtId,
        monthlyExtraCents: diff.monthlyExtraCents,
        currency: diff.currency
      });
      return;

    case 'goal_contribute':
      await contributeToGoal({
        familyId,
        actorMemberId,
        goalId: diff.goalId,
        amountCents: diff.amountCents,
        currency: diff.currency
      });
      return;

    case 'goal_create':
      await createGoal({
        familyId,
        actorMemberId,
        title: diff.title,
        targetCents: diff.targetCents,
        currency: diff.currency,
        targetDate: diff.targetDate
      });
      return;

    case 'transaction_insert':
      await insertOneOffTransaction({
        familyId,
        actorMemberId,
        title: diff.title,
        amountCents: diff.amountCents,
        currency: diff.currency,
        dateIso: diff.dateIso,
        flow: diff.flow
      });
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
  if (entityKind === 'bill') {
    const { rows } = await client.query(
      `SELECT id, title, amount_cents, currency, due_date FROM bills WHERE id = $1`,
      [entityId]
    );
    return rows[0] ?? null;
  }
  if (entityKind === 'debt') {
    const { rows } = await client.query(
      `SELECT id, title, principal_cents, apr_bps, min_payment_cents, currency
         FROM debts WHERE id = $1`,
      [entityId]
    );
    return rows[0] ?? null;
  }
  if (entityKind === 'savings_goal') {
    const { rows } = await client.query(
      `SELECT id, title, target_cents, saved_cents, currency
         FROM savings_goals WHERE id = $1`,
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
