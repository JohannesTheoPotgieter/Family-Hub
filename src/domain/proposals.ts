// Connective Chat — proposal domain (Phase 0.11 + Phase 3.6).
//
// A *Proposal* is a typed, reviewable diff against a family entity (event,
// task, bill, transaction, debt, savings goal). Proposals carry their own
// approval rules; on consensus, `applyProposal` produces a new entity state
// that the server commits inside a transaction with an audit-log row.
//
// Everything in this module is pure: no I/O, no globals. The server's
// proposal engine wraps these primitives in a DB transaction; the client uses
// them for optimistic UI + diff previews. Tests live in
// src/test/proposals.test.mjs.

import type { PermissionKey } from '../config/permissions.ts';

// --- Identity ------------------------------------------------------------

export type MemberId = string;
export type EntityId = string;
export type ProposalId = string;
export type ThreadId = string;

export type FamilyRoleKey = 'parent_admin' | 'adult_editor' | 'child_limited';

export type FamilyMember = {
  id: MemberId;
  roleKey: FamilyRoleKey;
  displayName: string;
};

export type EntityKind = 'event' | 'task' | 'bill' | 'transaction' | 'budget' | 'savings_goal' | 'debt';

// --- Proposal kinds ------------------------------------------------------

// Each proposal kind binds an entity kind to a structured `change` payload.
// Adding a kind is two changes: a row here + a case in `applyProposal`.

export type EventMoveChange = {
  kind: 'event_move';
  newStartIso: string;
  newEndIso: string;
};

export type EventAttendeeChange = {
  kind: 'event_attendee_change';
  add: MemberId[];
  remove: MemberId[];
};

export type EventCancelChange = { kind: 'event_cancel' };

export type TaskAssigneeSwapChange = {
  kind: 'task_assignee_swap';
  // Pairs of "this task moves to that owner". A single chore swap is one entry.
  swaps: { taskId: EntityId; newOwnerMemberId: MemberId }[];
};

export type TaskRescheduleDueChange = {
  kind: 'task_reschedule_due';
  newDueDate: string | null;
};

export type TaskTradeForRewardChange = {
  kind: 'task_trade_for_reward';
  newOwnerMemberId: MemberId;
  rewardPointsDelta: number;
};

export type BudgetCategoryShiftChange = {
  kind: 'budget_category_shift';
  monthIso: string; // YYYY-MM
  fromCategory: string;
  toCategory: string;
  amountCents: number; // positive — engine subtracts from `from`, adds to `to`
  currency: string;
};

export type BillExtraPaymentChange = {
  kind: 'bill_extra_payment';
  extraAmountCents: number;
  currency: string;
};

export type DebtAccelerationChange = {
  kind: 'debt_acceleration';
  monthlyExtraCents: number;
  currency: string;
};

export type GoalContributionChange = {
  kind: 'goal_contribution';
  amountCents: number;
  currency: string;
};

export type GoalCreateChange = {
  kind: 'goal_create';
  title: string;
  targetCents: number;
  currency: string;
  targetDate: string | null;
};

export type IncomeOneOffChange = {
  kind: 'income_one_off';
  title: string;
  amountCents: number;
  currency: string;
  dateIso: string;
};

export type ExpenseOneOffChange = {
  kind: 'expense_one_off';
  title: string;
  amountCents: number;
  currency: string;
  dateIso: string;
};

export type ProposalChange =
  | EventMoveChange
  | EventAttendeeChange
  | EventCancelChange
  | TaskAssigneeSwapChange
  | TaskRescheduleDueChange
  | TaskTradeForRewardChange
  | BudgetCategoryShiftChange
  | BillExtraPaymentChange
  | DebtAccelerationChange
  | GoalContributionChange
  | GoalCreateChange
  | IncomeOneOffChange
  | ExpenseOneOffChange;

export type ProposalKind = ProposalChange['kind'];

export type ApprovalState = 'pending' | 'agree' | 'decline';

export type Proposal = {
  id: ProposalId;
  threadId: ThreadId;
  proposedByMemberId: MemberId;
  entityKind: EntityKind;
  entityId: EntityId;
  change: ProposalChange;
  requiredApprovers: MemberId[];
  approvals: Record<MemberId, ApprovalState>;
  status: 'open' | 'applied' | 'declined' | 'expired' | 'countered';
  createdAtIso: string;
  expiresAtIso: string;
};

// --- Family-level configuration ------------------------------------------

export type ProposalFamilyConfig = {
  // Money proposals at or above this threshold require both adult parents/editors.
  twoKeyMoneyThresholdCents: number;
  // If false, kids cannot propose money changes regardless of role permissions.
  // Defaults to false. Visible in Settings.
  allowKidsToProposeMoney: boolean;
  // Lifetime of a proposal before it auto-expires.
  proposalTtlHours: number;
};

export const DEFAULT_PROPOSAL_CONFIG: ProposalFamilyConfig = {
  twoKeyMoneyThresholdCents: 25000, // R250
  allowKidsToProposeMoney: false,
  proposalTtlHours: 72
};

// --- Approval logic ------------------------------------------------------

const isAdult = (m: FamilyMember) => m.roleKey === 'parent_admin' || m.roleKey === 'adult_editor';
const isKid = (m: FamilyMember) => m.roleKey === 'child_limited';

const moneyAmountCents = (change: ProposalChange): number => {
  switch (change.kind) {
    case 'budget_category_shift':
    case 'goal_contribution':
    case 'income_one_off':
    case 'expense_one_off':
      return Math.abs(change.amountCents);
    case 'bill_extra_payment':
      return Math.abs(change.extraAmountCents);
    case 'debt_acceleration':
      return Math.abs(change.monthlyExtraCents);
    case 'goal_create':
      return change.targetCents;
    default:
      return 0;
  }
};

export const isMoneyProposal = (change: ProposalChange): boolean =>
  moneyAmountCents(change) > 0 || change.kind === 'goal_create';

export const requiredPermissionToCreate = (change: ProposalChange): PermissionKey => {
  switch (change.kind) {
    case 'event_move':
    case 'event_attendee_change':
    case 'event_cancel':
      return 'proposal_create_event';
    case 'task_assignee_swap':
    case 'task_reschedule_due':
    case 'task_trade_for_reward':
      return 'proposal_create_task';
    default:
      return 'proposal_create_money';
  }
};

export const requiredPermissionToApprove = (change: ProposalChange): PermissionKey => {
  switch (change.kind) {
    case 'event_move':
    case 'event_attendee_change':
    case 'event_cancel':
      return 'proposal_approve_event';
    case 'task_assignee_swap':
    case 'task_reschedule_due':
    case 'task_trade_for_reward':
      return 'proposal_approve_task';
    default:
      return 'proposal_approve_money';
  }
};

/**
 * Decide which family members must agree before a proposal applies.
 *
 * Rules:
 * 1. The proposer is implicitly counted (their proposal is their consent).
 * 2. For money proposals at or above the two-key threshold: both adults.
 * 3. For task changes that move ownership: the new owner is included.
 * 4. For all other proposals: at least one adult who isn't the proposer.
 */
export const requiredApprovers = (
  change: ProposalChange,
  proposedBy: FamilyMember,
  family: FamilyMember[],
  config: ProposalFamilyConfig = DEFAULT_PROPOSAL_CONFIG
): MemberId[] => {
  const others = family.filter((m) => m.id !== proposedBy.id);
  const adults = others.filter(isAdult);

  const set = new Set<MemberId>();

  if (isMoneyProposal(change)) {
    const amount = moneyAmountCents(change);
    if (amount >= config.twoKeyMoneyThresholdCents) {
      // Two-key: every adult who isn't the proposer must agree.
      adults.forEach((m) => set.add(m.id));
    } else if (adults.length > 0) {
      // Below threshold: any one adult.
      set.add(adults[0].id);
    }
  } else {
    // Non-money: at least one adult signs off (defaults to first adult).
    if (adults.length > 0) set.add(adults[0].id);
  }

  // Task swaps include the new owner as an approver.
  if (change.kind === 'task_assignee_swap') {
    for (const swap of change.swaps) {
      if (swap.newOwnerMemberId !== proposedBy.id) set.add(swap.newOwnerMemberId);
    }
  }
  if (change.kind === 'task_trade_for_reward' && change.newOwnerMemberId !== proposedBy.id) {
    set.add(change.newOwnerMemberId);
  }
  // Attendee additions get a courtesy approver entry (added members can
  // decline being added to an event).
  if (change.kind === 'event_attendee_change') {
    for (const id of change.add) if (id !== proposedBy.id) set.add(id);
  }

  return [...set];
};

export const isApprovalComplete = (proposal: Proposal): boolean =>
  proposal.requiredApprovers.every((id) => proposal.approvals[id] === 'agree');

export const isApprovalDeclined = (proposal: Proposal): boolean =>
  proposal.requiredApprovers.some((id) => proposal.approvals[id] === 'decline');

// --- Validation ----------------------------------------------------------

export type ValidationError = { code: string; message: string };

const err = (code: string, message: string): ValidationError => ({ code, message });

/**
 * Returns [] if the proposal is well-formed and the proposer is allowed to
 * create it. Returns one or more validation errors otherwise.
 */
export const validateProposal = (
  change: ProposalChange,
  proposedBy: FamilyMember,
  config: ProposalFamilyConfig = DEFAULT_PROPOSAL_CONFIG
): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (isKid(proposedBy) && isMoneyProposal(change) && !config.allowKidsToProposeMoney) {
    errors.push(err('kids_money_disabled', 'Kids cannot create money proposals in this family.'));
  }

  switch (change.kind) {
    case 'event_move':
      if (Number.isNaN(Date.parse(change.newStartIso)) || Number.isNaN(Date.parse(change.newEndIso))) {
        errors.push(err('invalid_iso', 'event_move requires valid ISO timestamps.'));
      } else if (Date.parse(change.newEndIso) < Date.parse(change.newStartIso)) {
        errors.push(err('end_before_start', 'event_move end must be ≥ start.'));
      }
      break;
    case 'task_assignee_swap':
      if (!Array.isArray(change.swaps) || change.swaps.length === 0) {
        errors.push(err('empty_swaps', 'task_assignee_swap requires at least one swap.'));
      }
      break;
    case 'budget_category_shift':
      if (change.amountCents <= 0) errors.push(err('non_positive_amount', 'amountCents must be > 0.'));
      if (change.fromCategory === change.toCategory) {
        errors.push(err('same_category', 'fromCategory and toCategory must differ.'));
      }
      if (!/^\d{4}-\d{2}$/.test(change.monthIso)) {
        errors.push(err('invalid_month', 'monthIso must be YYYY-MM.'));
      }
      break;
    case 'bill_extra_payment':
      if (change.extraAmountCents <= 0) errors.push(err('non_positive_amount', 'extraAmountCents must be > 0.'));
      break;
    case 'debt_acceleration':
      if (change.monthlyExtraCents <= 0) errors.push(err('non_positive_amount', 'monthlyExtraCents must be > 0.'));
      break;
    case 'goal_contribution':
    case 'income_one_off':
    case 'expense_one_off':
      if (change.amountCents <= 0) errors.push(err('non_positive_amount', 'amountCents must be > 0.'));
      break;
    case 'goal_create':
      if (change.targetCents <= 0) errors.push(err('non_positive_target', 'targetCents must be > 0.'));
      if (!change.title.trim()) errors.push(err('empty_title', 'goal title is required.'));
      break;
    default:
      break;
  }

  return errors;
};

// --- Apply ---------------------------------------------------------------

// `applyProposal` returns a typed diff describing the mutation. The server
// turns each diff into a concrete UPDATE/INSERT inside a transaction; the
// client uses it to build optimistic UI. Keeping it data, not code, means the
// audit log captures exactly what happened.

export type EntityDiff =
  | { kind: 'event_update'; eventId: EntityId; patch: { startsAt?: string; endsAt?: string; canceled?: boolean } }
  | { kind: 'event_attendees_update'; eventId: EntityId; add: MemberId[]; remove: MemberId[] }
  | { kind: 'task_update'; taskId: EntityId; patch: { ownerMemberId?: MemberId; dueDate?: string | null; rewardPointsDelta?: number } }
  | { kind: 'tasks_swap'; swaps: { taskId: EntityId; newOwnerMemberId: MemberId }[] }
  | { kind: 'budget_shift'; monthIso: string; fromCategory: string; toCategory: string; amountCents: number; currency: string }
  | { kind: 'bill_extra_payment'; billId: EntityId; extraAmountCents: number; currency: string }
  | { kind: 'debt_acceleration_set'; debtId: EntityId; monthlyExtraCents: number; currency: string }
  | { kind: 'goal_contribute'; goalId: EntityId; amountCents: number; currency: string }
  | { kind: 'goal_create'; title: string; targetCents: number; currency: string; targetDate: string | null }
  | { kind: 'transaction_insert'; title: string; amountCents: number; currency: string; dateIso: string; flow: 'inflow' | 'outflow' };

export type ApplyResult =
  | { ok: true; diff: EntityDiff }
  | { ok: false; errors: ValidationError[] };

export const applyProposal = (proposal: Proposal): ApplyResult => {
  if (!isApprovalComplete(proposal)) {
    return { ok: false, errors: [err('approval_incomplete', 'Proposal does not have all required approvals yet.')] };
  }
  if (proposal.status !== 'open') {
    return { ok: false, errors: [err('not_open', `Proposal status is ${proposal.status}, not open.`)] };
  }
  if (Date.now() > Date.parse(proposal.expiresAtIso)) {
    return { ok: false, errors: [err('expired', 'Proposal has expired.')] };
  }

  const change = proposal.change;
  switch (change.kind) {
    case 'event_move':
      return {
        ok: true,
        diff: {
          kind: 'event_update',
          eventId: proposal.entityId,
          patch: { startsAt: change.newStartIso, endsAt: change.newEndIso }
        }
      };
    case 'event_cancel':
      return { ok: true, diff: { kind: 'event_update', eventId: proposal.entityId, patch: { canceled: true } } };
    case 'event_attendee_change':
      return {
        ok: true,
        diff: { kind: 'event_attendees_update', eventId: proposal.entityId, add: change.add, remove: change.remove }
      };
    case 'task_assignee_swap':
      return { ok: true, diff: { kind: 'tasks_swap', swaps: change.swaps } };
    case 'task_reschedule_due':
      return {
        ok: true,
        diff: { kind: 'task_update', taskId: proposal.entityId, patch: { dueDate: change.newDueDate } }
      };
    case 'task_trade_for_reward':
      return {
        ok: true,
        diff: {
          kind: 'task_update',
          taskId: proposal.entityId,
          patch: { ownerMemberId: change.newOwnerMemberId, rewardPointsDelta: change.rewardPointsDelta }
        }
      };
    case 'budget_category_shift':
      return {
        ok: true,
        diff: {
          kind: 'budget_shift',
          monthIso: change.monthIso,
          fromCategory: change.fromCategory,
          toCategory: change.toCategory,
          amountCents: change.amountCents,
          currency: change.currency
        }
      };
    case 'bill_extra_payment':
      return {
        ok: true,
        diff: {
          kind: 'bill_extra_payment',
          billId: proposal.entityId,
          extraAmountCents: change.extraAmountCents,
          currency: change.currency
        }
      };
    case 'debt_acceleration':
      return {
        ok: true,
        diff: {
          kind: 'debt_acceleration_set',
          debtId: proposal.entityId,
          monthlyExtraCents: change.monthlyExtraCents,
          currency: change.currency
        }
      };
    case 'goal_contribution':
      return {
        ok: true,
        diff: {
          kind: 'goal_contribute',
          goalId: proposal.entityId,
          amountCents: change.amountCents,
          currency: change.currency
        }
      };
    case 'goal_create':
      return {
        ok: true,
        diff: {
          kind: 'goal_create',
          title: change.title,
          targetCents: change.targetCents,
          currency: change.currency,
          targetDate: change.targetDate
        }
      };
    case 'income_one_off':
      return {
        ok: true,
        diff: {
          kind: 'transaction_insert',
          title: change.title,
          amountCents: change.amountCents,
          currency: change.currency,
          dateIso: change.dateIso,
          flow: 'inflow'
        }
      };
    case 'expense_one_off':
      return {
        ok: true,
        diff: {
          kind: 'transaction_insert',
          title: change.title,
          amountCents: change.amountCents,
          currency: change.currency,
          dateIso: change.dateIso,
          flow: 'outflow'
        }
      };
  }
};

// --- Counter -------------------------------------------------------------

export const counterProposal = (
  original: Proposal,
  counterChange: ProposalChange,
  proposer: FamilyMember,
  family: FamilyMember[],
  config: ProposalFamilyConfig = DEFAULT_PROPOSAL_CONFIG,
  nowIso: string = new Date().toISOString()
): Proposal => {
  const ttlMs = config.proposalTtlHours * 60 * 60 * 1000;
  const expiresAtIso = new Date(Date.parse(nowIso) + ttlMs).toISOString();
  const required = requiredApprovers(counterChange, proposer, family, config);
  const approvals: Record<MemberId, ApprovalState> = {};
  for (const id of required) approvals[id] = 'pending';
  return {
    id: `${original.id}-counter-${nowIso}`,
    threadId: original.threadId,
    proposedByMemberId: proposer.id,
    entityKind: original.entityKind,
    entityId: original.entityId,
    change: counterChange,
    requiredApprovers: required,
    approvals,
    status: 'open',
    createdAtIso: nowIso,
    expiresAtIso
  };
};
