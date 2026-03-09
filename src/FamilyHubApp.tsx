import { useEffect, useMemo, useState } from 'react';
import { CalendarScreen } from './components/family-hub/CalendarScreen';
import { HomeScreen } from './components/family-hub/HomeScreen';
import { MoneyScreen } from './components/family-hub/MoneyScreen';
import { MoreScreen } from './components/family-hub/MoreScreen';
import { TasksScreen } from './components/family-hub/TasksScreen';
import { TABS, USER_PINS, type Tab, type UserId } from './lib/family-hub/constants';
import { getTodayIso } from './lib/family-hub/date';
import { createInitialState, loadState, saveState, type FamilyHubState } from './lib/family-hub/storage';

const createId = () => Math.random().toString(36).slice(2, 9);

export const FamilyHubApp = () => {
  const [state, setState] = useState<FamilyHubState>(() => loadState());
  const [activeTab, setActiveTab] = useState<Tab>('Home');
  const [login, setLogin] = useState({ userId: 'johannes' as UserId, pin: '' });

  useEffect(() => {
    saveState(state);
  }, [state]);

  const activeUser = useMemo(() => state.users.find((u) => u.id === state.activeUserId), [state]);

  if (!state.activeUserId) {
    const activeUsers = state.users.filter((u) => u.active);
    return (
      <main className="app stack login">
        <h1>Family Hub</h1>
        <p>Sign in to continue.</p>
        <select value={login.userId} onChange={(e) => setLogin((c) => ({ ...c, userId: e.target.value as UserId }))}>
          {activeUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          type="password"
          pattern="[0-9]{4}"
          inputMode="numeric"
          placeholder="4-digit PIN"
          value={login.pin}
          onChange={(e) => setLogin((curr) => ({ ...curr, pin: e.target.value }))}
        />
        <button
          onClick={() => {
            if (USER_PINS[login.userId] === login.pin) {
              setState((curr) => ({ ...curr, activeUserId: login.userId }));
              setLogin((curr) => ({ ...curr, pin: '' }));
            }
          }}
        >
          Login
        </button>
      </main>
    );
  }

  return (
    <main className="app stack">
      <header className="row spread">
        <div>
          <h1>Family Hub</h1>
          <div className="small">Welcome, {activeUser?.name}</div>
        </div>
        <button onClick={() => setState(createInitialState())}>Logout</button>
      </header>

      <nav className="row wrap">
        {TABS.map((tab) => (
          <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === 'Home' && <HomeScreen state={state} />}
      {activeTab === 'Tasks' && (
        <TasksScreen
          tasks={state.tasks}
          onAdd={(title) =>
            setState((curr) => ({ ...curr, tasks: [...curr.tasks, { id: createId(), title, completed: false }] }))
          }
          onToggle={(id) =>
            setState((curr) => ({
              ...curr,
              tasks: curr.tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
            }))
          }
        />
      )}
      {activeTab === 'Calendar' && (
        <CalendarScreen
          events={state.events}
          payments={state.payments}
          onAddEvent={(title, date, type) =>
            setState((curr) => ({ ...curr, events: [...curr.events, { id: createId(), title, date, type }] }))
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
            setState((curr) => ({ ...curr, settings: { ...curr.settings, autoCreateTransactionFromPayment: value } }))
          }
          onAddPayment={({ title, amount, dueDate }) =>
            setState((curr) => ({
              ...curr,
              payments: [...curr.payments, { id: createId(), title, amount, dueDate, paid: false }]
            }))
          }
          onPayWithProof={(paymentId, proofFile) =>
            setState((curr) => {
              const now = getTodayIso();
              const payment = curr.payments.find((p) => p.id === paymentId);
              if (!payment || payment.paid || !proofFile?.name) return curr;

              const linkedTransactionId = curr.settings.autoCreateTransactionFromPayment ? createId() : undefined;
              const nextTransactions = linkedTransactionId
                ? [
                    ...curr.transactions,
                    {
                      id: linkedTransactionId,
                      date: now,
                      description: `Payment: ${payment.title}`,
                      amount: -Math.abs(payment.amount),
                      category: 'Payment',
                      note: proofFile?.name ? `Proof file: ${proofFile.name}` : undefined
                    }
                  ]
                : curr.transactions;

              return {
                ...curr,
                transactions: nextTransactions,
                payments: curr.payments.map((p) =>
                  p.id === paymentId
                    ? {
                        ...p,
                        paid: true,
                        paidAt: now,
                        linkedTransactionId,
                        proofFilename: proofFile?.name
                      }
                    : p
                )
              };
            })
          }
        />
      )}
      {activeTab === 'More' && <MoreScreen users={state.users} places={state.places} reminders={state.reminders} />}
    </main>
  );
};
