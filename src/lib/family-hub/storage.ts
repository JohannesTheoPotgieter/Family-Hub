import { USERS, type UserId } from './constants.ts';
import { getTodayIso } from './date.ts';
import type { AvatarGameState, AvatarCompanion } from '../../domain/avatarTypes.ts';
import { applyStatDecay } from '../../domain/avatarRewards.ts';
import type { NormalizedCalendar, NormalizedEvent, Provider } from '../../domain/calendar.ts';
import {
  sanitizeAvatar,
  sanitizeCalendarState,
  sanitizeMoneyState,
  toCents
} from '../../domain/sanitize.ts';
import type { PinStore } from './pin.ts';

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  kind?: 'event' | 'appointment';
};

export type CalendarState = {
  events: CalendarEvent[];
  externalEvents: NormalizedEvent[];
  calendars: NormalizedCalendar[];
  lastSyncedAtIsoByProvider: Partial<Record<Provider, string>>;
};

export type TaskCompletionRecord = { completedAtIso: string; userId?: UserId };

export type TaskItem = {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  shared: boolean;
  notes: string;
  ownerId: UserId;
  recurrence?: 'none' | 'daily' | 'weekly';
  archived?: boolean;
  completionCount?: number;
  lastCompletedAtIso?: string;
  completionHistory?: TaskCompletionRecord[];
};

export type Bill = {
  id: string;
  title: string;
  amountCents: number;
  dueDateIso: string;
  category: string;
  paid: boolean;
  paidDateIso?: string;
  proofFileName?: string;
  notes?: string;
  autoCreateTransaction?: boolean;
  linkedTransactionId?: string;
  recurrence?: 'none' | 'monthly';
  recurrenceDay?: number;
  generatedFromBillId?: string;
};

export type MoneyTransaction = {
  id: string;
  title: string;
  amountCents: number;
  dateIso: string;
  kind: 'inflow' | 'outflow';
  category: string;
  notes?: string;
  source: 'manual' | 'bill' | 'statement';
  sourceBillId?: string;
  statementImportId?: string;
  statementFileName?: string;
};

export type Budget = {
  id: string;
  monthIsoYYYYMM: string;
  category: string;
  limitCents: number;
};

export type SavingsGoal = { id: string; title: string; targetCents: number; savedCents: number };

export type PlannerLineItem = {
  id: string;
  category: string;
  description: string;
  kind: 'income' | 'expense';
  isFixed: boolean;
  monthlyOverrides: Record<string, number>;
  defaultAmountCents: number;
  isActive: boolean;
};

export type MoneyState = {
  bills: Bill[];
  transactions: MoneyTransaction[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  plannerItems: PlannerLineItem[];
  plannerOpeningBalance: number;
  settings: {
    currency: 'ZAR';
    monthlyStartDay?: number;
  };
};

export type RecurringPayment = {
  id: string;
  title: string;
  amount: number;
};

export type BudgetCategory = {
  id: string;
  label: string;
  amount: number;
};

export type UserSetupProfile = {
  openingBalance: number;
  monthlyIncome: number;
  recurringPayments: RecurringPayment[];
  budgetCategories: BudgetCategory[];
  avatarName?: string;
};

export type AvatarMood = 'happy' | 'sleepy' | 'excited' | 'proud' | 'silly';

export type AvatarLook = {
  body: 'fox' | 'cat' | 'bear' | 'bunny';
  outfit: 'cozy' | 'sporty' | 'party' | 'explorer';
  accessory: 'none' | 'star' | 'flower' | 'sunglasses';
  collar: 'blue' | 'mint' | 'pink' | 'gold';
};

export type AvatarProfile = {
  mood: AvatarMood;
  points: number;
  familyContribution: number;
  look: AvatarLook;
  inventory: string[];
};

export type PlaceItem = {
  id: string;
  name: string;
  location: string;
  roughCost: string;
  status: 'planning' | 'booked' | 'visited';
  notes: string;
};

export type ReminderItem = {
  id: string;
  title: string;
  date: string;
  level: 'today' | 'week' | 'urgent';
};

export type AppSettings = {
  pinHintsEnabled: boolean;
  familyMode: 'gentle' | 'balanced' | 'focused';
  hideMoneyForKids: boolean;
  requireParentForReset: boolean;
};

export type UserSetup = {
  completed: boolean;
  openingBalance: number;
  monthlyIncome: number;
};

export type AuditEntry = { id: string; type: string; detail: string; createdAtIso: string };

export type FamilyHubState = {
  users: typeof USERS;
  userPins: PinStore;
  setupCompleted: Record<UserId, boolean>;
  userSetupProfiles: Partial<Record<UserId, UserSetupProfile>>;
  activeUserId: UserId | null;
  setupUserId: UserId | null;
  familyPoints: number;
  avatars: Record<UserId, AvatarProfile>;
  avatarGame: AvatarGameState;
  places: PlaceItem[];
  reminders: { items: ReminderItem[] };
  auditLog: AuditEntry[];
  settings: AppSettings;
  calendar: CalendarState;
  tasks: { items: TaskItem[] };
  money: MoneyState;
};

const STORAGE_KEY = 'family-hub-state';
const SETUP_IMPORT_NOTE = 'Imported from setup wizard';

const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
const getMonthEndIso = (monthIsoYYYYMM: string) => {
  const [year, month] = monthIsoYYYYMM.split('-').map(Number);
  return new Date(year, month, 0).toISOString().slice(0, 10);
};

export const seedMoneyFromSetupProfiles = (
  money: MoneyState,
  profiles: Partial<Record<UserId, UserSetupProfile>>
): MoneyState => {
  const entries = Object.entries(profiles) as [UserId, UserSetupProfile][];
  if (!entries.length) return money;

  const todayIso = getTodayIso();
  const currentMonth = todayIso.slice(0, 7);
  const monthEndIso = getMonthEndIso(currentMonth);

  const transactions = [...money.transactions];
  const bills = [...money.bills];
  const budgets = [...money.budgets];

  for (const [userId, profile] of entries) {
    if (profile.openingBalance > 0) {
      const id = `setup-opening-${userId}`;
      if (!transactions.some((tx) => tx.id === id)) {
        transactions.unshift({
          id,
          title: `${USERS.find((user) => user.id === userId)?.name ?? userId} opening balance`,
          amountCents: toCents(profile.openingBalance),
          dateIso: todayIso,
          kind: 'inflow',
          category: 'Starting balance',
          notes: SETUP_IMPORT_NOTE,
          source: 'manual'
        });
      }
    }

    if (profile.monthlyIncome > 0) {
      const id = `setup-income-${userId}-${currentMonth}`;
      if (!transactions.some((tx) => tx.id === id)) {
        transactions.unshift({
          id,
          title: `${USERS.find((user) => user.id === userId)?.name ?? userId} monthly income`,
          amountCents: toCents(profile.monthlyIncome),
          dateIso: `${currentMonth}-01`,
          kind: 'inflow',
          category: 'Income',
          notes: SETUP_IMPORT_NOTE,
          source: 'manual'
        });
      }
    }

    profile.recurringPayments.forEach((payment) => {
      if (payment.amount <= 0) return;
      const id = `setup-bill-${userId}-${payment.id}-${currentMonth}`;
      if (!bills.some((bill) => bill.id === id)) {
        bills.unshift({
          id,
          title: payment.title,
          amountCents: toCents(payment.amount),
          dueDateIso: monthEndIso,
          category: 'Recurring',
          paid: false,
          notes: `${SETUP_IMPORT_NOTE}. Review the due date when you are ready.`,
          autoCreateTransaction: true
        });
      }
    });

    profile.budgetCategories.forEach((budget) => {
      if (budget.amount < 0) return;
      const id = `setup-budget-${userId}-${slugify(budget.label)}-${currentMonth}`;
      if (!budgets.some((item) => item.id === id)) {
        budgets.unshift({
          id,
          monthIsoYYYYMM: currentMonth,
          category: budget.label,
          limitCents: toCents(budget.amount)
        });
      }
    });
  }

  return {
    ...money,
    bills,
    transactions,
    budgets,
    savingsGoals: money.savingsGoals ?? [],
    settings: {
      ...money.settings,
      monthlyStartDay: money.settings.monthlyStartDay ?? 1
    }
  };
};

export const clearSetupArtifactsForUser = (money: MoneyState, userId: UserId): MoneyState => ({
  ...money,
  bills: money.bills.filter((bill) => !bill.id.startsWith(`setup-bill-${userId}-`)),
  transactions: money.transactions.filter((tx) => !tx.id.startsWith(`setup-opening-${userId}`) && !tx.id.startsWith(`setup-income-${userId}-`)),
  budgets: money.budgets.filter((budget) => !budget.id.startsWith(`setup-budget-${userId}-`))
});

export const seedPlannerFromBills = (money: MoneyState): MoneyState => {
  if (money.plannerItems.length > 0) return money;
  const recurringBills = money.bills.filter((bill) => bill.recurrence === 'monthly');
  if (!recurringBills.length) return money;
  return {
    ...money,
    plannerItems: recurringBills.map((bill) => ({
      id: `plan-seed-${bill.id}`,
      category: bill.category || 'Bills',
      description: bill.title,
      kind: 'expense',
      isFixed: true,
      monthlyOverrides: {},
      defaultAmountCents: bill.amountCents,
      isActive: true
    }))
  };
};

const migrateMoney = sanitizeMoneyState;

const setupDefaults: Record<UserId, boolean> = {
  johannes: false,
  nicole: false,
  ella: false,
  oliver: false
};

const avatarDefaults: Record<UserId, AvatarProfile> = {
  johannes: {
    mood: 'happy',
    points: 120,
    familyContribution: 35,
    look: { body: 'fox', outfit: 'cozy', accessory: 'star', collar: 'blue' },
    inventory: ['Snack pouch', 'Glow ball']
  },
  nicole: {
    mood: 'proud',
    points: 140,
    familyContribution: 40,
    look: { body: 'cat', outfit: 'party', accessory: 'flower', collar: 'mint' },
    inventory: ['Sparkle ribbon', 'Picnic coin']
  },
  ella: {
    mood: 'sleepy',
    points: 80,
    familyContribution: 20,
    look: { body: 'bunny', outfit: 'cozy', accessory: 'none', collar: 'pink' },
    inventory: ['Story shell']
  },
  oliver: {
    mood: 'silly',
    points: 90,
    familyContribution: 25,
    look: { body: 'bear', outfit: 'sporty', accessory: 'sunglasses', collar: 'gold' },
    inventory: ['Treasure map']
  }
};



const defaultCompanion = (userId: UserId, name: string, bodyColor: string): AvatarCompanion => ({
  id: `companion-${userId}`,
  userId,
  name: `${name}'s companion`,
  species: userId === 'nicole' ? 'mooncat' : userId === 'ella' ? 'bunny' : userId === 'oliver' ? 'cloudbear' : 'foxling',
  growthStage: 'baby',
  level: 1,
  xp: 0,
  coins: 10,
  stars: 0,
  streakDays: 0,
  completedHouseholdActions: 0,
  rewardedActionIds: [],
  lastInteractionAtIso: new Date().toISOString(),
  lastDecayProcessedAtIso: new Date().toISOString(),
  mood: 'happy',
  personality: 'gentle',
  stats: { energy: 82, hunger: 78, hygiene: 76, happiness: 80, confidence: 62, calm: 68, health: 84 },
  appearance: { bodyColor, eyeStyle: 'round', outfitId: 'outfit-starter', accessoryIds: ['star-pin'], auraColor: '#ffd77a', sparkleStyle: 'stars' },
  room: { backgroundTheme: 'sunny_nook', floorTheme: 'wood_honey', decorationIds: ['plant-small'], wallpaperId: 'cloud-warm', windowStyle: 'arched', plushieIds: ['plushie-moon'] },
  inventory: {
    foods: ['berry-toast', 'honey-porridge'],
    toys: ['starlight-ball', 'story-shell'],
    outfits: ['outfit-starter', 'outfit-cozy-knit', 'outfit-rainbow-hoodie'],
    stickers: ['welcome-star', 'sun-squad'],
    rewards: ['starter-pack'],
    roomDecor: ['moon-lamp', 'cozy-rug', 'wall-stars'],
    accessories: ['star-pin', 'flower-clip', 'mini-scarf']
  }
});

const createInitialAvatarGame = (): AvatarGameState => ({
  version: 2,
  companionsByUserId: {
    johannes: defaultCompanion('johannes', 'Johannes', '#f9b976'),
    nicole: defaultCompanion('nicole', 'Nicole', '#b4b5ff'),
    ella: defaultCompanion('ella', 'Ella', '#ffc4dc'),
    oliver: defaultCompanion('oliver', 'Oliver', '#b0e6ff')
  },
  familyRewardTrack: {
    familyLevel: 1,
    familyStars: 0,
    familyCoins: 0,
    unlockedRoomThemes: ['sunny_nook', 'moonlight_room'],
    unlockedDecor: ['moon-lamp'],
    unlockedSquadRewards: ['welcome-banner']
  },
  familyChallenges: [],
  challengeProgressById: {},
  rewardHistory: []
});

const migrateAvatarGame = (rawGame: any, rawAvatars: any, familyPoints: any, fallback: AvatarGameState): AvatarGameState => {
  if (rawGame?.version === 2 && rawGame?.companionsByUserId) {
    const next = { ...fallback, ...rawGame };
    const now = new Date();
    const companionsByUserId = { ...fallback.companionsByUserId, ...next.companionsByUserId };
    (Object.keys(companionsByUserId) as UserId[]).forEach((id) => {
      const c = companionsByUserId[id];
      const elapsedMs = Math.max(0, now.getTime() - new Date(c.lastDecayProcessedAtIso ?? now.toISOString()).getTime());
      companionsByUserId[id] = applyStatDecay({ ...fallback.companionsByUserId[id], ...c }, Math.min(elapsedMs, 1000 * 60 * 60 * 72));
    });
    return { ...next, companionsByUserId };
  }

  const migrated = createInitialAvatarGame();
  if (rawAvatars) {
    (Object.keys(migrated.companionsByUserId) as UserId[]).forEach((id) => {
      const old = rawAvatars[id];
      if (!old) return;
      migrated.companionsByUserId[id] = {
        ...migrated.companionsByUserId[id],
        level: Math.max(1, Math.floor((old.points ?? 0) / 80) + 1),
        xp: (old.points ?? 0) % 100,
        stars: Math.floor((old.familyContribution ?? 0) / 10),
        coins: 10 + Math.floor((old.points ?? 0) / 12),
        mood: old.mood === 'excited' ? 'playful' : old.mood === 'silly' ? 'curious' : old.mood ?? 'happy',
        inventory: { ...migrated.companionsByUserId[id].inventory, rewards: [...migrated.companionsByUserId[id].inventory.rewards, ...(old.inventory ?? [])] }
      };
    });
  }
  migrated.familyRewardTrack.familyStars = Math.floor((typeof familyPoints === 'number' ? familyPoints : 0) / 8);
  return migrated;
};
export const createInitialState = (): FamilyHubState => ({
  users: USERS,
  userPins: {},
  setupCompleted: { ...setupDefaults },
  userSetupProfiles: {},
  activeUserId: null,
  setupUserId: null,
  familyPoints: 0,
  avatars: { ...avatarDefaults },
  avatarGame: createInitialAvatarGame(),
  places: [],
  reminders: { items: [] },
  auditLog: [],
  settings: { pinHintsEnabled: false, familyMode: 'balanced', hideMoneyForKids: true, requireParentForReset: true },
  calendar: { events: [], externalEvents: [], calendars: [], lastSyncedAtIsoByProvider: {} },
  tasks: { items: [] },
  money: {
    bills: [],
    transactions: [],
    budgets: [],
    savingsGoals: [
      { id: 'goal-emergency', title: 'Emergency cushion', targetCents: 1500000, savedCents: 0 },
      { id: 'goal-family-fun', title: 'Family fun day', targetCents: 350000, savedCents: 0 }
    ],
    plannerItems: [],
    plannerOpeningBalance: 0,
    settings: { currency: 'ZAR' }
  }
});

export const loadState = (): FamilyHubState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createInitialState();

  try {
    const parsed = JSON.parse(raw) as Partial<FamilyHubState>;
    const initial = createInitialState();
    const userSetupProfiles = parsed.userSetupProfiles ?? {};
    const migratedMoney = seedMoneyFromSetupProfiles(migrateMoney((parsed.money as any) ?? {}), userSetupProfiles);

    const parsedTasks = parsed.tasks?.items ?? [];

    return {
      ...initial,
      ...parsed,
      users: USERS,
      activeUserId: null,
      setupUserId: null,
      setupCompleted: { ...initial.setupCompleted, ...(parsed.setupCompleted ?? {}) },
      userSetupProfiles,
      familyPoints: typeof parsed.familyPoints === 'number' ? parsed.familyPoints : initial.familyPoints,
      avatars: {
        johannes: sanitizeAvatar(parsed.avatars?.johannes, initial.avatars.johannes),
        nicole: sanitizeAvatar(parsed.avatars?.nicole, initial.avatars.nicole),
        ella: sanitizeAvatar(parsed.avatars?.ella, initial.avatars.ella),
        oliver: sanitizeAvatar(parsed.avatars?.oliver, initial.avatars.oliver)
      },
      avatarGame: migrateAvatarGame((parsed as any).avatarGame, parsed.avatars, parsed.familyPoints, initial.avatarGame),
      places: (parsed.places ?? [])
        .filter(
          (place) =>
            typeof place.id === 'string' &&
            typeof place.name === 'string' &&
            typeof place.location === 'string' &&
            typeof place.roughCost === 'string' &&
            typeof place.notes === 'string'
        )
        .map((place) => ({
          ...place,
          status: place.status === 'booked' || place.status === 'visited' ? place.status : 'planning'
        })),
      reminders: {
        items: (parsed.reminders?.items ?? []).filter(
          (item) => typeof item.id === 'string' && typeof item.title === 'string' && typeof item.date === 'string'
        )
      },
      auditLog: Array.isArray((parsed as any).auditLog) ? (parsed as any).auditLog.filter((item: any) => item?.id && item?.type && item?.createdAtIso).slice(0, 60) : [],
      settings: {
        pinHintsEnabled: Boolean(parsed.settings?.pinHintsEnabled),
        familyMode: parsed.settings?.familyMode === 'gentle' || parsed.settings?.familyMode === 'focused' ? parsed.settings.familyMode : 'balanced',
        hideMoneyForKids: parsed.settings?.hideMoneyForKids !== false,
        requireParentForReset: parsed.settings?.requireParentForReset !== false
      },
      calendar: sanitizeCalendarState(parsed.calendar),
      tasks: {
        items: parsedTasks
          .map((task) => ({
            ...task,
            dueDate: task.dueDate ?? null,
            shared: task.shared ?? false,
            notes: task.notes ?? '',
            ownerId: task.ownerId ?? 'johannes',
            recurrence: (task.recurrence === 'daily' || task.recurrence === 'weekly' ? task.recurrence : 'none') as 'none' | 'daily' | 'weekly',
            archived: Boolean(task.archived),
            completionCount: typeof task.completionCount === 'number' ? task.completionCount : task.completed ? 1 : 0,
            lastCompletedAtIso: typeof task.lastCompletedAtIso === 'string' ? task.lastCompletedAtIso : undefined,
            completionHistory: Array.isArray(task.completionHistory) ? task.completionHistory.filter((entry: any) => typeof entry?.completedAtIso === 'string').slice(0, 12) : []
          }))
          .filter((task) => typeof task.id === 'string' && typeof task.title === 'string' && typeof task.completed === 'boolean')
      },
      money: migratedMoney
    };
  } catch {
    return createInitialState();
  }
};

export const saveState = (state: FamilyHubState) => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...state,
      activeUserId: null,
      setupUserId: null
    } satisfies FamilyHubState)
  );
};

export const clearState = () => {
  localStorage.removeItem(STORAGE_KEY);
};
