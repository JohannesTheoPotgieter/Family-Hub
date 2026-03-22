import { useEffect, useMemo, useState } from 'react';
import { resetCalendarConnections } from '../../integrations/calendar';
import { addBill, addInternalCalendarEvent, addTask, addTransaction, applyCalendarSync as applyCalendarSyncState, applyCareAction, buildRestartSetupState, clearCalendarProviderData as clearCalendarProviderDataState, completeUserSetup, createResetState, deleteBill, deleteTransaction, duplicateBill, ensureChallenges, getInitialTab, importTransactions, markBillPaid, saveMoneyBudget, toggleTask, updateBill, updateTask, updateTransaction } from './appState';
import { appendAuditEntry, createResetStateForMode, exportBackup, importBackup, type AdminResetMode } from './adminActions';
import { TABS, type Tab, type UserId } from './constants';
import { encodePin, verifyPin } from './pin';
import { localPersistenceAdapter } from './persistence';
import { getTabsForUser, hasPermission, resolvePermissionBundle } from './permissions';
import type { FamilyHubState } from './storage';

const tabIcons: Record<Tab, string> = { Home: '🏡', Calendar: '📅', Tasks: '✅', Money: '💰', More: '⋯' };

export const useFamilyHubController = () => {
  const [state, setState] = useState<FamilyHubState>(() => ensureChallenges(localPersistenceAdapter.load()));
  const [activeTab, setActiveTab] = useState<Tab>(getInitialTab);

  useEffect(() => localPersistenceAdapter.save(state), [state]);

  const activeUser = useMemo(() => state.users.find((user) => user.id === state.activeUserId) ?? null, [state.users, state.activeUserId]);
  const permissionBundle = useMemo(() => resolvePermissionBundle(activeUser, state.settings), [activeUser, state.settings]);
  const visibleTabs = useMemo(() => getTabsForUser(activeUser, state.settings), [activeUser, state.settings]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) setActiveTab(visibleTabs[0] ?? 'Home');
  }, [activeTab, visibleTabs]);

  const patchState = (updater: (current: FamilyHubState) => FamilyHubState) => setState((current) => ensureChallenges(updater(current)));

  return {
    state,
    setState: patchState,
    activeTab,
    setActiveTab,
    activeUser,
    visibleTabs,
    tabIcons,
    tabs: TABS,
    permissionBundle,
    onCareAction: (userId: UserId, action: Parameters<typeof applyCareAction>[2]) => patchState((current) => applyCareAction(current, userId, action)),
    restartSetup: (userId: UserId) => {
      setActiveTab('Home');
      patchState((current) => buildRestartSetupState(current, userId, true));
    },
    lockApp: () => {
      setActiveTab('Home');
      patchState((current) => ({ ...current, activeUserId: null, setupUserId: null }));
    },
    resetAppData: async (mode: AdminResetMode = 'hard') => {
      setActiveTab('Home');
      const next = await createResetStateForMode(state, mode);
      setState(ensureChallenges(next));
    },
    applyCalendarSync: (provider: Parameters<typeof applyCalendarSyncState>[1], calendars: Parameters<typeof applyCalendarSyncState>[2], events: Parameters<typeof applyCalendarSyncState>[3]) => patchState((current) => applyCalendarSyncState(current, provider, calendars, events)),
    clearCalendarProviderData: (provider: Parameters<typeof clearCalendarProviderDataState>[1]) => patchState((current) => clearCalendarProviderDataState(current, provider)),
    completeSetup: async (userId: UserId, pin: string, profile: FamilyHubState['userSetupProfiles'][UserId]) => {
      if (!profile) return;
      const encodedPin = await encodePin(userId, pin);
      patchState((current) => {
        return appendAuditEntry(
          completeUserSetup(current, userId, encodedPin, profile),
          'setup.completed',
          `${userId} completed setup.`
        );
      });
    },
    unlockUser: async (id: UserId, pin: string) => {
      const unlocked = await verifyPin(id, pin, state.userPins[id]);
      if (unlocked) patchState((current) => ({ ...current, activeUserId: id }));
      return unlocked;
    },
    startSetup: (id: UserId) => patchState((current) => ({ ...current, setupUserId: id })),
    changePin: async (currentPin: string, nextPin: string) => {
      const activeUserId = state.activeUserId;
      if (!activeUserId) return false;
      const matches = await verifyPin(activeUserId, currentPin, state.userPins[activeUserId]);
      if (!matches) return false;
      const encodedPin = await encodePin(activeUserId, nextPin);
      patchState((current) => ({ ...current, userPins: { ...current.userPins, [activeUserId]: encodedPin } }));
      return true;
    },
    addPlace: (place: Omit<FamilyHubState['places'][number], 'id'>) => patchState((current) => ({ ...current, places: [{ id: `place-${Date.now()}`, ...place }, ...current.places] })),
    updatePlace: (id: string, patch: Partial<Omit<FamilyHubState['places'][number], 'id'>>) => patchState((current) => ({ ...current, places: current.places.map((place) => (place.id === id ? { ...place, ...patch } : place)) })),
    exportData: () => exportBackup(state),
    importData: (raw: string) => setState(ensureChallenges(importBackup(raw))),
    updateSettings: (update: Partial<FamilyHubState['settings']>) => patchState((current) => ({ ...current, settings: { ...current.settings, ...update } })),
    addEvent: (event: Omit<FamilyHubState['calendar']['events'][number], 'id'>) => patchState((current) => addInternalCalendarEvent(current, event)),
    addTask: (task: Parameters<typeof addTask>[1]) => patchState((current) => addTask(current, task)),
    updateTask: (id: string, update: Parameters<typeof updateTask>[2]) => patchState((current) => updateTask(current, id, update)),
    toggleTask: (id: string) => patchState((current) => toggleTask(current, id)),
    addBill: (bill: Parameters<typeof addBill>[1]) => patchState((current) => addBill(current, bill)),
    updateBill: (id: string, update: Parameters<typeof updateBill>[2]) => patchState((current) => updateBill(current, id, update)),
    duplicateBill: (id: string) => patchState((current) => duplicateBill(current, id)),
    markBillPaid: (id: string, proofFileName: string) => patchState((current) => markBillPaid(current, id, proofFileName)),
    addTransaction: (transaction: Parameters<typeof addTransaction>[1]) => patchState((current) => addTransaction(current, transaction)),
    importTransactions: (transactions: Parameters<typeof importTransactions>[1]) => patchState((current) => importTransactions(current, transactions)),
    updateTransaction: (id: string, transaction: Parameters<typeof updateTransaction>[2]) => patchState((current) => updateTransaction(current, id, transaction)),
    saveBudget: (budget: Parameters<typeof saveMoneyBudget>[1]) => patchState((current) => saveMoneyBudget(current, budget).state),
    deleteBill: (id: string) => patchState((current) => deleteBill(current, id)),
    deleteTransaction: (id: string) => patchState((current) => deleteTransaction(current, id)),
    deleteBudget: (id: string) => patchState((current) => ({ ...current, money: { ...current.money, budgets: current.money.budgets.filter((budget) => budget.id !== id) } })),
    can: (permission: Parameters<typeof hasPermission>[1]) => hasPermission(activeUser, permission, state.settings),
    clearAllCalendarConnections: async () => { await resetCalendarConnections(); }
  };
};
