import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROPOSAL_CONFIG,
  applyProposal,
  counterProposal,
  isApprovalComplete,
  isApprovalDeclined,
  isMoneyProposal,
  requiredApprovers,
  requiredPermissionToApprove,
  requiredPermissionToCreate,
  validateProposal
} from '../domain/proposals.ts';

const mom = { id: 'mom', roleKey: 'parent_admin', displayName: 'Mom' };
const dad = { id: 'dad', roleKey: 'adult_editor', displayName: 'Dad' };
const liam = { id: 'liam', roleKey: 'child_limited', displayName: 'Liam' };
const mia = { id: 'mia', roleKey: 'child_limited', displayName: 'Mia' };
const family = [mom, dad, liam, mia];

const buildProposal = (change, proposer, approvers, approvalsOverride) => ({
  id: 'proposal-1',
  threadId: 'thread-1',
  proposedByMemberId: proposer.id,
  entityKind: change.kind.startsWith('event_')
    ? 'event'
    : change.kind.startsWith('task_')
      ? 'task'
      : 'budget',
  entityId: 'entity-1',
  change,
  requiredApprovers: approvers,
  approvals:
    approvalsOverride ?? Object.fromEntries(approvers.map((id) => [id, 'pending'])),
  status: 'open',
  createdAtIso: '2026-04-27T10:00:00Z',
  expiresAtIso: '2026-05-04T10:00:00Z'
});

// --- requiredApprovers ---------------------------------------------------

test('event move proposal requires one adult who is not the proposer', () => {
  const change = {
    kind: 'event_move',
    newStartIso: '2026-05-02T10:00:00Z',
    newEndIso: '2026-05-02T11:00:00Z'
  };
  const approvers = requiredApprovers(change, mom, family);
  assert.equal(approvers.length, 1);
  assert.equal(approvers[0], 'dad');
});

test('task swap pulls the new owner in as approver alongside an adult', () => {
  const change = {
    kind: 'task_assignee_swap',
    swaps: [{ taskId: 't1', newOwnerMemberId: 'mia' }]
  };
  const approvers = requiredApprovers(change, liam, family);
  assert.ok(approvers.includes('mia'));
  // First adult (mom) is added by default for non-money changes.
  assert.ok(approvers.includes('mom') || approvers.includes('dad'));
});

test('two-key money: shifts above threshold require both adults', () => {
  const change = {
    kind: 'budget_category_shift',
    monthIso: '2026-05',
    fromCategory: 'Entertainment',
    toCategory: 'School fees',
    amountCents: 50000, // R500
    currency: 'ZAR'
  };
  const approvers = requiredApprovers(change, mom, family);
  assert.equal(approvers.length, 1);
  assert.equal(approvers[0], 'dad');
});

test('two-key money: low-amount shifts only require any one adult', () => {
  const change = {
    kind: 'budget_category_shift',
    monthIso: '2026-05',
    fromCategory: 'Entertainment',
    toCategory: 'School fees',
    amountCents: 10000, // R100, below R250 threshold
    currency: 'ZAR'
  };
  const approvers = requiredApprovers(change, mom, family);
  assert.equal(approvers.length, 1);
});

test('event_attendee_change adds invited members as approvers', () => {
  const change = {
    kind: 'event_attendee_change',
    add: ['liam'],
    remove: []
  };
  const approvers = requiredApprovers(change, mom, family);
  assert.ok(approvers.includes('liam'));
});

// --- validateProposal ----------------------------------------------------

test('kid cannot propose money changes by default', () => {
  const change = {
    kind: 'goal_contribution',
    amountCents: 5000,
    currency: 'ZAR'
  };
  const errors = validateProposal(change, liam);
  assert.ok(errors.some((e) => e.code === 'kids_money_disabled'));
});

test('kid CAN propose money changes when family explicitly allows it', () => {
  const change = {
    kind: 'goal_contribution',
    amountCents: 5000,
    currency: 'ZAR'
  };
  const errors = validateProposal(change, liam, {
    ...DEFAULT_PROPOSAL_CONFIG,
    allowKidsToProposeMoney: true
  });
  assert.deepEqual(errors, []);
});

test('budget shift validation rejects same-category and zero amounts', () => {
  const errors = validateProposal(
    {
      kind: 'budget_category_shift',
      monthIso: '2026-05',
      fromCategory: 'Food',
      toCategory: 'Food',
      amountCents: 0,
      currency: 'ZAR'
    },
    mom
  );
  const codes = errors.map((e) => e.code);
  assert.ok(codes.includes('non_positive_amount'));
  assert.ok(codes.includes('same_category'));
});

test('event_move with end before start fails validation', () => {
  const errors = validateProposal(
    {
      kind: 'event_move',
      newStartIso: '2026-05-02T11:00:00Z',
      newEndIso: '2026-05-02T10:00:00Z'
    },
    mom
  );
  assert.ok(errors.some((e) => e.code === 'end_before_start'));
});

// --- applyProposal -------------------------------------------------------

test('applyProposal refuses to apply an incomplete proposal', () => {
  const change = {
    kind: 'event_move',
    newStartIso: '2026-05-02T10:00:00Z',
    newEndIso: '2026-05-02T11:00:00Z'
  };
  const proposal = buildProposal(change, mom, ['dad']); // dad still pending
  const result = applyProposal(proposal);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'approval_incomplete');
});

test('applyProposal produces an event_update diff once approved', () => {
  const change = {
    kind: 'event_move',
    newStartIso: '2026-05-02T10:00:00Z',
    newEndIso: '2026-05-02T11:00:00Z'
  };
  const proposal = buildProposal(change, mom, ['dad'], { dad: 'agree' });
  const result = applyProposal(proposal);
  assert.equal(result.ok, true);
  assert.equal(result.diff.kind, 'event_update');
  assert.equal(result.diff.patch.startsAt, '2026-05-02T10:00:00Z');
});

test('applyProposal turns budget_category_shift into a budget_shift diff', () => {
  const change = {
    kind: 'budget_category_shift',
    monthIso: '2026-05',
    fromCategory: 'Entertainment',
    toCategory: 'School fees',
    amountCents: 50000,
    currency: 'ZAR'
  };
  const proposal = buildProposal(change, mom, ['dad'], { dad: 'agree' });
  const result = applyProposal(proposal);
  assert.equal(result.ok, true);
  assert.equal(result.diff.kind, 'budget_shift');
  assert.equal(result.diff.amountCents, 50000);
});

test('applyProposal refuses an expired proposal even if fully approved', () => {
  const change = { kind: 'event_cancel' };
  const proposal = {
    ...buildProposal(change, mom, ['dad'], { dad: 'agree' }),
    expiresAtIso: '2020-01-01T00:00:00Z'
  };
  const result = applyProposal(proposal);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'expired');
});

// --- approval state helpers ---------------------------------------------

test('isApprovalComplete is true only when every required member said agree', () => {
  const change = {
    kind: 'budget_category_shift',
    monthIso: '2026-05',
    fromCategory: 'A',
    toCategory: 'B',
    amountCents: 100000,
    currency: 'ZAR'
  };
  const proposal = buildProposal(change, mom, ['dad'], { dad: 'pending' });
  assert.equal(isApprovalComplete(proposal), false);

  proposal.approvals.dad = 'agree';
  assert.equal(isApprovalComplete(proposal), true);
});

test('isApprovalDeclined catches a single decline', () => {
  const change = { kind: 'event_cancel' };
  const proposal = buildProposal(change, mom, ['dad'], { dad: 'decline' });
  assert.equal(isApprovalDeclined(proposal), true);
});

// --- permission key mapping ---------------------------------------------

test('proposal permission keys map to expected values per change kind', () => {
  assert.equal(
    requiredPermissionToCreate({ kind: 'event_cancel' }),
    'proposal_create_event'
  );
  assert.equal(
    requiredPermissionToCreate({
      kind: 'task_assignee_swap',
      swaps: []
    }),
    'proposal_create_task'
  );
  assert.equal(
    requiredPermissionToApprove({
      kind: 'budget_category_shift',
      monthIso: '2026-05',
      fromCategory: 'A',
      toCategory: 'B',
      amountCents: 100,
      currency: 'ZAR'
    }),
    'proposal_approve_money'
  );
});

test('isMoneyProposal recognises money-bearing changes', () => {
  assert.equal(
    isMoneyProposal({ kind: 'event_cancel' }),
    false
  );
  assert.equal(
    isMoneyProposal({
      kind: 'goal_create',
      title: 'New tablet',
      targetCents: 200000,
      currency: 'ZAR',
      targetDate: null
    }),
    true
  );
});

// --- counter proposals ---------------------------------------------------

test('counterProposal creates a new open proposal with fresh approvals', () => {
  const original = buildProposal(
    { kind: 'event_move', newStartIso: '2026-05-02T10:00:00Z', newEndIso: '2026-05-02T11:00:00Z' },
    mom,
    ['dad'],
    { dad: 'decline' }
  );
  const counter = counterProposal(
    original,
    { kind: 'event_move', newStartIso: '2026-05-03T10:00:00Z', newEndIso: '2026-05-03T11:00:00Z' },
    dad,
    family,
    DEFAULT_PROPOSAL_CONFIG,
    '2026-04-27T12:00:00Z'
  );
  assert.equal(counter.status, 'open');
  assert.equal(counter.proposedByMemberId, 'dad');
  assert.notEqual(counter.id, original.id);
  // Approvals should be re-initialised to pending.
  for (const id of counter.requiredApprovers) {
    assert.equal(counter.approvals[id], 'pending');
  }
});
