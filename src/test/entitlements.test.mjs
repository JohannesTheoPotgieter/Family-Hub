import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANS,
  entitlementsFor,
  isPlan,
  planAllows,
  quotasFor
} from '../../server/billing/entitlements.mjs';

test('PLANS contains the three documented tiers', () => {
  assert.deepEqual(PLANS, ['free', 'family', 'family_pro']);
});

test('isPlan accepts only known plans', () => {
  assert.equal(isPlan('free'), true);
  assert.equal(isPlan('family_pro'), true);
  assert.equal(isPlan('enterprise'), false);
  assert.equal(isPlan(undefined), false);
});

test('free tier unlocks calendar/tasks/chat/manual money + ICS only', () => {
  assert.equal(planAllows('free', 'calendar_local'), true);
  assert.equal(planAllows('free', 'tasks'), true);
  assert.equal(planAllows('free', 'chat'), true);
  assert.equal(planAllows('free', 'manual_money'), true);
  assert.equal(planAllows('free', 'ics_import'), true);
  assert.equal(planAllows('free', 'calendar_two_way_sync'), false);
  assert.equal(planAllows('free', 'bank_linking'), false);
});

test('family unlocks two-way sync + push reminders, not bank linking', () => {
  assert.equal(planAllows('family', 'calendar_two_way_sync'), true);
  assert.equal(planAllows('family', 'push_reminders'), true);
  assert.equal(planAllows('family', 'bank_linking'), false);
  assert.equal(planAllows('family', 'debt_coach'), false);
});

test('family_pro unlocks bank linking, debt coach, multi-currency', () => {
  assert.equal(planAllows('family_pro', 'bank_linking'), true);
  assert.equal(planAllows('family_pro', 'debt_coach'), true);
  assert.equal(planAllows('family_pro', 'multi_currency'), true);
  assert.equal(planAllows('family_pro', 'loadshedding_overlay'), true);
});

test('quotasFor scales the member cap and storage', () => {
  assert.equal(quotasFor('free').maxMembers, 4);
  assert.equal(quotasFor('family').maxMembers, 6);
  assert.equal(quotasFor('family_pro').maxMembers, 8);
  assert.equal(quotasFor('family_pro').photoStorageMb, 50_000);
});

test('entitlementsFor returns a complete snapshot for the client', () => {
  const snap = entitlementsFor('family');
  assert.equal(snap.plan, 'family');
  assert.equal(snap.features.calendar_two_way_sync, true);
  assert.equal(snap.features.bank_linking, false);
  assert.equal(snap.quotas.maxMembers, 6);
});

test('entitlementsFor falls back to free for unknown plans', () => {
  const snap = entitlementsFor('mystery');
  assert.equal(snap.plan, 'free');
});
