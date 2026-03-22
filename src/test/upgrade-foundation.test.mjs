import test from 'node:test';
import assert from 'node:assert/strict';
import { markBillPaid } from '../lib/family-hub/appState.ts';
import { resolvePermissionBundle } from '../lib/family-hub/permissions.ts';
import { createInitialState } from '../lib/family-hub/storage.ts';
import { USERS } from '../lib/family-hub/constants.ts';

test('paying a recurring monthly bill safely generates only one next cycle bill', () => {
  const state = createInitialState();
  state.activeUserId = 'johannes';
  state.money.bills = [{
    id: 'bill-rent',
    title: 'Rent',
    amountCents: 120000,
    dueDateIso: '2026-05-28',
    category: 'Housing',
    paid: false,
    autoCreateTransaction: true,
    recurrence: 'monthly',
    recurrenceDay: 28
  }];

  const once = markBillPaid(state, 'bill-rent', 'proof.pdf');
  const twice = markBillPaid(once, 'bill-rent', 'proof.pdf');
  const juneBills = twice.money.bills.filter((bill) => bill.dueDateIso === '2026-06-28');

  assert.equal(juneBills.length, 1);
  assert.equal(juneBills[0].generatedFromBillId, 'bill-rent');
});

test('child-limited permissions hide money details while adults keep editing access', () => {
  const child = USERS.find((user) => user.role === 'child');
  const adult = USERS.find((user) => user.role === 'adult');
  assert.ok(child && adult);

  const childBundle = resolvePermissionBundle(child, { hideMoneyForKids: true, requireParentForReset: true });
  const adultBundle = resolvePermissionBundle(adult, { hideMoneyForKids: true, requireParentForReset: false });

  assert.equal(childBundle.moneyVisibility, 'hidden');
  assert.equal(childBundle.canEditMoney, false);
  assert.equal(adultBundle.canEditMoney, true);
  assert.equal(adultBundle.canReset, true);
});
