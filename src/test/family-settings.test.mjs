import test from 'node:test';
import assert from 'node:assert/strict';
import { completeUserSetup } from '../lib/family-hub/appState.ts';
import { USERS } from '../lib/family-hub/constants.ts';
import { getTabsForUser, hasPermission } from '../lib/family-hub/permissions.ts';
import { createInitialState, loadState, saveState } from '../lib/family-hub/storage.ts';

const createMemoryStorage = () => ({
  store: new Map(),
  getItem(key) { return this.store.get(key) ?? null; },
  setItem(key, value) { this.store.set(key, value); },
  removeItem(key) { this.store.delete(key); }
});

test('kid profiles can hide or reveal the Money tab based on family settings', () => {
  const child = USERS.find((user) => user.role === 'child');
  assert.ok(child);
  assert.deepEqual(getTabsForUser(child, { hideMoneyForKids: true }), ['Home', 'Calendar', 'Tasks', 'More']);
  assert.deepEqual(getTabsForUser(child, { hideMoneyForKids: false }), ['Home', 'Calendar', 'Tasks', 'Money', 'More']);
});

test('reset permissions can be locked to the parent profile', () => {
  const parent = USERS.find((user) => user.role === 'parent');
  const adult = USERS.find((user) => user.role === 'adult');
  assert.equal(hasPermission(parent, 'data_reset', { requireParentForReset: true }), true);
  assert.equal(hasPermission(adult, 'data_reset', { requireParentForReset: true }), false);
  assert.equal(hasPermission(adult, 'data_reset', { requireParentForReset: false }), true);
});

test('family settings persist through save/load', () => {
  globalThis.localStorage = createMemoryStorage();
  const state = createInitialState();
  state.settings.familyMode = 'gentle';
  state.settings.hideMoneyForKids = false;
  state.settings.requireParentForReset = false;
  saveState(state);
  const loaded = loadState();
  assert.equal(loaded.settings.familyMode, 'gentle');
  assert.equal(loaded.settings.hideMoneyForKids, false);
  assert.equal(loaded.settings.requireParentForReset, false);
});

test('completing setup only seeds money artifacts for the user being completed', () => {
  const initial = createInitialState();
  const johannesProfile = {
    openingBalance: 100,
    monthlyIncome: 200,
    recurringPayments: [{ id: 'rent', title: 'Rent', amount: 50 }],
    budgetCategories: [{ id: 'groceries', label: 'Groceries', amount: 80 }]
  };
  const afterJohannes = completeUserSetup(initial, 'johannes', 'encoded-johannes', johannesProfile);
  const nicoleProfile = {
    openingBalance: 300,
    monthlyIncome: 400,
    recurringPayments: [{ id: 'school', title: 'School', amount: 25 }],
    budgetCategories: [{ id: 'fun', label: 'Fun', amount: 40 }]
  };
  const afterNicole = completeUserSetup(afterJohannes, 'nicole', 'encoded-nicole', nicoleProfile);

  assert.equal(afterNicole.money.transactions.filter((tx) => tx.id.startsWith('setup-opening-johannes')).length, 1);
  assert.equal(afterNicole.money.transactions.filter((tx) => tx.id.startsWith('setup-income-johannes-')).length, 1);
  assert.equal(afterNicole.money.bills.filter((bill) => bill.id.startsWith('setup-bill-johannes-')).length, 1);
  assert.equal(afterNicole.money.budgets.filter((budget) => budget.id.startsWith('setup-budget-johannes-')).length, 1);

  assert.equal(afterNicole.money.transactions.filter((tx) => tx.id.startsWith('setup-opening-nicole')).length, 1);
  assert.equal(afterNicole.money.transactions.filter((tx) => tx.id.startsWith('setup-income-nicole-')).length, 1);
  assert.equal(afterNicole.money.bills.filter((bill) => bill.id.startsWith('setup-bill-nicole-')).length, 1);
  assert.equal(afterNicole.money.budgets.filter((budget) => budget.id.startsWith('setup-budget-nicole-')).length, 1);
});
