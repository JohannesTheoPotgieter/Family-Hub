import { useEffect, useMemo, useState } from 'react';
import { CalendarScreen } from './components/family-hub/CalendarScreen';
import { HomeScreen } from './components/family-hub/HomeScreen';
import { LoginScreen } from './components/family-hub/LoginScreen';
import { MoneyScreen } from './components/family-hub/MoneyScreen';
import { MoreScreen } from './components/family-hub/MoreScreen';
import { SetupWizard } from './components/family-hub/SetupWizard';
import { TasksScreen } from './components/family-hub/TasksScreen';
import { TABS, type Tab, type UserId } from './lib/family-hub/constants';
import { encodePin, verifyPin } from './lib/family-hub/pin';
import { clearState, loadState, saveState, seedMoneyFromSetupProfiles, type FamilyHubState } from './lib/family-hub/storage';
import { getTabsForUser, hasPermission } from './lib/family-hub/permissions';
import { ToastViewport } from './ui/Toast';
import { ToastProvider } from './ui/useToasts';
import { resetCalendarConnections } from './integrations/calendar';
import { addBill, addInternalCalendarEvent, addTask, applyCalendarSync as applyCalendarSyncState, applyCareAction, buildRestartSetupState, clearCalendarProviderData as clearCalendarProviderDataState, createResetState, deleteBill, deleteTransaction, duplicateBill, ensureChallenges, getInitialTab, importTransactions, markBillPaid, rewardActivity, saveMoneyBudget, toggleTask, updateBill, updateTask, updateTransaction, addTransaction } from './lib/family-hub/appState';

const tabIcons: Record<Tab, string> = {
  Home: '🏡',
  Calendar: '📅',
  Tasks: '✅',
  Money: '💰',
  More: '⋯'
};

const AppInner = () => {
  const [state, setState] = useState<FamilyHubState>(() => ensureChallenges(loadState()));
  const [activeTab, setActiveTab] = useState<Tab>(getInitialTab);

  useEffect(() => saveState(state), [state]);

  const activeUser = useMemo(
    () => state.users.find((user) => user.id === state.activeUserId) ?? null,
    [state.users, state.activeUserId]
  );
  const visibleTabs = useMemo(() => getTabsForUser(activeUser, state.settings), [activeUser, state.settings]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? 'Home');
    }
  }, [activeTab, visibleTabs]);

  const onCareAction = (userId: Parameters<typeof applyCareAction>[1], action: Parameters<typeof applyCareAction>[2]) => {
    setState((current) => applyCareAction(current, userId, action));
  };

  const restartSetup = (userId: UserId) => {
    setActiveTab('Home');
    setState((current) => buildRestartSetupState(current, userId, true));
  };

  const lockApp = () => {
    setActiveTab('Home');
    setState((current) => ({ ...current, activeUserId: null, setupUserId: null }));
  };

  const resetAppData = () => {
    clearState();
    void resetCalendarConnections();
    setActiveTab('Home');
    setState(createResetState());
  };

  const applyCalendarSync = (provider: Parameters<typeof applyCalendarSyncState>[1], calendars: Parameters<typeof applyCalendarSyncState>[2], events: Parameters<typeof applyCalendarSyncState>[3]) => {
    setState((current) => applyCalendarSyncState(current, provider, calendars, events));
  };

  const clearCalendarProviderData = (provider: Parameters<typeof clearCalendarProviderDataState>[1]) => {
    setState((current) => clearCalendarProviderDataState(current, provider));
  };

  if (state.setupUserId) {
    const user = state.users.find((item) => item.id === state.setupUserId);
    if (!user) return null;

    return (
      <SetupWizard
        user={user}
        onFinish={async (pin, profile) => {
          const encodedPin = await encodePin(user.id, pin);
          setState((current) => {
            const userSetupProfiles = { ...current.userSetupProfiles, [user.id]: profile };
            return rewardActivity(
              {
                ...current,
                activeUserId: user.id,
                setupUserId: null,
                userPins: { ...current.userPins, [user.id]: encodedPin },
                userSetupProfiles,
                setupCompleted: { ...current.setupCompleted, [user.id]: true },
                money: seedMoneyFromSetupProfiles(current.money, userSetupProfiles)
              },
              { type: 'APP_PROFILE_COMPLETED', userId: user.id, actionId: `profile-${user.id}`, createdAtIso: new Date().toISOString() }
            );
          });
        }}
      />
    );
  }

  if (!state.activeUserId) {
    return (
      <LoginScreen
        users={state.users}
        hasPin={(id) => Boolean(state.userPins[id])}
        isSetupComplete={(id) => state.setupCompleted[id]}
        onUnlock={async (id, pin) => {
          const unlocked = await verifyPin(id, pin, state.userPins[id]);
          if (unlocked) {
            setState((current) => ({ ...current, activeUserId: id }));
          }
          return unlocked;
        }}
        onStartSetup={(id) => setState((current) => ({ ...current, setupUserId: id }))}
        onRestartSetup={restartSetup}
      />
    );
  }

  return (
    <main className="app-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />

      <div className="app-phone-frame">
        <section className="screen-content">
          {activeTab === 'Home' && <HomeScreen state={state} onCareAction={onCareAction} onLock={lockApp} />}
          {activeTab === 'Calendar' && (
            <CalendarScreen
              internalEvents={state.calendar.events}
              externalEvents={state.calendar.externalEvents}
              calendars={state.calendar.calendars}
              lastSyncedAtIsoByProvider={state.calendar.lastSyncedAtIsoByProvider}
              onAddEvent={(event) => setState((current) => addInternalCalendarEvent(current, event))}
              onSyncProvider={applyCalendarSync}
              onClearProviderData={clearCalendarProviderData}
            />
          )}
          {activeTab === 'Tasks' && (
            <TasksScreen
              tasks={state.tasks.items}
              users={state.users}
              activeUserId={state.activeUserId}
              onAddTask={(task) => setState((current) => addTask(current, task))}
              onUpdateTask={(id, update) => setState((current) => updateTask(current, id, update))}
              onToggleTask={(id) => setState((current) => toggleTask(current, id))}
            />
          )}
          {activeTab === 'Money' && (
            <MoneyScreen
              money={state.money}
              onAddBill={(bill) => setState((current) => addBill(current, bill))}
              onUpdateBill={(id, update) => setState((current) => updateBill(current, id, update))}
              onDuplicateBill={(id) => setState((current) => duplicateBill(current, id))}
              onMarkBillPaid={(id, proofFileName) => setState((current) => markBillPaid(current, id, proofFileName))}
              onAddTransaction={(transaction) => setState((current) => addTransaction(current, transaction))}
              onImportTransactions={(transactions) => setState((current) => importTransactions(current, transactions))}
              onUpdateTransaction={(id, transaction) => setState((current) => updateTransaction(current, id, transaction))}
              onAddBudget={(budget) => setState((current) => saveMoneyBudget(current, budget).state)}
              onUpdateBudget={(id, update) =>
                setState((current) => ({ ...current, money: { ...current.money, budgets: current.money.budgets.map((budget) => (budget.id === id ? { ...budget, ...update } : budget)) } }))
              }
              onDeleteBill={(id) => setState((current) => deleteBill(current, id))}
              onDeleteTransaction={(id) => setState((current) => deleteTransaction(current, id))}
              onDeleteBudget={(id) => setState((current) => ({ ...current, money: { ...current.money, budgets: current.money.budgets.filter((budget) => budget.id !== id) } }))}
            />
          )}
          {activeTab === 'More' && (
            <MoreScreen
              users={state.users}
              activeUser={activeUser}
              activeUserId={state.activeUserId}
              canManageSensitiveData={hasPermission(activeUser, 'data_export')}
              canResetApp={hasPermission(activeUser, 'data_reset', state.settings)}
              canRestartSetup={hasPermission(activeUser, 'setup_restart')}
              avatarGame={state.avatarGame}
              setupCompleted={state.setupCompleted}
              userPins={state.userPins}
              places={state.places}
              events={state.calendar.events}
              externalEvents={state.calendar.externalEvents}
              tasks={state.tasks.items}
              onCareAction={onCareAction}
              onChangePin={async (currentPin, nextPin) => {
                const activeUserId = state.activeUserId;
                if (!activeUserId) return false;
                const matches = await verifyPin(activeUserId, currentPin, state.userPins[activeUserId]);
                if (!matches) return false;
                const encodedPin = await encodePin(activeUserId, nextPin);
                setState((current) => ({ ...current, userPins: { ...current.userPins, [activeUserId]: encodedPin } }));
                return true;
              }}
              onAddPlace={(place) => setState((current) => ({ ...current, places: [{ id: `place-${Date.now()}`, ...place }, ...current.places] }))}
              onUpdatePlace={(id, patch) => setState((current) => ({ ...current, places: current.places.map((place) => (place.id === id ? { ...place, ...patch } : place)) }))}
              onExportData={() => JSON.stringify({ ...state, activeUserId: null, setupUserId: null }, null, 2)}
              onResetData={resetAppData}
              onUpdateSettings={(update) => setState((current) => ({ ...current, settings: { ...current.settings, ...update } }))}
              onLock={lockApp}
              onRestartSetup={restartSetup}
            />
          )}
        </section>

        <nav className="bottom-nav glass-card" aria-label="Primary">
          {TABS.filter((tab) => visibleTabs.includes(tab)).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`nav-item ${activeTab === tab ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab)}
              aria-current={activeTab === tab ? 'page' : undefined}
            >
              <span className="nav-item-icon">{tabIcons[tab]}</span>
              <span>{tab}</span>
            </button>
          ))}
        </nav>
      </div>
      <ToastViewport />
    </main>
  );
};

export const FamilyHubApp = () => (
  <ToastProvider>
    <AppInner />
  </ToastProvider>
);
