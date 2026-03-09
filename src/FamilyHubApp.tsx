import { useEffect, useMemo, useState } from 'react';
import { CalendarScreen } from './components/family-hub/CalendarScreen';
import { HomeScreen } from './components/family-hub/HomeScreen';
import { MoneyScreen } from './components/family-hub/MoneyScreen';
import { MoreScreen } from './components/family-hub/MoreScreen';
import { TasksScreen } from './components/family-hub/TasksScreen';
import { TABS, USER_PINS, type Tab, type User, type UserId } from './lib/family-hub/constants';
import { getTodayIso } from './lib/family-hub/date';
import { createInitialState, loadState, saveState, type FamilyHubState } from './lib/family-hub/storage';

const createId = () => Math.random().toString(36).slice(2, 10);

const tabIcons: Record<Tab, string> = {
  Home: '⌂',
  Calendar: '◷',
  Tasks: '✓',
  Money: '◉',
  More: '⋯'
};

const LoginScreen = ({ users, onLogin }: { users: User[]; onLogin: (userId: UserId, pin: string) => boolean }) => {
  const activeUsers = users.filter((user) => user.active);
  const inactiveUsers = users.filter((user) => !user.active);
  const [selectedUser, setSelectedUser] = useState<UserId>(activeUsers[0]?.id ?? 'johannes');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const ok = onLogin(selectedUser, pin);
    if (!ok) {
      setError('Invalid PIN. Please try again.');
      return;
    }
    setPin('');
    setError('');
  };

  return (
    <main className="login-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />
      <section className="glass-card login-card">
        <div className="screen-title">
          <p className="eyebrow">Family Hub</p>
          <h1>Welcome back</h1>
          <p className="subtitle">Securely access your household tasks, plans, and shared money in one place.</p>
        </div>

        <label className="field-label" htmlFor="user-select">
          Household member
        </label>
        <div className="select-wrap">
          <select id="user-select" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value as UserId)}>
            {activeUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        <label className="field-label" htmlFor="pin-input">
          4-digit PIN
        </label>
        <input
          id="pin-input"
          className="pin-input"
          type="password"
          maxLength={4}
          pattern="[0-9]{4}"
          inputMode="numeric"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />

        {error ? <div className="error-banner">{error}</div> : null}

        <button className="btn btn-primary" onClick={submit} disabled={pin.length !== 4}>
          Login
        </button>

        <div className="inactive-users">
          <p className="small-title">Future household profiles</p>
          <div className="chip-list">
            {inactiveUsers.map((user) => (
              <span key={user.id} className="chip chip-muted">
                {user.name}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export const FamilyHubApp = () => {
  const [state, setState] = useState<FamilyHubState>(() => loadState());
  const [activeTab, setActiveTab] = useState<Tab>('Home');

  useEffect(() => {
    saveState(state);
  }, [state]);

  const activeUser = useMemo(() => state.users.find((user) => user.id === state.activeUserId), [state]);

  if (!state.activeUserId) {
    return (
      <LoginScreen
        users={state.users}
        onLogin={(userId, pin) => {
          if (USER_PINS[userId] !== pin) return false;
          setState((current) => ({ ...current, activeUserId: userId }));
          return true;
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
            <h1>Hello, {activeUser?.name}</h1>
          </div>
          <button className="btn btn-ghost" onClick={() => setState(createInitialState())}>
            Log out
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
              onAdd={(title) =>
                setState((current) => ({
                  ...current,
                  tasks: [...current.tasks, { id: createId(), title, completed: false }]
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
              onAddPayment={({ title, amount, dueDate }) =>
                setState((current) => ({
                  ...current,
                  payments: [...current.payments, { id: createId(), title, amount, dueDate, paid: false }]
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
                            description: `Payment: ${payment.title}`,
                            amount: -Math.abs(payment.amount),
                            category: 'Payment',
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
            />
          )}
          {activeTab === 'More' && <MoreScreen users={state.users} places={state.places} reminders={state.reminders} />}
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
