import test from 'node:test';
import assert from 'node:assert/strict';

const getMonthIncomeTotal = (transactions, month) => transactions.filter((tx) => tx.dateIso.startsWith(month) && tx.kind === 'inflow').reduce((sum, tx) => sum + tx.amountCents, 0);
const getMonthSpendingTotal = (transactions, month) => transactions.filter((tx) => tx.dateIso.startsWith(month) && tx.kind === 'outflow').reduce((sum, tx) => sum + tx.amountCents, 0);
const getDueSoonBills = (bills, todayIso, days = 7) => {
  const end = new Date(todayIso);
  end.setDate(end.getDate() + days);
  const endIso = end.toISOString().slice(0, 10);
  return bills.filter((bill) => !bill.paid && bill.dueDateIso >= todayIso && bill.dueDateIso <= endIso);
};
const getOverdueBills = (bills, todayIso) => bills.filter((bill) => !bill.paid && bill.dueDateIso < todayIso);
const markBillPaidWithOptionalTransaction = (state, billId) => {
  const bill = state.bills.find((item) => item.id === billId);
  if (!bill) return state;
  if (!bill.autoCreateTransaction || bill.linkedTransactionId) return { ...state, bills: state.bills.map((b) => (b.id === billId ? { ...b, paid: true } : b)) };
  const tx = { id: 'tx-new', title: bill.title, amountCents: bill.amountCents, kind: 'outflow', category: bill.category, source: 'bill', sourceBillId: bill.id };
  return {
    ...state,
    bills: state.bills.map((b) => (b.id === billId ? { ...b, paid: true, linkedTransactionId: tx.id } : b)),
    transactions: [tx, ...state.transactions]
  };
};
const budgetRemaining = (budgets, transactions, month) => {
  const monthBudgets = budgets.filter((b) => b.monthIsoYYYYMM === month);
  const spent = monthBudgets.reduce((sum, b) => sum + transactions.filter((tx) => tx.dateIso.startsWith(month) && tx.kind === 'outflow' && tx.category === b.category).reduce((s, tx) => s + tx.amountCents, 0), 0);
  const limit = monthBudgets.reduce((sum, b) => sum + b.limitCents, 0);
  return limit - spent;
};
const migrateMoney = (money) => ({
  bills: (money.payments ?? []).map((p) => ({ id: p.id, amountCents: Math.round(p.amount * 100), dueDateIso: p.dueDate, paid: p.paid })),
  transactions: (money.actualTransactions ?? []).map((tx) => ({ id: tx.id, amountCents: Math.round(tx.amount * 100), dateIso: tx.date, kind: tx.kind })),
  budgets: [],
  settings: { currency: 'ZAR' }
});

test('month totals are calculated from cents', () => {
  const transactions = [
    { amountCents: 100_00, kind: 'inflow', dateIso: '2026-05-01' },
    { amountCents: 25_00, kind: 'outflow', dateIso: '2026-05-03' },
    { amountCents: 5_00, kind: 'outflow', dateIso: '2026-04-30' }
  ];
  assert.equal(getMonthIncomeTotal(transactions, '2026-05'), 100_00);
  assert.equal(getMonthSpendingTotal(transactions, '2026-05'), 25_00);
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
  assert.equal(next.bills[0].linkedTransactionId, 'tx-new');
});

test('budget remaining calculation', () => {
  const remaining = budgetRemaining(
    [{ monthIsoYYYYMM: '2026-05', category: 'Groceries', limitCents: 200_00 }],
    [{ dateIso: '2026-05-10', kind: 'outflow', category: 'Groceries', amountCents: 50_00 }],
    '2026-05'
  );
  assert.equal(remaining, 150_00);
});

test('migrates legacy amount fields to cents', () => {
  const migrated = migrateMoney({ payments: [{ id: 'p1', amount: 10.5, dueDate: '2026-05-01', paid: false }], actualTransactions: [{ id: 't1', amount: 4.25, date: '2026-05-01', kind: 'outflow' }] });
  assert.equal(migrated.bills[0].amountCents, 1050);
  assert.equal(migrated.transactions[0].amountCents, 425);
});
