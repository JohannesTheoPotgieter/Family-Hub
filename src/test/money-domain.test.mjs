import test from 'node:test';
import assert from 'node:assert/strict';
import { getBudgetStatus, getDueSoonBills, getMonthIncomeTotal, getMonthSpendingTotal, getOverdueBills, markBillPaidWithOptionalTransaction } from '../lib/family-hub/money.ts';
import { createInitialState, loadState, saveState } from '../lib/family-hub/storage.ts';

test('month totals are calculated from cents', () => {
  const state = {
    transactions: [
    { amountCents: 100_00, kind: 'inflow', dateIso: '2026-05-01' },
    { amountCents: 25_00, kind: 'outflow', dateIso: '2026-05-03' },
    { amountCents: 5_00, kind: 'outflow', dateIso: '2026-04-30' }
    ],
    bills: [],
    budgets: [],
    settings: { currency: 'ZAR' }
  };
  assert.equal(getMonthIncomeTotal(state, '2026-05'), 100_00);
  assert.equal(getMonthSpendingTotal(state, '2026-05'), 25_00);
});

test('due soon and overdue classification', () => {
  const bills = [
    { id: 'a', dueDateIso: '2026-05-01', paid: false },
    { id: 'b', dueDateIso: '2026-05-08', paid: false },
    { id: 'c', dueDateIso: '2026-05-20', paid: false },
    { id: 'd', dueDateIso: '2026-05-02', paid: true }
  ];
  assert.deepEqual(getOverdueBills(bills, '2026-05-05').map((b) => b.id), ['a']);
  assert.deepEqual(getDueSoonBills(bills, '2026-05-05').map((b) => b.id), ['b']);
});

test('marking paid creates linked transaction when enabled', () => {
  const state = { bills: [{ id: 'b1', title: 'Water', amountCents: 40_00, category: 'Utilities', autoCreateTransaction: true, paid: false }], transactions: [] };
  const next = markBillPaidWithOptionalTransaction(state, 'b1');
  assert.equal(next.transactions.length, 1);
  assert.match(next.bills[0].linkedTransactionId, /^tx-/);
});

test('budget remaining calculation', () => {
  const status = getBudgetStatus(
    {
      bills: [],
      transactions: [{ dateIso: '2026-05-10', kind: 'outflow', category: 'Groceries', amountCents: 50_00 }],
      budgets: [{ id: 'budget-1', monthIsoYYYYMM: '2026-05', category: 'Groceries', limitCents: 200_00 }],
      settings: { currency: 'ZAR' }
    },
    '2026-05'
  );
  assert.equal(status.remainingCents, 150_00);
});

test('storage save/load preserves migrated money data', () => {
  globalThis.localStorage = {
    store: new Map(),
    getItem(key) { return this.store.get(key) ?? null; },
    setItem(key, value) { this.store.set(key, value); },
    removeItem(key) { this.store.delete(key); }
  };
  const state = createInitialState();
  state.money.transactions.push({ id: 't1', title: 'Salary', amountCents: 425, dateIso: '2026-05-01', kind: 'inflow', category: 'Income', source: 'manual' });
  saveState(state);
  const loaded = loadState();
  assert.equal(loaded.money.transactions[0].amountCents, 425);
});
