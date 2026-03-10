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
import { loadState, saveState, type ActualTransaction, type FamilyHubState } from './lib/family-hub/storage';

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
        <header className="glass-card app-header">
          <div>
            <p className="eyebrow">Family Hub</p>
            <h1>{activeUser ? `Hello, ${activeUser.name}` : 'Family Hub'}</h1>
          </div>
          <button className="btn btn-ghost" onClick={() => setState((current) => ({ ...current, activeUserId: null }))}>
            Lock
          </button>
        </header>

        <section className="screen-content">
          {activeTab === 'Home' && <HomeScreen state={state} />}
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
                        ...payment
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
                        ...payment
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
              onTogglePaymentPaid={(id) => {
                setState((current) => {
                  const payment = current.money.payments.find((item) => item.id === id);
                  if (!payment) return current;

                  if (payment.paid) {
                    return {
                      ...current,
                      money: {
                        payments: current.money.payments.map((item) =>
                          item.id === id ? { ...item, paid: false } : item
                        ),
                        actualTransactions: current.money.actualTransactions.filter((tx) => tx.sourcePaymentId !== id)
                      }
                    };
                  }

                  const alreadyConverted = current.money.actualTransactions.some((tx) => tx.sourcePaymentId === id);
                  const convertedTransaction: ActualTransaction[] = alreadyConverted
                    ? []
                    : [
                        {
                          id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                          title: payment.title,
                          amount: payment.amount,
                          date: payment.dueDate,
                          kind: 'outflow',
                          sourcePaymentId: id
                        }
                      ];

                  return {
                    ...current,
                    money: {
                      payments: current.money.payments.map((item) =>
                        item.id === id ? { ...item, paid: true } : item
                      ),
                      actualTransactions: [...convertedTransaction, ...current.money.actualTransactions]
                    }
                  };
                });
              }}
            />
          )}
          {activeTab === 'More' && (
            <MoreScreen
              activeUser={activeUser}
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
            />
          )}
        </section>

        <nav className="bottom-nav glass-card" aria-label="Primary">
          {TABS.map((tab) => (
            <button key={tab} className={`nav-item ${activeTab === tab ? 'is-active' : ''}`} onClick={() => setActiveTab(tab)}>
              <span>{tabIcons[tab]}</span>
              <span>{tab}</span>
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
};
