import { useEffect, useMemo, useState } from 'react';
import { CalendarScreen } from './components/family-hub/CalendarScreen';
import { HomeScreen } from './components/family-hub/HomeScreen';
import { LoginScreen } from './components/family-hub/LoginScreen';
import { MoneyScreen } from './components/family-hub/MoneyScreen';
import { MoreScreen } from './components/family-hub/MoreScreen';
import { SetupWizard } from './components/family-hub/SetupWizard';
import { TasksScreen } from './components/family-hub/TasksScreen';
import { TABS, type Tab, type UserId } from './lib/family-hub/constants';
import { markBillPaidWithOptionalTransaction } from './lib/family-hub/money';
import { encodePin, verifyPin } from './lib/family-hub/pin';
import { loadState, saveState, type FamilyHubState } from './lib/family-hub/storage';
import { ToastViewport } from './ui/Toast';
import { ToastProvider } from './ui/useToasts';
import { applyActivityReward, applyChallengeContribution, applyFamilyChallengeReward } from './domain/avatarRewards';
import type { AvatarActivityEvent } from './domain/avatarTypes';


const tabIcons: Record<Tab, string> = {
  Home: '🏡',
  Calendar: '📅',
  Tasks: '✅',
  Money: '💰',
  More: '⋯'
};



const ensureChallenges = (state: FamilyHubState): FamilyHubState => {
  if (state.avatarGame.familyChallenges.length) return state;
  const now = new Date();
  const start = now.toISOString();
  const weekEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const monthEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();
  const challenges = [
    { id: 'challenge-tasks-week', title: 'Together task burst', description: 'Finish 5 household tasks together this week.', category: 'tasks', cadence: 'weekly', targetType: 'count', targetValue: 5, progressValue: 0, rewardType: 'room_unlock', rewardPayload: 'moon-lamp', startsAtIso: start, endsAtIso: weekEnd, completed: false, participantUserIds: state.users.map((u) => u.id) },
    { id: 'challenge-plan-month', title: 'Cozy planning circle', description: 'Plan 3 family events this month.', category: 'planning', cadence: 'monthly', targetType: 'count', targetValue: 3, progressValue: 0, rewardType: 'stars', startsAtIso: start, endsAtIso: monthEnd, completed: false, participantUserIds: state.users.map((u) => u.id) },
    { id: 'challenge-money-month', title: 'Bright budget month', description: 'Pay bills on time as a family this month.', category: 'money', cadence: 'monthly', targetType: 'count', targetValue: 3, progressValue: 0, rewardType: 'family_theme', rewardPayload: 'cozy-study', startsAtIso: start, endsAtIso: monthEnd, completed: false, participantUserIds: state.users.map((u) => u.id) }
  ] as FamilyHubState['avatarGame']['familyChallenges'];
  const progressById = Object.fromEntries(challenges.map((item) => [item.id, { challengeId: item.id, contributionsByUserId: {}, contributingActionIds: [] }]));
  return { ...state, avatarGame: { ...state.avatarGame, familyChallenges: challenges, challengeProgressById: progressById } };
};

const AppInner = () => {
  const [state, setState] = useState<FamilyHubState>(() => ensureChallenges(loadState()));
  const [activeTab, setActiveTab] = useState<Tab>('Home');
  useEffect(() => saveState(state), [state]);

  const activeUser = useMemo(() => state.users.find((user) => user.id === state.activeUserId) ?? null, [state.users, state.activeUserId]);

  const rewardActivity = (current: FamilyHubState, event: AvatarActivityEvent) => {
    const currentCompanion = current.avatarGame.companionsByUserId[event.userId];
    if (!currentCompanion) return current;
    const nextCompanion = applyActivityReward(currentCompanion, event);
    let nextGame = {
      ...current.avatarGame,
      companionsByUserId: { ...current.avatarGame.companionsByUserId, [event.userId]: nextCompanion },
      rewardHistory: [{ id: event.actionId, label: event.type, atIso: event.createdAtIso, userId: event.userId }, ...current.avatarGame.rewardHistory].slice(0, 80)
    };

    const eligible = nextGame.familyChallenges.filter((challenge) => !challenge.completed && (
      (event.type.includes('TASK') && challenge.category === 'tasks') ||
      (event.type.includes('CALENDAR') && challenge.category === 'planning') ||
      (event.type.includes('PAYMENT') && challenge.category === 'money') ||
      challenge.category === 'mixed'
    ));

    for (const challenge of eligible) {
      const progress = nextGame.challengeProgressById[challenge.id] ?? { challengeId: challenge.id, contributionsByUserId: {}, contributingActionIds: [] };
      const applied = applyChallengeContribution(challenge, progress, event.userId, event.actionId, 1);
      nextGame = {
        ...nextGame,
        familyChallenges: nextGame.familyChallenges.map((item) => (item.id === challenge.id ? applied.challenge : item)),
        challengeProgressById: { ...nextGame.challengeProgressById, [challenge.id]: applied.progress }
      };
      if (applied.completedNow) {
        nextGame = {
          ...nextGame,
          familyRewardTrack: applyFamilyChallengeReward(nextGame.familyRewardTrack, applied.challenge),
          rewardHistory: [{ id: `${challenge.id}-done`, label: `Challenge complete: ${challenge.title}`, atIso: new Date().toISOString(), userId: event.userId }, ...nextGame.rewardHistory]
        };
      }
    }
    return { ...current, avatarGame: nextGame };
  };

  const onCareAction = (userId: UserId, action: 'feed' | 'play' | 'clean' | 'rest' | 'pet' | 'story') => {
    setState((current) => {
      const companion = current.avatarGame.companionsByUserId[userId];
      if (!companion) return current;
      const buff: Partial<typeof companion.stats> = action === 'feed' ? { hunger: 16, happiness: 4 } : action === 'play' ? { happiness: 12, energy: -6 } : action === 'clean' ? { hygiene: 18, calm: 4 } : action === 'rest' ? { energy: 22, calm: 8 } : action === 'pet' ? { happiness: 6 } : { calm: 10, happiness: 6 };
      const stats = {
        ...companion.stats,
        energy: Math.max(0, Math.min(100, companion.stats.energy + (buff.energy ?? 0))),
        hunger: Math.max(0, Math.min(100, companion.stats.hunger + (buff.hunger ?? 0))),
        hygiene: Math.max(0, Math.min(100, companion.stats.hygiene + (buff.hygiene ?? 0))),
        happiness: Math.max(0, Math.min(100, companion.stats.happiness + (buff.happiness ?? 0))),
        confidence: Math.max(0, Math.min(100, companion.stats.confidence + (buff.confidence ?? 0))),
        calm: Math.max(0, Math.min(100, companion.stats.calm + (buff.calm ?? 0))),
        health: companion.stats.health
      };
      return { ...current, avatarGame: { ...current.avatarGame, companionsByUserId: { ...current.avatarGame.companionsByUserId, [userId]: { ...companion, stats, lastInteractionAtIso: new Date().toISOString() } } } };
    });
  };

  if (state.setupUserId) {
    const user = state.users.find((item) => item.id === state.setupUserId);
    if (!user) return null;
    return <SetupWizard user={user} onFinish={(pin, profile) => setState((current) => rewardActivity({ ...current, activeUserId: user.id, setupUserId: null, userPins: { ...current.userPins, [user.id]: encodePin(user.id, pin) }, userSetupProfiles: { ...current.userSetupProfiles, [user.id]: profile }, setupCompleted: { ...current.setupCompleted, [user.id]: true } }, { type: 'APP_PROFILE_COMPLETED', userId: user.id, actionId: `profile-${user.id}`, createdAtIso: new Date().toISOString() }))} />;
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
          {activeTab === 'Home' && <HomeScreen state={state} />}
          {activeTab === 'Calendar' && <CalendarScreen events={state.calendar.events} onAddEvent={(event) => setState((current) => rewardActivity({ ...current, calendar: { events: [{ id: `event-${Date.now()}`, ...event }, ...current.calendar.events] } }, { type: 'APP_CALENDAR_EVENT_ADDED', userId: current.activeUserId!, actionId: `event-${event.title}-${event.date}`, createdAtIso: new Date().toISOString() }))} />}
          {activeTab === 'Tasks' && <TasksScreen tasks={state.tasks.items} activeUserId={state.activeUserId} onAddTask={(task) => setState((c) => ({ ...c, tasks: { items: [{ id: `task-${Date.now()}`, completed: false, ...task }, ...c.tasks.items] } }))} onUpdateTask={(id, update) => setState((c) => ({ ...c, tasks: { items: c.tasks.items.map((task) => task.id === id ? { ...task, ...update } : task) } }))} onToggleTask={(id) => setState((c) => {
            const task = c.tasks.items.find((t) => t.id === id);
            const next = { ...c, tasks: { items: c.tasks.items.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)) } };
            if (!task || task.completed) return next;
            return rewardActivity(next, { type: task.shared ? 'APP_SHARED_TASK_COMPLETED' : 'APP_TASK_COMPLETED', userId: c.activeUserId!, actionId: `task-${id}`, createdAtIso: new Date().toISOString() });
          })} />}
          {activeTab === 'Money' && (
            <MoneyScreen
              money={state.money}
              onAddBill={(bill) =>
                setState((current) => ({
                  ...current,
                  money: { ...current.money, bills: [{ id: `bill-${Date.now()}`, paid: false, ...bill }, ...current.money.bills] }
                }))
              }
              onUpdateBill={(id, update) =>
                setState((current) => ({ ...current, money: { ...current.money, bills: current.money.bills.map((bill) => (bill.id === id ? { ...bill, ...update } : bill)) } }))
              }
              onDuplicateBill={(id) =>
                setState((current) => {
                  const bill = current.money.bills.find((item) => item.id === id);
                  if (!bill) return current;
                  return { ...current, money: { ...current.money, bills: [{ ...bill, id: `bill-${Date.now()}`, paid: false, paidDateIso: undefined, linkedTransactionId: undefined }, ...current.money.bills] } };
                })
              }
              onMarkBillPaid={(id, proofFileName) => setState((current) => {
                const bill = current.money.bills.find((b) => b.id === id);
                const next = { ...current, money: markBillPaidWithOptionalTransaction(current.money, id, proofFileName) };
                if (!bill) return next;
                const dueSoon = bill.dueDateIso >= new Date().toISOString().slice(0, 10);
                return rewardActivity(next, { type: dueSoon ? 'APP_PAYMENT_PAID_ON_TIME' : 'APP_PAYMENT_MARKED_PAID', userId: current.activeUserId!, actionId: `bill-${id}-paid`, createdAtIso: new Date().toISOString() });
              })}
              onAddTransaction={(transaction) => setState((current) => ({ ...current, money: { ...current.money, transactions: [{ id: `tx-${Date.now()}`, ...transaction }, ...current.money.transactions] } }))}
              onUpdateTransaction={(id, transaction) =>
                setState((current) => ({ ...current, money: { ...current.money, transactions: current.money.transactions.map((tx) => (tx.id === id ? { ...tx, ...transaction } : tx)) } }))
              }
              onAddBudget={(budget) => setState((current) => ({ ...current, money: { ...current.money, budgets: [{ id: `budget-${Date.now()}`, ...budget }, ...current.money.budgets] } }))}
              onUpdateBudget={(id, update) =>
                setState((current) => ({ ...current, money: { ...current.money, budgets: current.money.budgets.map((budget) => (budget.id === id ? { ...budget, ...update } : budget)) } }))
              }
              onDeleteBudget={(id) => setState((current) => ({ ...current, money: { ...current.money, budgets: current.money.budgets.filter((budget) => budget.id !== id) } }))}
            />
          )}
          {activeTab === 'More' && <MoreScreen users={state.users} avatars={state.avatars} activeUser={activeUser} setupCompleted={state.setupCompleted} userPins={state.userPins} places={state.places} events={state.calendar.events} tasks={state.tasks.items} avatarGame={state.avatarGame} activeUserId={state.activeUserId} onCareAction={onCareAction} onChangePin={() => false} onSetUserPin={() => undefined} onAddPlace={() => undefined} onUpdatePlace={() => undefined} onExportData={() => JSON.stringify(state, null, 2)} onResetData={() => setState(ensureChallenges(loadState()))} />}
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
