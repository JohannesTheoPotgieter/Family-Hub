import { USERS, type UserId } from './constants';
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

export type PaymentItem = {
  id: string;
  title: string;
  category: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  autoCreateTransaction?: boolean;
  proofFileName?: string;
  linkedTransactionId?: string;
  paidDate?: string;
};

export type ActualTransaction = {
  id: string;
  title: string;
  amount: number;
  date: string;
  kind: 'inflow' | 'outflow';
  category?: string;
  receiptImage?: string;
  receiptFileName?: string;
  sourcePaymentId?: string;
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

export type CashflowItem = {
  id: string;
  title: string;
  date: string;
  amount: number;
  kind: 'planned' | 'actual';
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
  places: PlaceItem[];
  reminders: { items: ReminderItem[] };
  settings: AppSettings;
  calendar: { events: CalendarEvent[] };
  tasks: { items: TaskItem[] };
  money: {
    payments: PaymentItem[];
    actualTransactions: ActualTransaction[];
    cashflowItems?: CashflowItem[];
  };
};

const STORAGE_KEY = 'family-hub-state';

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

export const createInitialState = (): FamilyHubState => ({
  users: USERS,
  userPins: {},
  setupCompleted: { ...setupDefaults },
  userSetupProfiles: {},
  activeUserId: null,
  setupUserId: null,
  familyPoints: 0,
  avatars: { ...avatarDefaults },
  places: [],
  reminders: { items: [] },
  settings: { pinHintsEnabled: false },
  calendar: { events: [] },
  tasks: { items: [] },
  money: {
    payments: [],
    actualTransactions: [],
    cashflowItems: []
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
      money: {
        payments: (parsed.money?.payments ?? [])
          .filter(
            (payment) =>
              typeof payment.id === 'string' &&
              typeof payment.title === 'string' &&
              typeof payment.amount === 'number' &&
              typeof payment.dueDate === 'string' &&
              typeof payment.paid === 'boolean'
          )
          .map((payment) => ({
            ...payment,
            category: typeof payment.category === 'string' ? payment.category : 'Other',
            autoCreateTransaction: payment.autoCreateTransaction !== false,
            proofFileName: typeof payment.proofFileName === 'string' ? payment.proofFileName : undefined,
            linkedTransactionId: typeof payment.linkedTransactionId === 'string' ? payment.linkedTransactionId : undefined,
            paidDate: typeof payment.paidDate === 'string' ? payment.paidDate : undefined
          })),
        actualTransactions: (parsed.money?.actualTransactions ?? [])
          .filter(
            (tx) =>
              typeof tx.id === 'string' &&
              typeof tx.title === 'string' &&
              typeof tx.amount === 'number' &&
              typeof tx.date === 'string' &&
              (tx.kind === 'inflow' || tx.kind === 'outflow')
          )
          .map((tx) => ({
            ...tx,
            category: typeof tx.category === 'string' ? tx.category : undefined,
            receiptImage: typeof tx.receiptImage === 'string' ? tx.receiptImage : undefined,
            receiptFileName: typeof tx.receiptFileName === 'string' ? tx.receiptFileName : undefined
          })),
        cashflowItems: (parsed.money?.cashflowItems ?? []).filter(
          (item) =>
            typeof item.id === 'string' &&
            typeof item.title === 'string' &&
            typeof item.date === 'string' &&
            typeof item.amount === 'number' &&
            (item.kind === 'planned' || item.kind === 'actual')
        )
      }
    };
  } catch {
    return createInitialState();
  }
};

export const saveState = (state: FamilyHubState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};
