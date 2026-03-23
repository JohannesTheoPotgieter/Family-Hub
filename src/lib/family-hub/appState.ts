import { applyActivityReward, applyChallengeContribution, applyFamilyChallengeReward } from '../../domain/avatarRewards.ts';
import type { AvatarActivityEvent } from '../../domain/avatarTypes.ts';
import type { NormalizedCalendar, NormalizedEvent, Provider } from '../../domain/calendar.ts';
import { toDedupeKey } from '../../domain/calendar.ts';
import type { Tab, UserId } from './constants.ts';
import { getInitialRouteFromLocation } from '../../routing/routeHelpers.ts';
import { deleteBillAndLinkedTransaction, deleteTransactionAndUnlinkBills, markBillPaidWithOptionalTransaction, saveBudget, type BudgetSaveResult } from './money.ts';
import { clearSetupArtifactsForUser, createInitialState, seedMoneyFromSetupProfiles, type Bill, type FamilyHubState, type MoneyTransaction, type TaskItem, type UserSetupProfile } from './storage.ts';

const addDays = (dateIso: string, days: number) => {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const nextMonthlyDueDate = (dateIso: string, preferredDay?: number) => {
  const [year, month, day] = dateIso.split('-').map(Number);
  const next = new Date(year, month, 1);
  const targetDay = preferredDay ?? day ?? 1;
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(targetDay, lastDay));
  return next.toISOString().slice(0, 10);
};

export const ensureChallenges = (state: FamilyHubState): FamilyHubState => {
  if (state.avatarGame.familyChallenges.length) return state;
  const now = new Date();
  const start = now.toISOString();
  const weekEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const monthEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();
  const challenges = [
    { id: 'challenge-tasks-week', title: 'Together task burst', description: 'Finish 5 household tasks together this week.', category: 'tasks', cadence: 'weekly', targetType: 'count', targetValue: 5, progressValue: 0, rewardType: 'room_unlock', rewardPayload: 'moon-lamp', startsAtIso: start, endsAtIso: weekEnd, completed: false, participantUserIds: state.users.map((user) => user.id) },
    { id: 'challenge-plan-month', title: 'Cozy planning circle', description: 'Plan 3 family events this month.', category: 'planning', cadence: 'monthly', targetType: 'count', targetValue: 3, progressValue: 0, rewardType: 'stars', startsAtIso: start, endsAtIso: monthEnd, completed: false, participantUserIds: state.users.map((user) => user.id) },
    { id: 'challenge-money-month', title: 'Bright budget month', description: 'Pay bills on time as a family this month.', category: 'money', cadence: 'monthly', targetType: 'count', targetValue: 3, progressValue: 0, rewardType: 'family_theme', rewardPayload: 'cozy-study', startsAtIso: start, endsAtIso: monthEnd, completed: false, participantUserIds: state.users.map((user) => user.id) }
  ] as FamilyHubState['avatarGame']['familyChallenges'];
  const progressById = Object.fromEntries(challenges.map((item) => [item.id, { challengeId: item.id, contributionsByUserId: {}, contributingActionIds: [] }]));
  return { ...state, avatarGame: { ...state.avatarGame, familyChallenges: challenges, challengeProgressById: progressById } };
};

export const getInitialTab = (): Tab => getInitialRouteFromLocation(window.location.search);

export const dedupeExternalEvents = (events: NormalizedEvent[]) => {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = toDedupeKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const rewardActivity = (current: FamilyHubState, event: AvatarActivityEvent) => {
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

export const applyCareAction = (current: FamilyHubState, userId: UserId, action: 'feed' | 'play' | 'clean' | 'rest' | 'pet' | 'story') => {
  const companion = current.avatarGame.companionsByUserId[userId];
  if (!companion) return current;
  const buff: Partial<typeof companion.stats> =
    action === 'feed' ? { hunger: 16, happiness: 4 }
      : action === 'play' ? { happiness: 12, energy: -6 }
        : action === 'clean' ? { hygiene: 18, calm: 4 }
          : action === 'rest' ? { energy: 22, calm: 8 }
            : action === 'pet' ? { happiness: 6 }
              : { calm: 10, happiness: 6 };

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

  return {
    ...current,
    avatarGame: {
      ...current.avatarGame,
      companionsByUserId: {
        ...current.avatarGame.companionsByUserId,
        [userId]: { ...companion, stats, lastInteractionAtIso: new Date().toISOString() }
      }
    }
  };
};

export const buildRestartSetupState = (current: FamilyHubState, userId: UserId, startSetup: boolean): FamilyHubState => {
  const nextPins = { ...current.userPins };
  delete nextPins[userId];
  const nextProfiles = { ...current.userSetupProfiles };
  delete nextProfiles[userId];
  return {
    ...current,
    activeUserId: startSetup ? null : current.activeUserId,
    setupUserId: startSetup ? userId : current.setupUserId,
    userPins: nextPins,
    userSetupProfiles: nextProfiles,
    setupCompleted: { ...current.setupCompleted, [userId]: false },
    money: clearSetupArtifactsForUser(current.money, userId)
  };
};

export const completeUserSetup = (
  current: FamilyHubState,
  userId: UserId,
  encodedPin: string,
  profile: UserSetupProfile
): FamilyHubState => {
  const userSetupProfiles = { ...current.userSetupProfiles, [userId]: profile };
  return {
    ...current,
    activeUserId: userId,
    setupUserId: null,
    userPins: { ...current.userPins, [userId]: encodedPin },
    userSetupProfiles,
    setupCompleted: { ...current.setupCompleted, [userId]: true },
    money: seedMoneyFromSetupProfiles(current.money, { [userId]: profile })
  };
};

export const createResetState = () => ensureChallenges(createInitialState());

export const applyCalendarSync = (current: FamilyHubState, provider: Provider, calendars: NormalizedCalendar[], events: NormalizedEvent[]) => ({
  ...current,
  calendar: {
    ...current.calendar,
    calendars: [...current.calendar.calendars.filter((item) => item.provider !== provider), ...calendars],
    externalEvents: dedupeExternalEvents([...current.calendar.externalEvents.filter((item) => item.provider !== provider), ...events]),
    lastSyncedAtIsoByProvider: {
      ...current.calendar.lastSyncedAtIsoByProvider,
      [provider]: new Date().toISOString()
    }
  }
});

export const clearCalendarProviderData = (current: FamilyHubState, provider: Provider) => {
  const nextLastSynced = { ...current.calendar.lastSyncedAtIsoByProvider };
  delete nextLastSynced[provider];
  return {
    ...current,
    calendar: {
      ...current.calendar,
      calendars: current.calendar.calendars.filter((item) => item.provider !== provider),
      externalEvents: current.calendar.externalEvents.filter((item) => item.provider !== provider),
      lastSyncedAtIsoByProvider: nextLastSynced
    }
  };
};

export const addInternalCalendarEvent = (current: FamilyHubState, event: Omit<{ id: string } & FamilyHubState['calendar']['events'][number], 'id'>) =>
  rewardActivity(
    { ...current, calendar: { ...current.calendar, events: [{ id: `event-${Date.now()}`, ...event }, ...current.calendar.events] } },
    { type: 'APP_CALENDAR_EVENT_ADDED', userId: current.activeUserId!, actionId: `event-${event.title}-${event.date}`, createdAtIso: new Date().toISOString() }
  );

export const addTask = (current: FamilyHubState, task: Omit<TaskItem, 'id' | 'completed'>): FamilyHubState => ({
  ...current,
  tasks: { items: [{ id: `task-${Date.now()}`, completed: false, completionCount: 0, completionHistory: [], recurrence: 'none' as const, archived: false, ...task }, ...current.tasks.items] }
});

export const updateTask = (current: FamilyHubState, id: string, update: Omit<TaskItem, 'id' | 'completed'>): FamilyHubState => ({
  ...current,
  tasks: { items: current.tasks.items.map((task) => (task.id === id ? { ...task, ...update } : task)) }
});

export const toggleTask = (current: FamilyHubState, id: string) => {
  const task = current.tasks.items.find((item) => item.id === id);
  if (!task) return current;
  const nowIso = new Date().toISOString();
  const toggledComplete = !task.completed;
  const nextTask = toggledComplete
    ? {
        ...task,
        completed: task.recurrence && task.recurrence !== 'none' ? false : true,
        dueDate: task.recurrence === 'daily' && task.dueDate ? addDays(task.dueDate, 1) : task.recurrence === 'weekly' && task.dueDate ? addDays(task.dueDate, 7) : task.dueDate,
        completionCount: (task.completionCount ?? 0) + 1,
        lastCompletedAtIso: nowIso,
        completionHistory: [{ completedAtIso: nowIso, userId: current.activeUserId ?? undefined }, ...(task.completionHistory ?? [])].slice(0, 12)
      }
    : { ...task, completed: false };
  const next = { ...current, tasks: { items: current.tasks.items.map((item) => (item.id === id ? nextTask : item)) } };
  if (!toggledComplete) return next;
  return rewardActivity(next, { type: task.shared ? 'APP_SHARED_TASK_COMPLETED' : 'APP_TASK_COMPLETED', userId: current.activeUserId!, actionId: `task-${id}-${nextTask.completionCount}`, createdAtIso: nowIso });
};

export const addBill = (current: FamilyHubState, bill: Omit<Bill, 'id' | 'paid' | 'paidDateIso' | 'proofFileName' | 'linkedTransactionId'>): FamilyHubState => ({
  ...current,
  money: { ...current.money, bills: [{ id: `bill-${Date.now()}`, paid: false, recurrence: 'none' as const, recurrenceDay: Number(bill.dueDateIso.slice(8, 10)), ...bill }, ...current.money.bills] }
});

export const updateBill = (current: FamilyHubState, id: string, update: Partial<Bill>): FamilyHubState => ({
  ...current,
  money: { ...current.money, bills: current.money.bills.map((bill) => (bill.id === id ? { ...bill, ...update } : bill)) }
});

export const duplicateBill = (current: FamilyHubState, id: string) => {
  const bill = current.money.bills.find((item) => item.id === id);
  if (!bill) return current;
  return { ...current, money: { ...current.money, bills: [{ ...bill, id: `bill-${Date.now()}`, paid: false, paidDateIso: undefined, linkedTransactionId: undefined }, ...current.money.bills] } };
};

export const markBillPaid = (current: FamilyHubState, id: string, proofFileName: string) => {
  const bill = current.money.bills.find((item) => item.id === id);
  let next = { ...current, money: markBillPaidWithOptionalTransaction(current.money, id, proofFileName) };
  if (bill?.recurrence === 'monthly') {
    const nextDueDateIso = nextMonthlyDueDate(bill.dueDateIso, bill.recurrenceDay);
    const duplicateExists = next.money.bills.some((item) => item.generatedFromBillId === bill.id && item.dueDateIso === nextDueDateIso);
    if (!duplicateExists) {
      next = {
        ...next,
        money: {
          ...next.money,
          bills: [
            {
              ...bill,
              id: `bill-${Date.now()}-next`,
              dueDateIso: nextDueDateIso,
              paid: false,
              paidDateIso: undefined,
              proofFileName: undefined,
              linkedTransactionId: undefined,
              generatedFromBillId: bill.id
            },
            ...next.money.bills
          ]
        }
      };
    }
  }
  if (!bill) return next;
  const dueSoon = bill.dueDateIso >= new Date().toISOString().slice(0, 10);
  return rewardActivity(next, { type: dueSoon ? 'APP_PAYMENT_PAID_ON_TIME' : 'APP_PAYMENT_MARKED_PAID', userId: current.activeUserId!, actionId: `bill-${id}-paid`, createdAtIso: new Date().toISOString() });
};

export const deleteBill = (current: FamilyHubState, id: string) => ({ ...current, money: deleteBillAndLinkedTransaction(current.money, id) });
export const addTransaction = (current: FamilyHubState, transaction: Omit<MoneyTransaction, 'id'>) => ({ ...current, money: { ...current.money, transactions: [{ id: `tx-${Date.now()}`, ...transaction }, ...current.money.transactions] } });
export const importTransactions = (current: FamilyHubState, transactions: Array<Omit<MoneyTransaction, 'id'>>) => ({ ...current, money: { ...current.money, transactions: [...transactions.map((transaction, index) => ({ id: `tx-${Date.now()}-${index}-${crypto.randomUUID()}`, ...transaction })), ...current.money.transactions] } });
export const updateTransaction = (current: FamilyHubState, id: string, transaction: Omit<MoneyTransaction, 'id'>) => ({ ...current, money: { ...current.money, transactions: current.money.transactions.map((tx) => (tx.id === id ? { ...tx, ...transaction } : tx)) } });
export const deleteTransaction = (current: FamilyHubState, id: string) => ({ ...current, money: deleteTransactionAndUnlinkBills(current.money, id) });
export const saveMoneyBudget = (current: FamilyHubState, budget: Omit<import('./storage.ts').Budget, 'id'>): { state: FamilyHubState; result: BudgetSaveResult } => {
  const result = saveBudget(current.money, budget);
  return { state: { ...current, money: result.state }, result };
};
