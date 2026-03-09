import { useEffect, useMemo, useState } from 'react';
import { CalendarScreen } from './components/family-hub/CalendarScreen';
import { HomeScreen } from './components/family-hub/HomeScreen';
import { LoginScreen } from './components/family-hub/LoginScreen';
import { MoneyScreen } from './components/family-hub/MoneyScreen';
import { MoreScreen } from './components/family-hub/MoreScreen';
import { SetupWizard } from './components/family-hub/SetupWizard';
import { TasksScreen } from './components/family-hub/TasksScreen';
import { TABS, type Tab, type UserId } from './lib/family-hub/constants';
import { getTodayIso } from './lib/family-hub/date';
import { encodePin, verifyPin } from './lib/family-hub/pin';
import { createInitialState, loadState, saveState, type FamilyHubState } from './lib/family-hub/storage';

const createId = () => Math.random().toString(36).slice(2, 10);
const tabIcons: Record<Tab, string> = { Home: '⌂', Calendar: '◷', Tasks: '✓', Money: '◉', More: '⋯' };

export const FamilyHubApp = () => {
  const [state, setState] = useState<FamilyHubState>(() => loadState());
  const [activeTab, setActiveTab] = useState<Tab>('Home');

  useEffect(() => saveState(state), [state]);

  const activeUser = useMemo(() => state.users.find((u) => u.id === state.activeUserId), [state]);

  if (!state.activeUserId) {
    return <LoginScreen users={state.users} hasPin={(id) => !!state.userPins[id]} onSelectForSetup={(userId) => setState((c) => ({ ...c, activeUserId: userId }))} onUnlock={(userId, pin) => {
      const ok = verifyPin(userId, pin, state.userPins[userId]);
      if (ok) setState((c) => ({ ...c, activeUserId: userId }));
      return ok;
    }} />;
  }

  if (!state.userSetup[state.activeUserId].completed) {
    return <main className="app-shell"><div className="bg-orb bg-orb--top" /><div className="bg-orb bg-orb--bottom" /><div className="app-phone-frame"><SetupWizard user={activeUser!} onFinish={(payload) => setState((current) => ({
      ...current,
      userPins: { ...current.userPins, [current.activeUserId!]: encodePin(current.activeUserId!, payload.pin) },
      userSetup: { ...current.userSetup, [current.activeUserId!]: { completed: true, openingBalance: payload.openingBalance, monthlyIncome: payload.monthlyIncome } },
      payments: [...current.payments, ...payload.payments.map((p) => ({ ...p, id: createId(), paid: false }))],
      budgets: [...current.budgets, ...payload.budgets.map((b) => ({ id: createId(), category: b.category, limit: b.limit, spent: 0 }))]
    }))} /></div></main>;
  }

  const setup = state.userSetup[state.activeUserId];

  return <main className="app-shell">
    <div className="bg-orb bg-orb--top" /><div className="bg-orb bg-orb--bottom" />
    <div className="app-phone-frame">
      <header className="glass-card app-header"><div><p className="eyebrow">Family Hub</p><h1>{activeUser ? `Hello, ${activeUser.name}` : 'Family Hub'}</h1></div><button className="btn btn-ghost" onClick={() => setState((c) => ({ ...c, activeUserId: null }))}>Lock</button></header>
      <section className="screen-content">
        {activeTab === 'Home' && <HomeScreen state={state} />}
        {activeTab === 'Calendar' && <CalendarScreen events={state.events} payments={state.payments} tasks={state.tasks} onAddEvent={(title, date, type) => setState((c) => ({ ...c, events: [...c.events, { id: createId(), title, date, type }] }))} onAssignTaskDate={(taskId, date) => setState((c) => ({ ...c, tasks: c.tasks.map((t) => t.id === taskId ? { ...t, dueDate: date } : t) }))} />}
        {activeTab === 'Tasks' && <TasksScreen tasks={state.tasks} activeUserId={state.activeUserId} onAdd={(title, dueDate, waiting, owner) => setState((c) => ({ ...c, tasks: [...c.tasks, { id: createId(), title, dueDate, completed: false, waiting, owner }] }))} onToggle={(id) => setState((c) => ({ ...c, tasks: c.tasks.map((t) => t.id === id ? { ...t, completed: !t.completed } : t) }))} />}
        {activeTab === 'Money' && <MoneyScreen openingBalance={setup.openingBalance} monthlyIncome={setup.monthlyIncome} payments={state.payments} transactions={state.transactions} budgets={state.budgets} cashflowItems={state.cashflowItems} autoCreateTransaction={state.settings.autoCreateTransactionFromPayment} onToggleAutoCreate={(value) => setState((c) => ({ ...c, settings: { ...c.settings, autoCreateTransactionFromPayment: value } }))} onAddPayment={({ title, amount, dueDate, category }) => setState((c) => ({ ...c, payments: [...c.payments, { id: createId(), title, category, amount, dueDate, paid: false }] }))} onPayWithProof={(paymentId, proofFile) => setState((c) => {
          const payment = c.payments.find((item) => item.id === paymentId);
          if (!payment || payment.paid || !proofFile?.name) return c;
          const paidAt = getTodayIso();
          const linkedTransactionId = c.settings.autoCreateTransactionFromPayment ? createId() : undefined;
          return {
            ...c,
            transactions: linkedTransactionId ? [...c.transactions, { id: linkedTransactionId, paymentId: payment.id, date: paidAt, description: payment.title, amount: -Math.abs(payment.amount), category: payment.category, note: `Proof file: ${proofFile.name}` }] : c.transactions,
            payments: c.payments.map((item) => item.id === paymentId ? { ...item, paid: true, paidAt, proofFilename: proofFile.name, linkedTransactionId } : item)
          };
        })} onCreateTransaction={(payload) => setState((c) => ({ ...c, transactions: [...c.transactions, { ...payload, id: createId() }] }))} />}
        {activeTab === 'More' && <MoreScreen users={state.users} userSetup={state.userSetup} places={state.places} reminders={state.reminders} activeUserId={state.activeUserId} onAddPlace={(name) => setState((c) => ({ ...c, places: [...c.places, { id: createId(), name }] }))} onAddReminder={(title, date) => setState((c) => ({ ...c, reminders: [...c.reminders, { id: createId(), title, date }] }))} onToggleUserActive={(id: UserId) => setState((c) => ({ ...c, users: c.users.map((u) => u.id === id ? { ...u, active: !u.active } : u) }))} onChangePin={(id: UserId, pin: string) => setState((c) => ({ ...c, userPins: { ...c.userPins, [id]: encodePin(id, pin) } }))} onExportData={() => {
          const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'family-hub-export.json';
          a.click();
          URL.revokeObjectURL(url);
        }} onResetData={() => setState(createInitialState())} />}
      </section>
      <nav className="bottom-nav glass-card" aria-label="Primary">{TABS.map((tab) => <button key={tab} className={`nav-item ${activeTab === tab ? 'is-active' : ''}`} onClick={() => setActiveTab(tab)}><span aria-hidden>{tabIcons[tab]}</span><span>{tab}</span></button>)}</nav>
    </div>
  </main>;
};
