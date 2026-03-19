import test from 'node:test';
import assert from 'node:assert/strict';
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
