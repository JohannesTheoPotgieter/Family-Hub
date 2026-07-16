// Regression tests for local-vs-UTC date handling and amount parsing.
//
// The app stores date-only strings as LOCAL calendar days, but several
// helpers used to serialize them through `toISOString().slice(0, 10)`,
// which shifts a day back for any user east of UTC. Pin the process to
// the app's home timezone (UTC+2) so those regressions fail loudly.
// Node's --test runner gives each file its own process, so this does not
// leak into other test files.
process.env.TZ = 'Africa/Johannesburg';

import test from 'node:test';
import assert from 'node:assert/strict';
import { getTodayIso, parseLocalDateIso, toLocalDateIso } from '../lib/family-hub/date.ts';
import { getDueSoonBills, parseAmountInput } from '../lib/family-hub/money.ts';
import { markBillPaid } from '../lib/family-hub/appState.ts';
import { createInitialState } from '../lib/family-hub/storage.ts';

test('toLocalDateIso keeps the local calendar day east of UTC', () => {
  // Local midnight July 1 is June 30 22:00 UTC; the old ISO round-trip
  // returned "2026-06-30".
  assert.equal(toLocalDateIso(new Date(2026, 6, 1)), '2026-07-01');
  assert.equal(toLocalDateIso(new Date(2026, 0, 31, 23, 59)), '2026-01-31');
});

test('parseLocalDateIso and toLocalDateIso round-trip', () => {
  for (const iso of ['2026-01-01', '2026-07-16', '2026-12-31', '2024-02-29']) {
    assert.equal(toLocalDateIso(parseLocalDateIso(iso)), iso);
  }
  assert.equal(getTodayIso(), toLocalDateIso(new Date()));
});

test('paying a monthly bill due on the 1st advances into the next month', () => {
  const state = createInitialState();
  state.money.bills = [{
    id: 'bill-rent',
    title: 'Rent',
    amountCents: 950_000,
    dueDateIso: '2026-07-01',
    category: 'Utilities',
    paid: false,
    autoCreateTransaction: false,
    recurrence: 'monthly',
    recurrenceDay: 1
  }];
  const next = markBillPaid(state, 'bill-rent', 'proof.png');
  const generated = next.money.bills.find((bill) => bill.generatedFromBillId === 'bill-rent');
  assert.ok(generated, 'expected a next-cycle bill to be generated');
  // Old code produced 2026-07-31 — the SAME month — so recurrence never
  // reached August and duplicate July bills piled up.
  assert.equal(generated.dueDateIso, '2026-08-01');
  assert.equal(generated.paid, false);
});

test('monthly recurrence clamps to the shorter month end', () => {
  const state = createInitialState();
  state.money.bills = [{
    id: 'bill-31',
    title: 'Gym',
    amountCents: 45_000,
    dueDateIso: '2026-01-31',
    category: 'Health',
    paid: false,
    autoCreateTransaction: false,
    recurrence: 'monthly',
    recurrenceDay: 31
  }];
  const next = markBillPaid(state, 'bill-31', 'proof.png');
  const generated = next.money.bills.find((bill) => bill.generatedFromBillId === 'bill-31');
  assert.equal(generated.dueDateIso, '2026-02-28');
});

test('getDueSoonBills window covers exactly the next 7 local days', () => {
  const bills = [
    { id: 'b1', title: 'In window', amountCents: 100, dueDateIso: '2026-07-23', category: 'Other', paid: false },
    { id: 'b2', title: 'Out of window', amountCents: 100, dueDateIso: '2026-07-24', category: 'Other', paid: false }
  ];
  const due = getDueSoonBills(bills, '2026-07-16', 7);
  assert.deepEqual(due.map((bill) => bill.id), ['b1']);
});

test('parseAmountInput reads South African amount conventions', () => {
  assert.equal(parseAmountInput('1,500'), 1500); // thousands comma, not R1.50
  assert.equal(parseAmountInput('1 500'), 1500);
  assert.equal(parseAmountInput('12,50'), 12.5); // decimal comma
  assert.equal(parseAmountInput('R 1 250,75'), 1250.75);
  assert.equal(parseAmountInput('1,500.75'), 1500.75);
  assert.equal(parseAmountInput('1500'), 1500);
  assert.equal(parseAmountInput('0,5'), 0.5);
  assert.equal(parseAmountInput('abc'), null);
  assert.equal(parseAmountInput(''), null);
});
