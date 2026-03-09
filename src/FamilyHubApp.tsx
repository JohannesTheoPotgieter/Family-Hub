import { useEffect, useMemo, useState } from 'react';
import { CalendarScreen } from './components/family-hub/CalendarScreen';
import { HomeScreen } from './components/family-hub/HomeScreen';
import { LoginScreen } from './components/family-hub/LoginScreen';
import { MoneyScreen } from './components/family-hub/MoneyScreen';
import { MoreScreen } from './components/family-hub/MoreScreen';
import { TasksScreen } from './components/family-hub/TasksScreen';
import { TABS, type Tab, type UserId } from './lib/family-hub/constants';
import { getTodayIso } from './lib/family-hub/date';
import { verifyPin, encodePin } from './lib/family-hub/pin';
import { createInitialState, loadState, saveState, type FamilyHubState } from './lib/family-hub/storage';

const createId = () => Math.random().toString(36).slice(2, 10);

const tabIcons: Record<Tab, string> = { Home: '⌂', Calendar: '◷', Tasks: '✓', Money: '◉', More: '⋯' };

export const FamilyHubApp = () => {
  const [state, setState] = useState<FamilyHubState>(() => loadState());
  const [activeTab, setActiveTab] = useState<Tab>('Home');

  useEffect(() => saveState(state), [state]);

  const activeUser = useMemo(() => state.users.find((u) => u.id === state.activeUserId), [state]);

  if (!state.activeUserId) {
    return (
      <LoginScreen
        users={state.users}
        hasPin={(userId) => !!state.userPins[userId]}
        onCreatePin={(userId, pin) =>
          setState((current) => ({
            ...current,
            userPins: { ...current.userPins, [userId]: encodePin(userId, pin) },
            activeUserId: userId
          }))
        }
        onUnlock={(userId, pin) => {
          const ok = verifyPin(userId, pin, state.userPins[userId]);
          if (ok) setState((current) => ({ ...current, activeUserId: userId }));
          return ok;
        }}
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
              events={state.events}
              payments={state.payments}
              onAddEvent={(title, date, type) =>
                setState((current) => ({ ...current, events: [...current.events, { id: createId(), title, date, type }] }))
              }
            />
          )}
          {activeTab === 'Tasks' && (
            <TasksScreen
              tasks={state.tasks}
              onAdd={(title, dueDate, waiting) =>
                setState((current) => ({
                  ...current,
                  tasks: [...current.tasks, { id: createId(), title, dueDate, completed: false, waiting }]
                }))
              }
              onToggle={(id) =>
                setState((current) => ({
                  ...current,
                  tasks: current.tasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task))
                }))
              }
            />
          )}
          {activeTab === 'Money' && (
            <MoneyScreen
              payments={state.payments}
              transactions={state.transactions}
              budgets={state.budgets}
              cashflowItems={state.cashflowItems}
              autoCreateTransaction={state.settings.autoCreateTransactionFromPayment}
              onToggleAutoCreate={(value) =>
                setState((current) => ({
                  ...current,
                  settings: { ...current.settings, autoCreateTransactionFromPayment: value }
                }))
              }
              onAddPayment={({ title, amount, dueDate, category }) =>
                setState((current) => ({
                  ...current,
                  payments: [...current.payments, { id: createId(), title, category, amount, dueDate, paid: false }]
                }))
              }
              onPayWithProof={(paymentId, proofFile) =>
                setState((current) => {
                  const payment = current.payments.find((item) => item.id === paymentId);
                  if (!payment || payment.paid || !proofFile?.name) return current;
                  const paidAt = getTodayIso();
                  const linkedTransactionId = current.settings.autoCreateTransactionFromPayment ? createId() : undefined;
                  return {
                    ...current,
                    transactions: linkedTransactionId
                      ? [
                          ...current.transactions,
                          {
                            id: linkedTransactionId,
                            date: paidAt,
                            description: payment.title,
                            amount: -Math.abs(payment.amount),
                            category: payment.category,
                            note: `Proof file: ${proofFile.name}`
                          }
                        ]
                      : current.transactions,
                    payments: current.payments.map((item) =>
                      item.id === paymentId
                        ? { ...item, paid: true, paidAt, proofFilename: proofFile.name, linkedTransactionId }
                        : item
                    )
                  };
                })
              }
              onCreateTransaction={(payload) =>
                setState((current) => ({ ...current, transactions: [...current.transactions, { ...payload, id: createId() }] }))
              }
            />
          )}
          {activeTab === 'More' && (
            <MoreScreen
              users={state.users}
              places={state.places}
              reminders={state.reminders}
              activeUserId={state.activeUserId}
              onAddPlace={(name) => setState((current) => ({ ...current, places: [...current.places, { id: createId(), name }] }))}
              onAddReminder={(title, date) =>
                setState((current) => ({ ...current, reminders: [...current.reminders, { id: createId(), title, date }] }))
              }
              onToggleUserActive={(userId) =>
                setState((current) => ({
                  ...current,
                  users: current.users.map((u) => (u.id === userId ? { ...u, active: !u.active } : u))
                }))
              }
              onChangePin={(userId: UserId, pin: string) =>
                setState((current) => ({ ...current, userPins: { ...current.userPins, [userId]: encodePin(userId, pin) } }))
              }
              onExportData={() => {
                const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'family-hub-export.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
              onResetData={() => setState(createInitialState())}
            />
          )}
        </section>

        <nav className="bottom-nav glass-card" aria-label="Primary">
          {TABS.map((tab) => (
            <button key={tab} className={`nav-item ${activeTab === tab ? 'is-active' : ''}`} onClick={() => setActiveTab(tab)}>
              <span aria-hidden>{tabIcons[tab]}</span>
              <span>{tab}</span>
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
};
