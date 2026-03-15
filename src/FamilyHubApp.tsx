import { useEffect, useMemo, useState } from 'react';
import { CalendarScreen } from './components/family-hub/CalendarScreen';
import { HomeScreen } from './components/family-hub/HomeScreen';
import { LoginScreen } from './components/family-hub/LoginScreen';
import { MoneyScreen } from './components/family-hub/MoneyScreen';
import { MoreScreen } from './components/family-hub/MoreScreen';
import { SetupWizard } from './components/family-hub/SetupWizard';
import { TasksScreen } from './components/family-hub/TasksScreen';
import { TABS, type Tab } from './lib/family-hub/constants';
import { encodePin, verifyPin } from './lib/family-hub/pin';
import { getTodayIso } from './lib/family-hub/date';
import {
  loadState,
  saveState,
  type AvatarLook,
  type AvatarMood,
  type FamilyHubState
} from './lib/family-hub/storage';

const tabIcons: Record<Tab, string> = {
  Home: '⌂',
  Calendar: '◷',
  Tasks: '✓',
  Money: '◉',
  More: '⋯'
};

export const FamilyHubApp = () => {
  const [state, setState] = useState<FamilyHubState>(() => loadState());
  const [activeTab, setActiveTab] = useState<Tab>('Home');

  useEffect(() => {
    saveState(state);
  }, [state]);

  const activeUser = useMemo(
    () => state.users.find((user) => user.id === state.activeUserId) ?? null,
    [state.users, state.activeUserId]
  );


  const onAvatarAction = (userId: keyof FamilyHubState['avatars'], action: 'feed' | 'dance' | 'ball' | 'adventure') => {
    const actionRewards: Record<'feed' | 'dance' | 'ball' | 'adventure', { mood: AvatarMood; pointsEarned: number; familyPointsEarned: number }> = {
      feed: { mood: 'happy', pointsEarned: 8, familyPointsEarned: 2 },
      dance: { mood: 'excited', pointsEarned: 10, familyPointsEarned: 3 },
      ball: { mood: 'silly', pointsEarned: 9, familyPointsEarned: 2 },
      adventure: { mood: 'proud', pointsEarned: 14, familyPointsEarned: 4 }
    };

    const reward = actionRewards[action];

    setState((current) => ({
      ...current,
      familyPoints: current.familyPoints + reward.familyPointsEarned,
      avatars: {
        ...current.avatars,
        [userId]: {
          ...current.avatars[userId],
          mood: reward.mood,
          points: current.avatars[userId].points + reward.pointsEarned,
          familyContribution: current.avatars[userId].familyContribution + reward.familyPointsEarned,
          inventory:
            action === 'adventure' && !current.avatars[userId].inventory.includes('Adventure pebble')
              ? [...current.avatars[userId].inventory, 'Adventure pebble']
              : current.avatars[userId].inventory
        }
      }
    }));

    return reward;
  };

  const onCustomizeAvatar = (userId: keyof FamilyHubState['avatars'], look: AvatarLook) => {
    setState((current) => ({
      ...current,
      avatars: {
        ...current.avatars,
        [userId]: {
          ...current.avatars[userId],
          look
        }
      }
    }));
  };

  if (state.setupUserId) {
    const user = state.users.find((item) => item.id === state.setupUserId);
    if (!user) return null;

    return (
      <SetupWizard
        user={user}
        onFinish={(pin, profile) => {
          setState((current) => ({
            ...current,
            activeUserId: user.id,
            setupUserId: null,
            userPins: { ...current.userPins, [user.id]: encodePin(user.id, pin) },
            userSetupProfiles: { ...current.userSetupProfiles, [user.id]: profile },
            setupCompleted: { ...current.setupCompleted, [user.id]: true }
          }));
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
        onUnlock={(id, pin) => {
          const unlocked = verifyPin(id, pin, state.userPins[id]);
          if (unlocked) {
            setState((current) => ({ ...current, activeUserId: id }));
          }
          return unlocked;
        }}
        onStartSetup={(id) => setState((current) => ({ ...current, setupUserId: id }))}
      />
    );
  }

  return (
    <main className="app-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />
      <div className="app-phone-frame">
        <section className="screen-content">
          {activeTab === 'Home' && <HomeScreen state={state} onAvatarAction={onAvatarAction} />}
          {activeTab === 'Calendar' && (
            <CalendarScreen
              activeUserId={state.activeUserId}
              events={state.calendar.events}
              payments={state.money.payments}
              tasks={state.tasks.items}
              onAddEvent={(event) => {
                setState((current) => ({
                  ...current,
                  calendar: {
                    events: [
                      {
                        id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        ...event
                      },
                      ...current.calendar.events
                    ]
                  }
                }));
              }}
              onAddPayment={(payment) => {
                setState((current) => ({
                  ...current,
                  money: {
                    ...current.money,
                    payments: [
                      {
                        id: `payment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        paid: false,
                        ...payment,
                        category: payment.category ?? 'Other',
                        autoCreateTransaction: payment.autoCreateTransaction ?? true
                      },
                      ...current.money.payments
                    ]
                  }
                }));
              }}
              onAddTask={(task) => {
                setState((current) => ({
                  ...current,
                  tasks: {
                    items: [
                      {
                        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        completed: false,
                        ...task
                      },
                      ...current.tasks.items
                    ]
                  }
                }));
              }}
              onUpdateTask={(id, update) => {
                setState((current) => ({
                  ...current,
                  tasks: {
                    items: current.tasks.items.map((task) => (task.id === id ? { ...task, ...update } : task))
                  }
                }));
              }}
            />
          )}
          {activeTab === 'Tasks' && (
            <TasksScreen
              tasks={state.tasks.items}
              activeUserId={state.activeUserId}
              onAddTask={(task) => {
                setState((current) => ({
                  ...current,
                  tasks: {
                    items: [
                      {
                        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        completed: false,
                        ...task
                      },
                      ...current.tasks.items
                    ]
                  }
                }));
              }}
              onUpdateTask={(id, update) => {
                setState((current) => ({
                  ...current,
                  tasks: {
                    items: current.tasks.items.map((task) => (task.id === id ? { ...task, ...update } : task))
                  }
                }));
              }}
              onToggleTask={(id) => {
                setState((current) => ({
                  ...current,
                  tasks: {
                    items: current.tasks.items.map((task) =>
                      task.id === id ? { ...task, completed: !task.completed } : task
                    )
                  }
                }));
              }}
            />
          )}
          {activeTab === 'Money' && (
            <MoneyScreen
              profile={state.activeUserId ? state.userSetupProfiles[state.activeUserId] : undefined}
              payments={state.money.payments}
              actualTransactions={state.money.actualTransactions}
              onSaveProfile={(nextProfile) => {
                setState((current) => {
                  if (!current.activeUserId) return current;

                  return {
                    ...current,
                    userSetupProfiles: {
                      ...current.userSetupProfiles,
                      [current.activeUserId]: nextProfile
                    }
                  };
                });
              }}
              onAddPayment={(payment) => {
                setState((current) => ({
                  ...current,
                  money: {
                    ...current.money,
                    payments: [
                      {
                        id: `payment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        paid: false,
                        ...payment,
                        category: payment.category ?? 'Other',
                        autoCreateTransaction: payment.autoCreateTransaction ?? true
                      },
                      ...current.money.payments
                    ]
                  }
                }));
              }}
              onAddTransaction={(transaction) => {
                setState((current) => ({
                  ...current,
                  money: {
                    ...current.money,
                    actualTransactions: [
                      {
                        id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        ...transaction
                      },
                      ...current.money.actualTransactions
                    ]
                  }
                }));
              }}

              onUpdateTransaction={(id, transaction) => {
                setState((current) => ({
                  ...current,
                  money: {
                    ...current.money,
                    actualTransactions: current.money.actualTransactions.map((item) =>
                      item.id === id ? { ...item, ...transaction } : item
                    )
                  }
                }));
              }}
              onMarkPaymentPaid={(id, proofFileName) => {
                setState((current) => {
                  const payment = current.money.payments.find((item) => item.id === id);
                  if (!payment) return current;

                  if (payment.paid) return current;

                  const existingLinked = current.money.actualTransactions.find((tx) => tx.sourcePaymentId === id);
                  const shouldCreateLinkedTransaction = payment.autoCreateTransaction !== false;
                  const linkedTransaction = shouldCreateLinkedTransaction && !existingLinked
                    ? {
                        id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        title: payment.title,
                        amount: payment.amount,
                        date: getTodayIso(),
                        kind: 'outflow' as const,
                        category: payment.category,
                        sourcePaymentId: id
                      }
                    : undefined;

                  return {
                    ...current,
                    money: {
                      payments: current.money.payments.map((item) =>
                        item.id === id
                          ? {
                              ...item,
                              paid: true,
                              proofFileName,
                              paidDate: getTodayIso(),
                              linkedTransactionId: linkedTransaction?.id ?? existingLinked?.id
                            }
                          : item
                      ),
                      actualTransactions: linkedTransaction
                        ? [linkedTransaction, ...current.money.actualTransactions]
                        : current.money.actualTransactions
                    }
                  };
                });
              }}
            />
          )}
          {activeTab === 'More' && (
            <MoreScreen
              users={state.users}
              avatars={state.avatars}
              familyPoints={state.familyPoints}
              activeUser={activeUser}
              setupCompleted={state.setupCompleted}
              userPins={state.userPins}
              places={state.places}
              events={state.calendar.events}
              tasks={state.tasks.items}
              onCustomizeAvatar={onCustomizeAvatar}
              onAvatarAction={onAvatarAction}
              onChangePin={(currentPin, nextPin) => {
                if (!activeUser) return false;
                const valid = verifyPin(activeUser.id, currentPin, state.userPins[activeUser.id]);
                if (!valid) return false;
                setState((current) => ({
                  ...current,
                  userPins: { ...current.userPins, [activeUser.id]: encodePin(activeUser.id, nextPin) }
                }));
                return true;
              }}
              onSetUserPin={(userId, nextPin) => {
                setState((current) => ({
                  ...current,
                  userPins: { ...current.userPins, [userId]: encodePin(userId, nextPin) }
                }));
              }}
              onAddPlace={(place) => {
                setState((current) => ({
                  ...current,
                  places: [
                    {
                      id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                      ...place
                    },
                    ...current.places
                  ]
                }));
              }}
              onUpdatePlace={(id, patch) => {
                setState((current) => ({
                  ...current,
                  places: current.places.map((place) => (place.id === id ? { ...place, ...patch } : place))
                }));
              }}
              onExportData={() => JSON.stringify(state, null, 2)}
              onResetData={() => {
                setState((current) => ({
                  ...loadState(),
                  activeUserId: current.activeUserId
                }));
              }}
            />
          )}
        </section>

        <nav className="bottom-nav glass-card" aria-label="Primary">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`nav-item ${activeTab === tab ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab)}
              aria-current={activeTab === tab ? 'page' : undefined}
            >
              <span>{tabIcons[tab]}</span>
              <span>{tab}</span>
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
};
