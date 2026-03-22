import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteBillAndLinkedTransaction, findBudgetForMonthCategory, markBillPaidWithOptionalTransaction, saveBudget } from '../lib/family-hub/money.ts';
import { createInitialState, loadState } from '../lib/family-hub/storage.ts';

test('saveBudget prevents duplicate monthly budgets for the same category', () => {
  const initial = {
    bills: [],
    transactions: [],
    budgets: [{ id: 'b1', monthIsoYYYYMM: '2026-05', category: 'Groceries', limitCents: 10_000 }],
    settings: { currency: 'ZAR' }
  };
  const result = saveBudget(initial, { monthIsoYYYYMM: '2026-05', category: 'Groceries', limitCents: 12_500 });
  assert.equal(result.action, 'updated');
  assert.equal(result.state.budgets.length, 1);
  assert.equal(result.state.budgets[0].limitCents, 12_500);
  assert.ok(findBudgetForMonthCategory(result.state, '2026-05', 'Groceries'));
});

test('deleting a paid bill also removes its linked bill transaction', () => {
  const state = markBillPaidWithOptionalTransaction({
    bills: [{ id: 'bill-1', title: 'Power', amountCents: 8_000, dueDateIso: '2026-05-05', category: 'Utilities', paid: false, autoCreateTransaction: true }],
    transactions: [],
    budgets: [],
    settings: { currency: 'ZAR' }
  }, 'bill-1', 'proof.png', '2026-05-05');
  const next = deleteBillAndLinkedTransaction(state, 'bill-1');
  assert.equal(next.bills.length, 0);
  assert.equal(next.transactions.length, 0);
});

test('storage migration keeps legacy task owner defaults and bill notes compatibility', () => {
  globalThis.localStorage = {
    store: new Map([[ 'family-hub-state', JSON.stringify({ tasks: { items: [{ id: 't1', title: 'Do thing', completed: false }] }, money: { payments: [{ id: 'p1', title: 'Rent', amount: 1000, dueDate: '2026-05-01', notes: 'legacy note' }] } }) ]]),
    getItem(key) { return this.store.get(key) ?? null; },
    setItem(key, value) { this.store.set(key, value); },
    removeItem(key) { this.store.delete(key); }
  };
  const loaded = loadState();
  assert.equal(loaded.tasks.items[0].ownerId, 'johannes');
  assert.equal(loaded.money.bills[0].notes, 'legacy note');
});

test('initial state remains backward-compatible for localStorage loading', () => {
  globalThis.localStorage = {
    store: new Map(),
    getItem(key) { return this.store.get(key) ?? null; },
    setItem(key, value) { this.store.set(key, value); },
    removeItem(key) { this.store.delete(key); }
  };
  assert.equal(loadState().users.length, createInitialState().users.length);
});
