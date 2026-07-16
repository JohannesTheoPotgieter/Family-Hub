// Regression tests for state-integrity bugs: task edits wiping completion
// history, deleted setup-seeded rows resurrecting on reload, and one corrupt
// bill resetting the whole persisted household state.

import test from 'node:test';
import assert from 'node:assert/strict';
import { updateTask } from '../lib/family-hub/appState.ts';
import { deleteTransactionAndUnlinkBills, deleteBillAndLinkedTransaction } from '../lib/family-hub/money.ts';
import { createInitialState, seedMoneyFromSetupProfiles } from '../lib/family-hub/storage.ts';
import { sanitizeMoneyState } from '../domain/sanitize.ts';

const buildProfile = (overrides = {}) => ({
  openingBalance: 5000,
  monthlyIncome: 30000,
  recurringPayments: [{ id: 'rent', title: 'Rent', amount: 9500 }],
  budgetCategories: [{ id: 'groceries', label: 'Groceries', amount: 4000 }],
  ...overrides
});

test('editing a task does not reset its completion history', () => {
  const state = createInitialState();
  state.tasks.items = [{
    id: 'task-1',
    title: 'Feed the dog',
    completed: false,
    dueDate: null,
    shared: false,
    notes: '',
    ownerId: 'johannes',
    recurrence: 'daily',
    completionCount: 5,
    completionHistory: [{ completedAtIso: '2026-07-01T08:00:00Z', userId: 'johannes' }]
  }];
  // The exact payload TasksScreen submits on edit: editable fields only.
  const next = updateTask(state, 'task-1', {
    title: 'Feed the dog twice',
    dueDate: null,
    shared: false,
    notes: 'morning and evening',
    ownerId: 'johannes',
    recurrence: 'daily'
  });
  const task = next.tasks.items[0];
  assert.equal(task.title, 'Feed the dog twice');
  assert.equal(task.completionCount, 5);
  assert.equal(task.completionHistory.length, 1);
});

test('deleted setup-seeded rows do not resurrect on re-seed', () => {
  const profiles = { johannes: buildProfile() };
  const seeded = seedMoneyFromSetupProfiles(createInitialState().money, profiles);
  const openingTx = seeded.transactions.find((tx) => tx.id === 'setup-opening-johannes');
  assert.ok(openingTx, 'expected the opening balance to be seeded');

  const afterDelete = deleteTransactionAndUnlinkBills(seeded, 'setup-opening-johannes');
  assert.ok(!afterDelete.transactions.some((tx) => tx.id === 'setup-opening-johannes'));

  // Simulates the next loadState(): seeding runs again over saved state.
  const reseeded = seedMoneyFromSetupProfiles(afterDelete, profiles);
  assert.ok(
    !reseeded.transactions.some((tx) => tx.id === 'setup-opening-johannes'),
    'deleted seeded transaction must stay deleted after reload'
  );

  const seededBill = seeded.bills.find((bill) => bill.id.startsWith('setup-bill-johannes-rent-'));
  assert.ok(seededBill, 'expected the recurring payment to be seeded as a bill');
  const afterBillDelete = deleteBillAndLinkedTransaction(reseeded, seededBill.id);
  const reseededAgain = seedMoneyFromSetupProfiles(afterBillDelete, profiles);
  assert.ok(
    !reseededAgain.bills.some((bill) => bill.id === seededBill.id),
    'deleted seeded bill must stay deleted after reload'
  );
});

test('dismissedSeedIds survive the sanitize round-trip', () => {
  const sanitized = sanitizeMoneyState({
    bills: [],
    transactions: [],
    budgets: [],
    dismissedSeedIds: ['setup-opening-johannes', 42, null]
  });
  assert.deepEqual(sanitized.dismissedSeedIds, ['setup-opening-johannes']);
});

test('one corrupt bill does not blow up money sanitization', () => {
  const sanitized = sanitizeMoneyState({
    bills: [
      { id: 'ok-bill', title: 'Power', amountCents: 5000, dueDateIso: '2026-07-20', category: 'Utilities', paid: false },
      { id: 'broken-bill', title: 'No due date', amountCents: 100, category: 'Other', paid: false },
      'garbage',
      null
    ],
    transactions: [],
    budgets: []
  });
  assert.equal(sanitized.bills.length, 2);
  const broken = sanitized.bills.find((bill) => bill.id === 'broken-bill');
  assert.match(broken.dueDateIso, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof broken.recurrenceDay, 'number');
});
