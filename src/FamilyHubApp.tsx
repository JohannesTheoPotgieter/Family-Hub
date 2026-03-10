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

  const grantPoints = (userId: UserId, points: number) => {
    setState((current) => ({
      ...current,
      familyPoints: current.familyPoints + points,
      usersProfile: {
        ...current.usersProfile,
        [userId]: {
          ...current.usersProfile[userId],
          points: current.usersProfile[userId].points + points,
          familyPointsContribution: current.usersProfile[userId].familyPointsContribution + points,
          avatar: { ...current.usersProfile[userId].avatar, mood: 'excited' }
        }
      }
    }));
  };

  if (state.setupUserId) {
    const user = state.users.find((item) => item.id === state.setupUserId);
    if (!user) return null;
    return <SetupWizard user={user} onFinish={(payload) => setState((current) => ({
      ...current,
      activeUserId: user.id,
      setupUserId: null,
      userPins: { ...current.userPins, [user.id]: encodePin(user.id, payload.pin) },
      budgets: payload.budgets.map((item) => ({ id: createId(), category: item.category, limit: item.limit, spent: 0 })),
      payments: payload.payments.map((item) => ({ id: createId(), title: item.title, category: item.category, amount: item.amount, dueDate: item.dueDate, recurring: true, paid: false })),
      usersProfile: {
        ...current.usersProfile,
        [user.id]: { ...current.usersProfile[user.id], setupCompleted: true, openingBalance: payload.openingBalance, monthlyIncome: payload.monthlyIncome, avatar: { ...current.usersProfile[user.id].avatar, ...payload.avatar } }
      },
      familyPoints: current.familyPoints + 20
    }))} />;
  }

  if (!state.activeUserId) {
    return <LoginScreen
      users={state.users}
      hasPin={(id) => !!state.userPins[id]}
      isSetupComplete={(id) => state.usersProfile[id].setupCompleted}
      onUnlock={(id, pin) => {
        const ok = verifyPin(id, pin, state.userPins[id]);
        if (ok) setState((current) => ({ ...current, activeUserId: id }));
        return ok;
      }}
      onStartSetup={(id) => setState((current) => ({ ...current, setupUserId: id }))}
    />;
  }

  return (
    <main className="app-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />
      <div className="app-phone-frame">
        <header className="glass-card app-header">
          <div><p className="eyebrow">Family Hub</p><h1>{activeUser ? `Hello, ${activeUser.name}` : 'Family Hub'}</h1></div>
          <button className="btn btn-ghost" onClick={() => setState((c) => ({ ...c, activeUserId: null }))}>Lock</button>
        </header>

        <section className="screen-content">
          {activeTab === 'Home' && <HomeScreen state={state} />}
          {activeTab === 'Calendar' && <CalendarScreen events={state.events} payments={state.payments} tasks={state.tasks} onAddEvent={(title, date, type) => setState((c) => ({ ...c, events: [...c.events, { id: createId(), title, date, type }] }))} onScheduleTask={(taskId, date) => { setState((c) => ({ ...c, tasks: c.tasks.map((t) => t.id === taskId ? { ...t, dueDate: date } : t) })); grantPoints(state.activeUserId!, 2); }} />}
          {activeTab === 'Tasks' && <TasksScreen tasks={state.tasks} activeUserId={state.activeUserId} onAdd={(task) => { setState((c) => ({ ...c, tasks: [...c.tasks, { ...task, id: createId(), completed: false }] })); grantPoints(state.activeUserId!, 2); }} onToggle={(id) => setState((c) => ({ ...c, tasks: c.tasks.map((t) => t.id === id ? { ...t, completed: !t.completed } : t) }))} />}
          {activeTab === 'Money' && <MoneyScreen state={state} onAddPayment={({ title, amount, dueDate, category }) => { setState((c) => ({ ...c, payments: [...c.payments, { id: createId(), title, category, amount, dueDate, recurring: true, paid: false }] })); grantPoints(state.activeUserId!, 2); }} onPayWithProof={(paymentId, proofFile) => setState((c) => {
            const payment = c.payments.find((item) => item.id === paymentId);
            if (!payment || payment.paid || !proofFile?.name) return c;
            const paidAt = getTodayIso();
            const linkedTransactionId = c.settings.autoCreateTransactionFromPayment ? createId() : undefined;
            return {
              ...c,
              transactions: linkedTransactionId ? [...c.transactions, { id: linkedTransactionId, date: paidAt, description: payment.title, amount: -Math.abs(payment.amount), category: payment.category, note: `Proof: ${proofFile.name}`, paymentId: payment.id }] : c.transactions,
              payments: c.payments.map((item) => item.id === paymentId ? { ...item, paid: true, paidAt, proofFilename: proofFile.name, linkedTransactionId } : item)
            };
          })} onCreateTransaction={(payload) => { setState((c) => ({ ...c, transactions: [...c.transactions, { ...payload, id: createId() }] })); grantPoints(state.activeUserId!, 1); }} onToggleAutoCreate={(value) => setState((c) => ({ ...c, settings: { ...c.settings, autoCreateTransactionFromPayment: value } }))} />}
          {activeTab === 'More' && <MoreScreen state={state} onAddPlace={(name) => setState((c) => ({ ...c, places: [...c.places, { id: createId(), name }] }))} onAddReminder={(title, date) => setState((c) => ({ ...c, reminders: [...c.reminders, { id: createId(), title, date }] }))} onToggleUserActive={(userId) => setState((c) => ({ ...c, users: c.users.map((u) => u.id === userId ? { ...u, active: !u.active } : u) }))} onChangePin={(userId, pin) => setState((c) => ({ ...c, userPins: { ...c.userPins, [userId]: encodePin(userId, pin) } }))} onAvatarAction={(userId, action) => {
            const mood = action === 'feed' ? 'happy' : action === 'dance' ? 'excited' : action === 'adventure' ? 'excited' : 'chill';
            grantPoints(userId, 1);
            setState((c) => ({ ...c, usersProfile: { ...c.usersProfile, [userId]: { ...c.usersProfile[userId], avatar: { ...c.usersProfile[userId].avatar, mood, inventory: [...c.usersProfile[userId].avatar.inventory, action === 'play' ? 'Ball trick' : 'Sticker'] } } } }));
          }} onAvatarCustomize={(userId, avatar) => setState((c) => ({ ...c, usersProfile: { ...c.usersProfile, [userId]: { ...c.usersProfile[userId], avatar: { ...c.usersProfile[userId].avatar, ...avatar } } } }))} onExportData={() => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'family-hub-export.json'; a.click(); URL.revokeObjectURL(url); }} onResetData={() => setState(createInitialState())} />}
        </section>

        <nav className="bottom-nav glass-card" aria-label="Primary">{TABS.map((tab) => <button key={tab} className={`nav-item ${activeTab === tab ? 'is-active' : ''}`} onClick={() => setActiveTab(tab)}><span>{tabIcons[tab]}</span><span>{tab}</span></button>)}</nav>
      </div>
    </main>
  );
};
