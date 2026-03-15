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
import { loadState, saveState, type AvatarLook, type AvatarMood, type FamilyHubState } from './lib/family-hub/storage';
import { ToastViewport } from './ui/Toast';
import { ToastProvider } from './ui/useToasts';


const tabIcons: Record<Tab, string> = {
  Home: '🏡',
  Calendar: '📅',
  Tasks: '✅',
  Money: '💰',
  More: '⋯'
};



const AppInner = () => {
  const [state, setState] = useState<FamilyHubState>(() => loadState());
  const [activeTab, setActiveTab] = useState<Tab>('Home');
  useEffect(() => saveState(state), [state]);

  const activeUser = useMemo(() => state.users.find((user) => user.id === state.activeUserId) ?? null, [state.users, state.activeUserId]);

  const onAvatarAction = (userId: keyof FamilyHubState['avatars'], action: 'feed' | 'dance' | 'ball' | 'adventure') => {
    const actionRewards: Record<'feed' | 'dance' | 'ball' | 'adventure', { mood: AvatarMood; pointsEarned: number; familyPointsEarned: number }> = {
      feed: { mood: 'happy', pointsEarned: 8, familyPointsEarned: 2 },
      dance: { mood: 'excited', pointsEarned: 10, familyPointsEarned: 3 },
      ball: { mood: 'silly', pointsEarned: 9, familyPointsEarned: 2 },
      adventure: { mood: 'proud', pointsEarned: 14, familyPointsEarned: 4 }
    };
    const reward = actionRewards[action];
    setState((current) => ({ ...current, familyPoints: current.familyPoints + reward.familyPointsEarned, avatars: { ...current.avatars, [userId]: { ...current.avatars[userId], mood: reward.mood, points: current.avatars[userId].points + reward.pointsEarned, familyContribution: current.avatars[userId].familyContribution + reward.familyPointsEarned } } }));
    return reward;
  };

  const onCustomizeAvatar = (userId: keyof FamilyHubState['avatars'], look: AvatarLook) => setState((current) => ({ ...current, avatars: { ...current.avatars, [userId]: { ...current.avatars[userId], look } } }));

  if (state.setupUserId) {
    const user = state.users.find((item) => item.id === state.setupUserId);
    if (!user) return null;
    return <SetupWizard user={user} onFinish={(pin, profile) => setState((current) => ({ ...current, activeUserId: user.id, setupUserId: null, userPins: { ...current.userPins, [user.id]: encodePin(user.id, pin) }, userSetupProfiles: { ...current.userSetupProfiles, [user.id]: profile }, setupCompleted: { ...current.setupCompleted, [user.id]: true } }))} />;
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
          {activeTab === 'Calendar' && <CalendarScreen events={state.calendar.events} onAddEvent={(event) => setState((current) => ({ ...current, calendar: { events: [{ id: `event-${Date.now()}`, ...event }, ...current.calendar.events] } }))} />}
          {activeTab === 'Tasks' && <TasksScreen tasks={state.tasks.items} activeUserId={state.activeUserId} onAddTask={(task) => setState((c) => ({ ...c, tasks: { items: [{ id: `task-${Date.now()}`, completed: false, ...task }, ...c.tasks.items] } }))} onUpdateTask={(id, update) => setState((c) => ({ ...c, tasks: { items: c.tasks.items.map((task) => task.id === id ? { ...task, ...update } : task) } }))} onToggleTask={(id) => setState((c) => ({ ...c, tasks: { items: c.tasks.items.map((task) => task.id === id ? { ...task, completed: !task.completed } : task) } }))} />}
          {activeTab === 'Money' && <MoneyScreen profile={state.activeUserId ? state.userSetupProfiles[state.activeUserId] : undefined} payments={state.money.payments} actualTransactions={state.money.actualTransactions} onSaveProfile={() => undefined} onAddPayment={() => undefined} onAddTransaction={() => undefined} onUpdateTransaction={() => undefined} onMarkPaymentPaid={() => undefined} />}
          {activeTab === 'More' && <MoreScreen users={state.users} avatars={state.avatars} familyPoints={state.familyPoints} activeUser={activeUser} setupCompleted={state.setupCompleted} userPins={state.userPins} places={state.places} events={state.calendar.events} tasks={state.tasks.items} onCustomizeAvatar={onCustomizeAvatar} onAvatarAction={onAvatarAction} onChangePin={() => false} onSetUserPin={() => undefined} onAddPlace={() => undefined} onUpdatePlace={() => undefined} onExportData={() => JSON.stringify(state, null, 2)} onResetData={() => setState(loadState())} />}
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

export const FamilyHubApp = () => <ToastProvider><AppInner /></ToastProvider>;
