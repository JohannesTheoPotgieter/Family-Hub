import { USERS, type UserId } from './constants';
import type { AvatarGameState, AvatarCompanion } from '../../domain/avatarTypes';
import { applyStatDecay } from '../../domain/avatarRewards';
import type { PinStore } from './pin';

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  kind?: 'event' | 'appointment';
};

export type TaskItem = {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  shared: boolean;
  notes: string;
  ownerId: UserId;
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
};

export type MoneyTransaction = {
  id: string;
  title: string;
  amountCents: number;
  dateIso: string;
  kind: 'inflow' | 'outflow';
  category: string;
  notes?: string;
  source: 'manual' | 'bill';
  sourceBillId?: string;
};

export type Budget = {
  id: string;
  monthIsoYYYYMM: string;
  category: string;
  limitCents: number;
};

export type MoneyState = {
  bills: Bill[];
  transactions: MoneyTransaction[];
  budgets: Budget[];
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
};

export type UserSetup = {
  completed: boolean;
  openingBalance: number;
  monthlyIncome: number;
};

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
  settings: AppSettings;
  calendar: { events: CalendarEvent[] };
  tasks: { items: TaskItem[] };
  money: MoneyState;
};

const STORAGE_KEY = 'family-hub-state';

const toCents = (value: unknown) => (typeof value === 'number' ? Math.round(value * 100) : 0);

const migrateMoney = (rawMoney: Partial<MoneyState> & { payments?: any[]; actualTransactions?: any[] }) : MoneyState => {
  const bills = Array.isArray(rawMoney.bills)
    ? rawMoney.bills
    : (rawMoney.payments ?? []).map((payment) => ({
        id: typeof payment.id === 'string' ? payment.id : `bill-${Date.now()}-${Math.random()}`,
        title: typeof payment.title === 'string' ? payment.title : 'Bill',
        amountCents: typeof payment.amountCents === 'number' ? payment.amountCents : toCents(payment.amount),
        dueDateIso: typeof payment.dueDateIso === 'string' ? payment.dueDateIso : typeof payment.dueDate === 'string' ? payment.dueDate : new Date().toISOString().slice(0, 10),
        category: typeof payment.category === 'string' ? payment.category : 'Other',
        paid: Boolean(payment.paid),
        paidDateIso: typeof payment.paidDateIso === 'string' ? payment.paidDateIso : typeof payment.paidDate === 'string' ? payment.paidDate : undefined,
        proofFileName: typeof payment.proofFileName === 'string' ? payment.proofFileName : undefined,
        notes: typeof payment.notes === 'string' ? payment.notes : undefined,
        autoCreateTransaction: payment.autoCreateTransaction !== false,
        linkedTransactionId: typeof payment.linkedTransactionId === 'string' ? payment.linkedTransactionId : undefined
      }));

  const transactions = Array.isArray(rawMoney.transactions)
    ? rawMoney.transactions
    : (rawMoney.actualTransactions ?? []).map((tx) => ({
        id: typeof tx.id === 'string' ? tx.id : `tx-${Date.now()}-${Math.random()}`,
        title: typeof tx.title === 'string' ? tx.title : 'Transaction',
        amountCents: typeof tx.amountCents === 'number' ? tx.amountCents : toCents(tx.amount),
        dateIso: typeof tx.dateIso === 'string' ? tx.dateIso : typeof tx.date === 'string' ? tx.date : new Date().toISOString().slice(0, 10),
        kind: (tx.kind === 'inflow' ? 'inflow' : 'outflow') as 'inflow' | 'outflow',
        category: typeof tx.category === 'string' ? tx.category : 'Other',
        notes: typeof tx.notes === 'string' ? tx.notes : undefined,
        source: (tx.source === 'bill' ? 'bill' : 'manual') as 'manual' | 'bill',
        sourceBillId: typeof tx.sourceBillId === 'string' ? tx.sourceBillId : typeof tx.sourcePaymentId === 'string' ? tx.sourcePaymentId : undefined
      }));

  const budgets = Array.isArray(rawMoney.budgets)
    ? rawMoney.budgets.filter((budget): budget is Budget => Boolean(budget?.id && budget?.monthIsoYYYYMM && budget?.category))
    : [];

  return {
    bills,
    transactions,
    budgets,
    settings: {
      currency: 'ZAR',
      monthlyStartDay: typeof rawMoney.settings?.monthlyStartDay === 'number' ? rawMoney.settings.monthlyStartDay : undefined
    }
  };
};

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

const sanitizeAvatar = (avatar: Partial<AvatarProfile> | undefined, fallback: AvatarProfile): AvatarProfile => ({
  mood: avatar?.mood && ['happy', 'sleepy', 'excited', 'proud', 'silly'].includes(avatar.mood) ? avatar.mood : fallback.mood,
  points: typeof avatar?.points === 'number' ? avatar.points : fallback.points,
  familyContribution: typeof avatar?.familyContribution === 'number' ? avatar.familyContribution : fallback.familyContribution,
  look: {
    body: avatar?.look?.body && ['fox', 'cat', 'bear', 'bunny'].includes(avatar.look.body) ? avatar.look.body : fallback.look.body,
    outfit:
      avatar?.look?.outfit && ['cozy', 'sporty', 'party', 'explorer'].includes(avatar.look.outfit)
        ? avatar.look.outfit
        : fallback.look.outfit,
    accessory:
      avatar?.look?.accessory && ['none', 'star', 'flower', 'sunglasses'].includes(avatar.look.accessory)
        ? avatar.look.accessory
        : fallback.look.accessory,
    collar:
      avatar?.look?.collar && ['blue', 'mint', 'pink', 'gold'].includes(avatar.look.collar)
        ? avatar.look.collar
        : fallback.look.collar
  },
  inventory: Array.isArray(avatar?.inventory) ? avatar.inventory.filter((item): item is string => typeof item === 'string') : fallback.inventory
});



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
  settings: { pinHintsEnabled: false },
  calendar: { events: [] },
  tasks: { items: [] },
  money: {
    bills: [],
    transactions: [],
    budgets: [],
    settings: { currency: 'ZAR' }
  }
});

export const loadState = (): FamilyHubState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createInitialState();

  try {
    const parsed = JSON.parse(raw) as Partial<FamilyHubState>;
    const initial = createInitialState();

    const parsedTasks = parsed.tasks?.items ?? [];

    return {
      ...initial,
      ...parsed,
      users: USERS,
      setupCompleted: { ...initial.setupCompleted, ...(parsed.setupCompleted ?? {}) },
      userSetupProfiles: parsed.userSetupProfiles ?? {},
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
      settings: {
        pinHintsEnabled: Boolean(parsed.settings?.pinHintsEnabled)
      },
      calendar: {
        events: (parsed.calendar?.events ?? [])
          .filter((event) => typeof event.id === 'string' && typeof event.title === 'string' && typeof event.date === 'string')
          .map((event) => ({
            ...event,
            kind: event.kind === 'appointment' ? 'appointment' : 'event'
          }))
      },
      tasks: {
        items: parsedTasks
          .map((task) => ({
            ...task,
            dueDate: task.dueDate ?? null,
            shared: task.shared ?? false,
            notes: task.notes ?? '',
            ownerId: task.ownerId ?? 'johannes'
          }))
          .filter((task) => typeof task.id === 'string' && typeof task.title === 'string' && typeof task.completed === 'boolean')
      },
      money: migrateMoney((parsed.money as any) ?? {})
    };
  } catch {
    return createInitialState();
  }
};

export const saveState = (state: FamilyHubState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};
